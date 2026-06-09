from fastapi import FastAPI, HTTPException, Query, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types
from dotenv import load_dotenv
from threading import Lock, Thread
import os, httpx, time
from datetime import date as _date

load_dotenv()

# ── Gemini ───────────────────────────────────────────────────────────────────
gemini = genai.Client(api_key=os.getenv("GEMINI_API"))

# ── Football-data.org ────────────────────────────────────────────────────────
FOOTBALL_KEY  = os.getenv("FOOTBALL_API_KEY", "")
FOOTBALL_BASE = "https://api.football-data.org/v4"
_FBD_HEADERS  = {"X-Auth-Token": FOOTBALL_KEY}

TOP5_CODES = ["PL", "PD", "BL1", "SA", "FL1"]
TOP5_NAMES = {
    "PL":  "Premier League",
    "PD":  "La Liga",
    "BL1": "Bundesliga",
    "SA":  "Serie A",
    "FL1": "Ligue 1",
}

# ── In-memory cache ───────────────────────────────────────────────────────────
_all_teams_flat: list       = []
_scorers_by_id:  dict       = {}
_scorers_flat:   list       = []
_cache_date:     _date|None = None
_cache_lock:     Lock       = Lock()
_cache_ready:    bool       = False
_cache_errors:   list       = []
_key_present:    bool       = bool(os.getenv("FOOTBALL_API_KEY", ""))


def _get(path: str, timeout: int = 8) -> dict:
    with httpx.Client(timeout=timeout) as c:
        r = c.get(f"{FOOTBALL_BASE}{path}", headers=_FBD_HEADERS)
        if r.status_code == 429:
            raise HTTPException(429, "Football API rate limit — wait a moment.")
        if r.status_code == 403:
            raise HTTPException(403, "Football API access denied. Check FOOTBALL_API_KEY.")
        if r.status_code == 404:
            raise HTTPException(404, "Not found.")
        r.raise_for_status()
        return r.json()


def _load_global_cache() -> None:
    global _all_teams_flat, _scorers_by_id, _scorers_flat, _cache_date, _cache_ready, _cache_errors

    new_teams:    list     = []
    new_scorers:  list     = []
    seen_team_ids: set[int] = set()
    errors: list = []
    print(f"[football cache] starting load, key_present={_key_present}")

    try:
        for code in TOP5_CODES:
            time.sleep(6.5)  # 10 req/min limit = 6s minimum between calls
            try:
                td = _get(f"/competitions/{code}/teams")
                for t in td.get("teams", []):
                    if t["id"] not in seen_team_ids:
                        seen_team_ids.add(t["id"])
                        new_teams.append({
                            "id":          t["id"],
                            "name":        t.get("name", ""),
                            "shortName":   t.get("shortName") or t.get("name", ""),
                            "tla":         t.get("tla", ""),
                            "crest":       t.get("crest", ""),
                            "competition": {"code": code, "name": TOP5_NAMES[code]},
                        })
            except Exception as e:
                msg = f"teams/{code}: {e}"
                errors.append(msg)
                print(f"[football cache] {msg}")

            time.sleep(6.5)
            try:
                sd = _get(f"/competitions/{code}/scorers?limit=100")
                for s in sd.get("scorers", []):
                    p  = s.get("player", {})
                    tm = s.get("team",   {})
                    new_scorers.append({
                        "id":              p.get("id"),
                        "name":            p.get("name", ""),
                        "position":        p.get("position") or p.get("section", ""),
                        "nationality":     p.get("nationality", ""),
                        "teamId":          tm.get("id"),
                        "teamName":        tm.get("shortName") or tm.get("name", ""),
                        "teamCrest":       tm.get("crest", ""),
                        "competitionCode": code,
                        "competitionName": TOP5_NAMES[code],
                        "goals":           s.get("goals")        or 0,
                        "assists":         s.get("assists")       or 0,
                        "playedMatches":   s.get("playedMatches") or 0,
                        "penalties":       s.get("penalties"),
                    })
            except Exception as e:
                msg = f"scorers/{code}: {e}"
                errors.append(msg)
                print(f"[football cache] {msg}")

        _all_teams_flat = sorted(new_teams, key=lambda x: x["name"])
        _scorers_flat   = new_scorers
        _scorers_by_id  = {e["id"]: e for e in new_scorers if e["id"]}
        _cache_date     = _date.today()

    except Exception as e:
        errors.append(f"FATAL: {e}")
        print(f"[football cache] FATAL: {e}")
    finally:
        _cache_errors = errors
        _cache_ready  = True
        print(f"[football cache] done: {len(_all_teams_flat)} teams, {len(_scorers_flat)} scorers, {len(errors)} errors")


def _ensure_cache() -> None:
    with _cache_lock:
        if _cache_date != _date.today() or not _all_teams_flat:
            _load_global_cache()


# Start cache loading when module is imported (works for both standalone and merged)
Thread(target=_ensure_cache, daemon=True).start()


# ── Helpers ───────────────────────────────────────────────────────────────────
def _parse_finished_matches(team_id: int, raw: list) -> list:
    out = []
    for m in raw:
        if m.get("status") != "FINISHED":
            continue
        home    = m.get("homeTeam", {})
        away    = m.get("awayTeam", {})
        ft      = m.get("score", {}).get("fullTime", {})
        is_home = home.get("id") == team_id
        gf = ft.get("home" if is_home else "away")
        ga = ft.get("away" if is_home else "home")
        if gf is None or ga is None:
            continue
        opp = away if is_home else home
        res = "W" if gf > ga else ("D" if gf == ga else "L")
        out.append({
            "matchId":       m["id"],
            "date":          (m.get("utcDate") or "")[:10],
            "competition":   m.get("competition", {}).get("name", ""),
            "opponent":      opp.get("shortName") or opp.get("name") or "Unknown",
            "opponentCrest": opp.get("crest", ""),
            "homeAway":      "HOME" if is_home else "AWAY",
            "goalsFor":      int(gf),
            "goalsAgainst":  int(ga),
            "result":        res,
            "score":         f"{gf}-{ga}",
        })
    out.sort(key=lambda x: x["date"], reverse=True)
    return out


def _get_next_match(team_id: int) -> dict | None:
    try:
        data = _get(f"/teams/{team_id}/matches?status=SCHEDULED&limit=3")
        for nm in data.get("matches", []):
            h = nm.get("homeTeam", {}); a = nm.get("awayTeam", {})
            is_home = h.get("id") == team_id
            opp = a if is_home else h
            return {
                "date":          (nm.get("utcDate") or "")[:10],
                "opponent":      opp.get("shortName") or opp.get("name", ""),
                "opponentCrest": opp.get("crest", ""),
                "homeAway":      "HOME" if is_home else "AWAY",
                "competition":   nm.get("competition", {}).get("name", ""),
            }
    except Exception:
        pass
    return None


def _standings_for_team(team_id: int, competition_code: str) -> dict | None:
    try:
        data = _get(f"/competitions/{competition_code}/standings")
        for group in data.get("standings", []):
            for entry in group.get("table", []):
                if entry.get("team", {}).get("id") == team_id:
                    return entry
    except Exception:
        pass
    return None


def _calc_age(dob: str) -> int | None:
    if not dob:
        return None
    try:
        bd    = _date.fromisoformat(dob[:10])
        today = _date.today()
        return today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
    except Exception:
        return None


# ── Router ────────────────────────────────────────────────────────────────────
football_router = APIRouter()


@football_router.get("/football/health")
def health():
    return {
        "status":     "ok",
        "cacheReady": _cache_ready,
        "teams":      len(_all_teams_flat),
        "scorers":    len(_scorers_flat),
        "keyPresent": _key_present,
        "errors":     _cache_errors,
    }


@football_router.get("/football/test-api")
def test_api():
    """Make one live call to football-data.org and return the result. For debugging only."""
    try:
        data = _get("/competitions/PL/teams")
        teams = data.get("teams", [])
        return {
            "ok": True,
            "team_count": len(teams),
            "sample": teams[0].get("name") if teams else None,
            "key": FOOTBALL_KEY[:6] + "..." if FOOTBALL_KEY else "MISSING",
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "key": FOOTBALL_KEY[:6] + "..." if FOOTBALL_KEY else "MISSING"}


@football_router.get("/football/all-teams")
def get_all_teams():
    # Non-blocking: background thread fills _all_teams_flat; return whatever is ready
    return _all_teams_flat


@football_router.get("/football/players/search")
def search_players(name: str = Query(..., min_length=2)):
    _ensure_cache()
    q    = name.strip().lower()
    hits = [e for e in _scorers_flat if q in e["name"].lower()]
    seen: set[int] = set()
    unique = []
    for h in hits:
        if h["id"] not in seen:
            seen.add(h["id"])
            unique.append(h)
    return unique[:15]


@football_router.get("/football/teams/{team_id}")
def get_team(team_id: int, competition_code: str = Query(default="")):
    team         = _get(f"/teams/{team_id}")
    finished_raw = _get(f"/teams/{team_id}/matches?status=FINISHED&limit=10")
    matches      = _parse_finished_matches(team_id, finished_raw.get("matches", []))

    season_stats: dict = {}
    if competition_code:
        entry = _standings_for_team(team_id, competition_code.upper())
        if entry:
            n  = entry.get("playedGames",   0) or 0
            gf = entry.get("goalsFor",      0) or 0
            ga = entry.get("goalsAgainst",  0) or 0
            season_stats = {
                "totalMatches":    n,
                "wins":            entry.get("won",    0) or 0,
                "draws":           entry.get("draw",   0) or 0,
                "losses":          entry.get("lost",   0) or 0,
                "goalsFor":        gf,
                "goalsAgainst":    ga,
                "points":          entry.get("points", 0) or 0,
                "position":        entry.get("position"),
                "cleanSheets":     sum(1 for m in matches if m["goalsAgainst"] == 0),
                "avgGoalsFor":     round(gf / n, 2) if n else 0.0,
                "avgGoalsAgainst": round(ga / n, 2) if n else 0.0,
            }

    if not season_stats:
        n      = len(matches)
        wins   = sum(1 for m in matches if m["result"] == "W")
        draws  = sum(1 for m in matches if m["result"] == "D")
        losses = sum(1 for m in matches if m["result"] == "L")
        gf     = sum(m["goalsFor"]     for m in matches)
        ga     = sum(m["goalsAgainst"] for m in matches)
        season_stats = {
            "totalMatches":    n,    "wins": wins, "draws": draws, "losses": losses,
            "goalsFor":        gf,   "goalsAgainst": ga,
            "points":          wins * 3 + draws,
            "position":        None, "cleanSheets": sum(1 for m in matches if m["goalsAgainst"] == 0),
            "avgGoalsFor":     round(gf / n, 2) if n else 0.0,
            "avgGoalsAgainst": round(ga / n, 2) if n else 0.0,
        }

    return {
        "id":            team_id,
        "name":          team.get("name", ""),
        "shortName":     team.get("shortName") or team.get("name", ""),
        "tla":           team.get("tla", ""),
        "crest":         team.get("crest", ""),
        "venue":         team.get("venue", ""),
        "founded":       team.get("founded"),
        "recentMatches": matches,
        "seasonStats":   season_stats,
        "nextMatch":     _get_next_match(team_id),
    }


@football_router.get("/football/teams/{team_id}/squad")
def get_squad(team_id: int):
    data      = _get(f"/teams/{team_id}")
    pos_order = {"Goalkeeper": 0, "Defence": 1, "Midfield": 2, "Offence": 3}
    squad = []
    for p in data.get("squad", []):
        dob = p.get("dateOfBirth", "")
        squad.append({
            "id":          p.get("id"),
            "name":        p.get("name", ""),
            "position":    p.get("position", ""),
            "nationality": p.get("nationality", ""),
            "dateOfBirth": dob[:10] if dob else "",
            "age":         _calc_age(dob),
        })
    squad.sort(key=lambda x: (pos_order.get(x["position"], 99), x["name"]))
    return {
        "id":        team_id,
        "name":      data.get("name", ""),
        "shortName": data.get("shortName", ""),
        "crest":     data.get("crest", ""),
        "squad":     squad,
    }


@football_router.get("/football/player/{player_id}")
def get_player(
    player_id:        int,
    team_id:          int = Query(...),
    competition_code: str = Query(...),
):
    person = _get(f"/persons/{player_id}")
    _ensure_cache()
    cached = _scorers_by_id.get(player_id)
    if cached and cached["competitionCode"] == competition_code.upper():
        scorer_stats = {
            "goals":         cached["goals"],
            "assists":       cached["assists"],
            "penalties":     cached["penalties"],
            "playedMatches": cached["playedMatches"],
        }
    else:
        scorer_stats = {"goals": 0, "assists": 0, "penalties": None, "playedMatches": 0}
        try:
            sd    = _get(f"/competitions/{competition_code.upper()}/scorers?limit=100")
            match = next(
                (s for s in sd.get("scorers", []) if s.get("player", {}).get("id") == player_id),
                None,
            )
            if match:
                scorer_stats = {
                    "goals":         match.get("goals")        or 0,
                    "assists":       match.get("assists")       or 0,
                    "penalties":     match.get("penalties"),
                    "playedMatches": match.get("playedMatches") or 0,
                }
        except Exception:
            pass

    dob = person.get("dateOfBirth", "")
    n   = scorer_stats["playedMatches"]
    g   = scorer_stats["goals"]
    a   = scorer_stats["assists"]

    return {
        "id":              player_id,
        "name":            person.get("name", ""),
        "position":        person.get("position", "") or person.get("section", ""),
        "nationality":     person.get("nationality", ""),
        "dateOfBirth":     dob[:10] if dob else "",
        "age":             _calc_age(dob),
        "shirtNumber":     person.get("shirtNumber"),
        "teamId":          team_id,
        "competitionCode": competition_code.upper(),
        "seasonStats": {
            "playedMatches":  n,
            "goals":          g,
            "assists":        a,
            "involvement":    g + a,
            "penalties":      scorer_stats["penalties"],
            "goalsPerGame":   round(g / n, 2) if n else 0.0,
            "assistsPerGame": round(a / n, 2) if n else 0.0,
        },
        "nextMatch": _get_next_match(team_id),
    }


# ── AI Predictions ────────────────────────────────────────────────────────────
class PlayerPredReq(BaseModel):
    player_id:        int
    player_name:      str
    team_id:          int
    competition_code: str


class TeamPredReq(BaseModel):
    team_id:          int
    team_name:        str
    competition_code: str = ""


@football_router.post("/football/predict/player")
def predict_player(req: PlayerPredReq):
    player = get_player(req.player_id, team_id=req.team_id, competition_code=req.competition_code)
    season = player["seasonStats"]
    next_m = player.get("nextMatch")
    next_sec = (
        f"\n--- NEXT MATCH ---\nDate: {next_m['date']}\nOpponent: {next_m['opponent']}\nLocation: {next_m['homeAway']}\n"
        if next_m else "\n--- NEXT MATCH ---\nNot available.\n"
    )
    prompt = f"""You are an expert football analyst and sports betting predictor.

PLAYER: {req.player_name}
COMPETITION: {req.competition_code}
POSITION: {player.get('position', 'Unknown')}
NATIONALITY: {player.get('nationality', 'Unknown')}
AGE: {player.get('age', 'Unknown')}

--- SEASON STATS ({season['playedMatches']} matches played) ---
Goals: {season['goals']}  |  Assists: {season['assists']}  |  Involvement: {season['involvement']}
Goals per game: {season['goalsPerGame']}  |  Assists per game: {season['assistsPerGame']}
{'Penalties: ' + str(season['penalties']) + '  |  ' if season.get('penalties') else ''}

{next_sec}
Predict this player's stats for their NEXT match.
Return ONLY valid JSON:
  goals_predicted, goals_low, goals_high,
  assists_predicted, assists_low, assists_high,
  involvement_predicted,
  prediction_reasoning
All goal/assist values must be integers. prediction_reasoning: 2-3 sentences. No markdown.
"""
    r = gemini.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    return r.text


@football_router.post("/football/predict/team")
def predict_team(req: TeamPredReq):
    team    = get_team(req.team_id, competition_code=req.competition_code)
    matches = team["recentMatches"]
    season  = team["seasonStats"]
    if not matches:
        raise HTTPException(404, "No match data found for this team.")

    last_5 = matches[:5]
    last_3 = matches[:3]
    prev_3 = matches[3:6]

    def avg(lst, key):
        vals = [m[key] for m in lst]
        return round(sum(vals) / len(vals), 2) if vals else 0.0

    l5_gf    = avg(last_5, "goalsFor"); l5_ga = avg(last_5, "goalsAgainst")
    trend_gf = round(avg(last_3, "goalsFor")     - avg(prev_3, "goalsFor"),     2) if len(prev_3) >= 3 else 0.0
    trend_ga = round(avg(last_3, "goalsAgainst") - avg(prev_3, "goalsAgainst"), 2) if len(prev_3) >= 3 else 0.0
    wins5    = sum(1 for m in last_5 if m["result"] == "W")
    draws5   = sum(1 for m in last_5 if m["result"] == "D")
    losses5  = sum(1 for m in last_5 if m["result"] == "L")
    form     = "".join(m["result"] for m in last_5)
    last_3_lines = "\n".join([
        f"  {m['date']} | vs {m['opponent']} ({m['homeAway']}) | {m['result']} {m['score']}"
        for m in last_3
    ])
    next_m   = team.get("nextMatch")
    next_sec = (
        f"\n--- NEXT MATCH ---\nDate: {next_m['date']}\nOpponent: {next_m['opponent']}\n"
        f"Location: {next_m['homeAway']}\nCompetition: {next_m.get('competition','')}\n"
        if next_m else "\n--- NEXT MATCH ---\nNot available.\n"
    )
    pos_str = f"Position: #{season['position']}  |  " if season.get("position") else ""

    prompt = f"""You are an expert football analyst and sports betting predictor.

TEAM: {req.team_name}
COMPETITION: {req.competition_code}

--- FULL SEASON STATS ({season['totalMatches']} matches) ---
{pos_str}Points: {season.get('points',0)}  |  Record: {season['wins']}W-{season['draws']}D-{season['losses']}L
Goals scored: {season['goalsFor']}  |  Goals conceded: {season['goalsAgainst']}
Avg goals scored: {season['avgGoalsFor']}  |  Avg conceded: {season['avgGoalsAgainst']}

--- LAST 5 MATCHES ---
Avg goals: {l5_gf}  |  Avg conceded: {l5_ga}  |  Form: {form}  ({wins5}W-{draws5}D-{losses5}L)
Goals trend: {'+' if trend_gf>0 else ''}{trend_gf}  |  Conceded trend: {'+' if trend_ga>0 else ''}{trend_ga}

--- LAST 3 MATCHES ---
{last_3_lines}
{next_sec}
Return ONLY valid JSON:
  goals_for_predicted, goals_for_low, goals_for_high,
  goals_against_predicted, goals_against_low, goals_against_high,
  clean_sheet_probability,
  win_probability, draw_probability, loss_probability,
  prediction_reasoning
Goal values are integers. Probabilities 0-1 (sum to 1.0). prediction_reasoning: 2-3 sentences. No markdown.
"""
    r = gemini.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    return r.text


# ── Standalone app (local dev: uvicorn football_server:app --port 8001) ───────
_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")]

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(football_router)
