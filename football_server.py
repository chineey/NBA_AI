"""
Football (multi-league) API layer.

All data is read from an in-memory cache loaded from Supabase at startup
(_load_football_data(), populated by running football_refresh.py locally) --
this router never calls football-data.org itself. That mirrors how
server.py's nba_data_df works for the NBA side: the live process is a pure
reader, and FOOTBALL_API_KEY is only needed by the local ingestion script,
not by the deployed backend.

Every loader is independently try/excepted (_load_football_data) because
this router is imported directly into server.py's single production
process (`from football_server import football_router`) -- a problem on
the football side must never be able to take down the NBA endpoints.

AI refinement follows the same evidence-gated "anchor + clamp" pattern as
server.py's NBA predictions: football_prediction.py's statistical output is
the anchor, and Gemini may only nudge it within a narrow band (wider only
when grounded news backs the move). See _model_anchored_football().
"""

from __future__ import annotations

import json as _json
import os
from datetime import date

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import football_prediction
from gemini_context import grounded_research

load_dotenv()

# ── In-memory cache (loaded from Supabase at startup) ─────────────────────────
_fb_sb_client = None
_fb_competitions: dict[str, dict] = {}
_fb_teams: dict[int, dict] = {}
_fb_team_competitions: list[dict] = []
_fb_matches: list[dict] = []
_fb_matches_by_team: dict[int, list[dict]] = {}
_fb_standings: dict[tuple[str, int], dict] = {}
_fb_players: dict[int, dict] = {}
_fb_player_team: dict[int, list[dict]] = {}
_fb_player_season_stats: list[dict] = []
_fb_player_stats_by_player: dict[tuple[str, int], dict] = {}
_fb_player_stats_by_team: dict[int, list[dict]] = {}


def _get_sb_client():
    global _fb_sb_client
    if _fb_sb_client is not None:
        return _fb_sb_client
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        return None
    try:
        from supabase import create_client
        _fb_sb_client = create_client(url, key)
        return _fb_sb_client
    except Exception as e:
        print(f"[football] Failed to create Supabase client: {e}")
        return None


def _page_table(sb, table: str, page_size: int = 1000) -> list[dict]:
    rows, start = [], 0
    while True:
        resp = sb.table(table).select("*").range(start, start + page_size - 1).execute()
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


def _load_football_data() -> dict:
    """(Re)load every football table from Supabase into the in-memory cache.
    Each table is independently try/excepted -- a missing/partial table
    degrades that slice of the API rather than crashing the whole process."""
    global _fb_competitions, _fb_teams, _fb_team_competitions, _fb_matches, _fb_matches_by_team, \
           _fb_standings, _fb_players, _fb_player_team, _fb_player_season_stats, \
           _fb_player_stats_by_player, _fb_player_stats_by_team

    sb = _get_sb_client()
    if sb is None:
        print("[football] No Supabase credentials -- football endpoints will return empty data.")
        return {}

    counts = {}

    try:
        _fb_competitions = {r["code"]: r for r in _page_table(sb, "football_competitions")}
        counts["competitions"] = len(_fb_competitions)
    except Exception as e:
        print(f"[football] Failed to load competitions: {e}")

    try:
        _fb_teams = {r["id"]: r for r in _page_table(sb, "football_teams")}
        counts["teams"] = len(_fb_teams)
    except Exception as e:
        print(f"[football] Failed to load teams: {e}")

    try:
        _fb_team_competitions = _page_table(sb, "football_team_competitions")
        counts["team_competitions"] = len(_fb_team_competitions)
    except Exception as e:
        print(f"[football] Failed to load team-competition links: {e}")

    try:
        _fb_matches = _page_table(sb, "football_matches")
        by_team: dict[int, list[dict]] = {}
        for m in _fb_matches:
            for tid in (m.get("home_team_id"), m.get("away_team_id")):
                if tid is not None:
                    by_team.setdefault(tid, []).append(m)
        _fb_matches_by_team = by_team
        counts["matches"] = len(_fb_matches)
    except Exception as e:
        print(f"[football] Failed to load matches: {e}")

    try:
        rows = _page_table(sb, "football_standings")
        standings: dict[tuple[str, int], dict] = {}
        for r in rows:
            key = (r["competition_code"], r["team_id"])
            if r.get("stage") == "REGULAR_SEASON" or key not in standings:
                standings[key] = r
        _fb_standings = standings
        counts["standings"] = len(rows)
    except Exception as e:
        print(f"[football] Failed to load standings: {e}")

    try:
        _fb_players = {r["id"]: r for r in _page_table(sb, "football_players")}
        counts["players"] = len(_fb_players)
    except Exception as e:
        print(f"[football] Failed to load players: {e}")

    try:
        rows = _page_table(sb, "football_player_team")
        by_team = {}
        for r in rows:
            by_team.setdefault(r["team_id"], []).append(r)
        _fb_player_team = by_team
        counts["player_team"] = len(rows)
    except Exception as e:
        print(f"[football] Failed to load squad memberships: {e}")

    try:
        _fb_player_season_stats = _page_table(sb, "football_player_season_stats")
        _fb_player_stats_by_player = {
            (r["competition_code"], r["player_id"]): r for r in _fb_player_season_stats
        }
        by_team = {}
        for r in _fb_player_season_stats:
            if r.get("team_id") is not None:
                by_team.setdefault(r["team_id"], []).append(r)
        _fb_player_stats_by_team = by_team
        counts["player_season_stats"] = len(_fb_player_season_stats)
    except Exception as e:
        print(f"[football] Failed to load player season stats: {e}")

    print(f"[football] Loaded: {counts}")
    return counts


try:
    _load_football_data()
except Exception as e:
    print(f"[football] Startup load failed entirely, football endpoints will be empty: {e}")


# ── Small helpers ──────────────────────────────────────────────────────────────
def _age_from_dob(dob: str | None) -> int | None:
    if not dob:
        return None
    try:
        y, m, d = (int(x) for x in dob[:10].split("-"))
        today = date.today()
        return today.year - y - ((today.month, today.day) < (m, d))
    except Exception:
        return None


def _team_short(team: dict | None) -> str:
    if not team:
        return ""
    return team.get("short_name") or team.get("name", "")


def _upcoming_for_team(team_id: int) -> list[dict]:
    matches = _fb_matches_by_team.get(team_id, [])
    return sorted(
        [m for m in matches if m.get("status") in ("SCHEDULED", "TIMED")],
        key=lambda m: m.get("utc_date") or "",
    )


def _finished_for_team(team_id: int) -> list[dict]:
    matches = _fb_matches_by_team.get(team_id, [])
    return sorted(
        [m for m in matches if m.get("status") == "FINISHED"
         and m.get("full_time_home") is not None and m.get("full_time_away") is not None],
        key=lambda m: m.get("utc_date") or "", reverse=True,
    )


# ── Gemini refinement ("anchor + clamp", mirroring server.py's NBA pattern) ───
_gemini_client = None
FOOTBALL_REFINE_REL_DEFAULT = 0.15
FOOTBALL_REFINE_REL_NEWS = 0.30
FOOTBALL_NEWS_TTL = 1800  # re-research a team/player at most every 30 min


def _get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        api_key = os.getenv("GEMINI_API")
        if not api_key:
            return None
        from google import genai
        _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


def _clamp_to_model(value, anchor: float, rel: float, abs_min: float = 0.05) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return anchor
    band = max(abs(anchor) * rel, abs_min)
    return max(anchor - band, min(anchor + band, v))


def _model_anchored_football(model_payload: dict, refineable_keys: list[str], prompt: str,
                             fallback_reasoning: str, allow_wide: bool = False) -> dict:
    """
    Ask Gemini to refine the model's numbers and write reasoning, exactly
    like server.py's _model_anchored() for the NBA side. The clamp is
    evidence-gated: +/-15% by default, widened to +/-30% only when grounded
    news backs the move. Probability fields (win/draw/loss/clean-sheet) are
    never in `refineable_keys` -- those stay pure model output so they keep
    summing sensibly. If Gemini is unavailable, the model's numbers stand.
    """
    result = dict(model_payload)
    result["prediction_reasoning"] = fallback_reasoning
    client = _get_gemini_client()
    if client is None:
        return result
    try:
        from google.genai import types
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        refined = _json.loads(response.text)
        rel = FOOTBALL_REFINE_REL_NEWS if (allow_wide and refined.get("news_adjusted") is True) \
              else FOOTBALL_REFINE_REL_DEFAULT
        for k in refineable_keys:
            if k in refined and k in model_payload:
                anchor = float(model_payload[k])
                abs_min = 0.03 if abs(anchor) < 1 else 0.1
                result[k] = round(_clamp_to_model(refined[k], anchor, rel, abs_min=abs_min), 2)
        if isinstance(refined.get("prediction_reasoning"), str) and refined["prediction_reasoning"].strip():
            result["prediction_reasoning"] = refined["prediction_reasoning"].strip()
    except Exception as e:
        print(f"[football predict] Gemini refinement unavailable, using model output: {e}")
    return result


def _team_news(team_name: str, opponent_name: str, competition_name: str, match_date: str) -> dict | None:
    prompt = f"""Use Google Search for the latest news (past 7 days) about {team_name}
ahead of their {competition_name} match against {opponent_name}
{f"on {match_date[:10]}" if match_date else ""}.

Look ONLY for factual items a stats model cannot see:
- key players ruled out, suspended, or returning from injury
- squad rotation plans (e.g. prioritising another competition)
- key OPPONENT ({opponent_name}) absences that change this specific matchup

Then output a JSON object (no other JSON in your reply):
{{
  "noteworthy": <true only if you found a concrete, dated item above>,
  "brief": "<2-4 factual sentences with dates; empty string if nothing found>"
}}"""
    key = f"footballteam:{team_name}:{opponent_name}:{match_date}"
    return grounded_research(prompt, cache_key=key, ttl=FOOTBALL_NEWS_TTL)


def _player_news(player_name: str, team_name: str, opponent_name: str, competition_name: str) -> dict | None:
    prompt = f"""Use Google Search for the latest news (past 7 days) about {player_name}
of {team_name} ahead of their next {competition_name} match against {opponent_name}.

Look ONLY for factual items a season-stats model cannot see:
- injury/fitness status, suspensions, or rotation/rest plans
- role changes (new starter, bench role, set-piece/penalty duties)

Then output a JSON object (no other JSON in your reply):
{{
  "player_status": "ACTIVE" | "DOUBTFUL" | "OUT" | "UNKNOWN",
  "noteworthy": <true only if you found a concrete, dated item above>,
  "brief": "<2-4 factual sentences with dates; empty string if nothing found>"
}}"""
    key = f"footballplayer:{player_name}:{team_name}:{opponent_name}"
    return grounded_research(prompt, cache_key=key, ttl=FOOTBALL_NEWS_TTL)


def _news_section(ctx: dict | None) -> str:
    brief = (ctx or {}).get("brief", "")
    return f"\n--- LATEST NEWS (Google Search; may be incomplete) ---\n{brief.strip() or 'No recent news found.'}\n"


# ── Request models ──────────────────────────────────────────────────────────────
class FootballTeamPredictionRequest(BaseModel):
    team_id: int
    team_name: str
    competition_code: str


class FootballPlayerPredictionRequest(BaseModel):
    player_id: int
    player_name: str
    team_id: int
    competition_code: str


# ── Router ────────────────────────────────────────────────────────────────────
football_router = APIRouter()


@football_router.get("/football/reload")
def football_reload():
    """Manual re-load of the in-memory cache from Supabase (e.g. after running
    football_refresh.py without restarting the server)."""
    counts = _load_football_data()
    return {"status": "done", "counts": counts}


@football_router.get("/football/competitions")
def list_competitions():
    return [
        {
            "id": c.get("competition_id"), "code": c["code"], "name": c.get("name", ""),
            "emblem": c.get("emblem") or "", "area": c.get("area_name", ""),
        }
        for c in sorted(_fb_competitions.values(), key=lambda c: c.get("name", ""))
    ]


@football_router.get("/football/competitions/{code}/teams")
def competition_teams(code: str):
    code = code.upper()
    team_ids = {tc["team_id"] for tc in _fb_team_competitions if tc["competition_code"] == code}
    teams = sorted((_fb_teams[tid] for tid in team_ids if tid in _fb_teams), key=lambda t: t.get("name", ""))
    return [
        {"id": t["id"], "name": t.get("name", ""), "shortName": _team_short(t),
         "tla": t.get("tla", ""), "crest": t.get("crest", "")}
        for t in teams
    ]


@football_router.get("/football/all-teams")
def all_teams():
    out = []
    for tc in _fb_team_competitions:
        team = _fb_teams.get(tc["team_id"])
        comp = _fb_competitions.get(tc["competition_code"])
        if not team or not comp:
            continue
        out.append({
            "id": team["id"], "name": team.get("name", ""), "shortName": _team_short(team),
            "tla": team.get("tla", ""), "crest": team.get("crest", ""),
            "competition": {"code": comp["code"], "name": comp.get("name", "")},
        })
    out.sort(key=lambda t: (t["competition"]["code"], t["name"]))
    return out


@football_router.get("/football/players/search")
def search_players(name: str = Query(default="")):
    q = name.strip().lower()
    if len(q) < 2:
        return []
    seen: set[tuple[int, int | None]] = set()
    out = []

    for r in _fb_player_season_stats:
        player = _fb_players.get(r["player_id"])
        if not player or q not in player.get("name", "").lower():
            continue
        team = _fb_teams.get(r.get("team_id"))
        comp = _fb_competitions.get(r["competition_code"])
        out.append({
            "id": player["id"], "name": player.get("name", ""),
            "position": player.get("position", ""), "nationality": player.get("nationality", ""),
            "teamId": r.get("team_id"), "teamName": team.get("name", "") if team else "",
            "teamCrest": team.get("crest", "") if team else "",
            "competitionCode": r["competition_code"],
            "competitionName": comp.get("name", "") if comp else "",
            "goals": r.get("goals", 0), "assists": r.get("assists", 0),
            "playedMatches": r.get("played_matches", 0), "penalties": r.get("penalties"),
        })
        seen.add((player["id"], r.get("team_id")))

    # Squad members with no scoring stats yet (defenders, keepers, etc.) --
    # only populated if the /v4/teams/{id} squad endpoint was available
    # when football_refresh.py last ran.
    for team_id, squad in _fb_player_team.items():
        team = _fb_teams.get(team_id)
        team_comp_code = next(
            (tc["competition_code"] for tc in _fb_team_competitions if tc["team_id"] == team_id), None
        )
        comp = _fb_competitions.get(team_comp_code) if team_comp_code else None
        for s in squad:
            player = _fb_players.get(s["player_id"])
            if not player or (player["id"], team_id) in seen:
                continue
            if q not in player.get("name", "").lower():
                continue
            out.append({
                "id": player["id"], "name": player.get("name", ""),
                "position": s.get("position") or player.get("position", ""),
                "nationality": player.get("nationality", ""),
                "teamId": team_id, "teamName": team.get("name", "") if team else "",
                "teamCrest": team.get("crest", "") if team else "",
                "competitionCode": team_comp_code or "",
                "competitionName": comp.get("name", "") if comp else "",
                "goals": 0, "assists": 0, "playedMatches": 0, "penalties": None,
            })

    out.sort(key=lambda p: (-p["goals"], -p["assists"], p["name"]))
    return out[:50]


@football_router.get("/football/teams/{team_id}/squad")
def team_squad(team_id: int):
    team = _fb_teams.get(team_id)
    if not team:
        raise HTTPException(404, "Team not found.")

    squad_rows = _fb_player_team.get(team_id, [])
    squad = []
    if squad_rows:
        for s in squad_rows:
            p = _fb_players.get(s["player_id"])
            if not p:
                continue
            squad.append({
                "id": p["id"], "name": p.get("name", ""),
                "position": s.get("position") or p.get("position", ""),
                "nationality": p.get("nationality", ""),
                "dateOfBirth": p.get("date_of_birth") or "",
                "age": _age_from_dob(p.get("date_of_birth")),
            })
    else:
        # Full-squad endpoint wasn't available on this API plan when
        # football_refresh.py ran -- fall back to scorers/assisters only.
        for r in _fb_player_stats_by_team.get(team_id, []):
            p = _fb_players.get(r["player_id"])
            if not p:
                continue
            squad.append({
                "id": p["id"], "name": p.get("name", ""),
                "position": p.get("position", ""), "nationality": p.get("nationality", ""),
                "dateOfBirth": p.get("date_of_birth") or "",
                "age": _age_from_dob(p.get("date_of_birth")),
            })

    return {
        "id": team["id"], "name": team.get("name", ""), "shortName": _team_short(team),
        "crest": team.get("crest", ""), "squad": squad,
    }


@football_router.get("/football/teams/{team_id}")
def team_detail(team_id: int, competition_code: str = Query(default="")):
    team = _fb_teams.get(team_id)
    if not team:
        raise HTTPException(404, "Team not found.")
    competition_code = competition_code.upper()

    finished = _finished_for_team(team_id)
    scoped_finished = [m for m in finished if m.get("competition_code") == competition_code] \
        if competition_code else finished

    def _match_row(m: dict) -> dict:
        is_home = m["home_team_id"] == team_id
        opp = _fb_teams.get(m["away_team_id"] if is_home else m["home_team_id"], {})
        gf = m["full_time_home"] if is_home else m["full_time_away"]
        ga = m["full_time_away"] if is_home else m["full_time_home"]
        comp = _fb_competitions.get(m["competition_code"])
        return {
            "matchId": m["id"], "date": (m.get("utc_date") or "")[:10],
            "competition": comp.get("name", m["competition_code"]) if comp else m["competition_code"],
            "opponent": _team_short(opp), "opponentCrest": opp.get("crest", ""),
            "homeAway": "HOME" if is_home else "AWAY",
            "goalsFor": gf, "goalsAgainst": ga,
            "result": "W" if gf > ga else ("D" if gf == ga else "L"),
            "score": f"{gf}-{ga}",
        }

    recent_matches = [_match_row(m) for m in finished[:10]]

    wins = draws = losses = clean_sheets = goals_for = goals_against = 0
    for m in scoped_finished:
        is_home = m["home_team_id"] == team_id
        gf = m["full_time_home"] if is_home else m["full_time_away"]
        ga = m["full_time_away"] if is_home else m["full_time_home"]
        goals_for += gf
        goals_against += ga
        if ga == 0:
            clean_sheets += 1
        if gf > ga:
            wins += 1
        elif gf == ga:
            draws += 1
        else:
            losses += 1
    total = len(scoped_finished)

    standing = _fb_standings.get((competition_code, team_id)) if competition_code else None

    next_match = None
    upcoming = _upcoming_for_team(team_id)
    if upcoming:
        m = upcoming[0]
        is_home = m["home_team_id"] == team_id
        opp = _fb_teams.get(m["away_team_id"] if is_home else m["home_team_id"], {})
        comp = _fb_competitions.get(m["competition_code"])
        next_match = {
            "date": (m.get("utc_date") or "")[:10], "opponent": _team_short(opp),
            "homeAway": "HOME" if is_home else "AWAY",
            "competition": comp.get("name", m["competition_code"]) if comp else m["competition_code"],
        }

    return {
        "id": team["id"], "name": team.get("name", ""), "shortName": _team_short(team),
        "tla": team.get("tla", ""), "crest": team.get("crest", ""),
        "venue": team.get("venue", ""), "founded": team.get("founded"),
        "recentMatches": recent_matches,
        "seasonStats": {
            "totalMatches": total, "wins": wins, "draws": draws, "losses": losses,
            "cleanSheets": clean_sheets, "goalsFor": goals_for, "goalsAgainst": goals_against,
            "avgGoalsFor": round(goals_for / total, 2) if total else 0.0,
            "avgGoalsAgainst": round(goals_against / total, 2) if total else 0.0,
            "points": standing.get("points") if standing else None,
            "position": standing.get("position") if standing else None,
        },
        "nextMatch": next_match,
    }


@football_router.post("/football/predict/team")
def predict_team(req: FootballTeamPredictionRequest):
    team = _fb_teams.get(req.team_id)
    if not team:
        raise HTTPException(404, "Team not found.")

    upcoming = _upcoming_for_team(req.team_id)
    if not upcoming:
        raise HTTPException(409, "No upcoming match found to predict.")
    nm = upcoming[0]
    is_home = nm["home_team_id"] == req.team_id
    opponent_id = nm["away_team_id"] if is_home else nm["home_team_id"]
    opponent = _fb_teams.get(opponent_id, {})
    comp = _fb_competitions.get(nm["competition_code"])
    comp_name = comp.get("name", nm["competition_code"]) if comp else nm["competition_code"]

    combined_matches = _fb_matches_by_team.get(req.team_id, []) + _fb_matches_by_team.get(opponent_id, [])
    model_payload = football_prediction.predict_team_next_match(
        req.team_id, opponent_id, is_home, combined_matches,
    )
    fallback_reasoning = model_payload.pop("prediction_reasoning")

    team_name = team.get("name", req.team_name)
    opp_name = opponent.get("name", "")
    news_ctx = _team_news(team_name, opp_name, comp_name, nm.get("utc_date", ""))

    prompt = f"""You are an expert football analyst reviewing a statistical model's projection.

TEAM: {team_name}
OPPONENT: {opp_name} ({"home" if is_home else "away"} fixture for {team_name})
COMPETITION: {comp_name}

--- STATISTICAL MODEL PROJECTION (your anchor) ---
{_json.dumps(model_payload)}
The model already accounts for: weighted recent form from our own match
history, head-to-head history, and home/away advantage.
{_news_section(news_ctx)}
Your job: refine goals_for/goals_against ONLY where the news gives a clear
reason (e.g. a key striker ruled out). Stay within +/-15% of every model
value -- except when the news is concrete and dated: then you may move the
affected values up to +/-30%, and must set "news_adjusted" to true and cite
it in your reasoning. Do NOT change clean_sheet_probability, win_probability,
draw_probability, or loss_probability -- those come directly from the
statistical model and must stay untouched.

Return ONLY a valid JSON object with exactly these keys:
  goals_for_predicted, goals_for_low, goals_for_high,
  goals_against_predicted, goals_against_low, goals_against_high,
  news_adjusted, prediction_reasoning

prediction_reasoning must be 2-3 sentences citing the key factors (form, home/away, news).
Do not use markdown. Do not wrap in code blocks.
"""

    refineable = ["goals_for_predicted", "goals_for_low", "goals_for_high",
                  "goals_against_predicted", "goals_against_low", "goals_against_high"]
    return _model_anchored_football(
        model_payload, refineable, prompt, fallback_reasoning,
        allow_wide=bool(news_ctx and news_ctx.get("noteworthy")),
    )


@football_router.get("/football/player/{player_id}")
def player_detail(player_id: int, team_id: int = Query(...), competition_code: str = Query(default="")):
    player = _fb_players.get(player_id)
    if not player:
        raise HTTPException(404, "Player not found.")
    competition_code = competition_code.upper()

    stats = _fb_player_stats_by_player.get((competition_code, player_id))
    goals = stats.get("goals", 0) if stats else 0
    assists = stats.get("assists", 0) if stats else 0
    played = stats.get("played_matches", 0) if stats else 0
    penalties = stats.get("penalties") if stats else None

    shirt_number = None
    for s in _fb_player_team.get(team_id, []):
        if s["player_id"] == player_id:
            shirt_number = s.get("shirt_number")
            break

    next_match = None
    upcoming = _upcoming_for_team(team_id)
    if upcoming:
        m = upcoming[0]
        is_home = m["home_team_id"] == team_id
        opp = _fb_teams.get(m["away_team_id"] if is_home else m["home_team_id"], {})
        next_match = {
            "date": (m.get("utc_date") or "")[:10], "opponent": _team_short(opp),
            "homeAway": "HOME" if is_home else "AWAY",
        }

    return {
        "id": player["id"], "name": player.get("name", ""), "position": player.get("position", ""),
        "nationality": player.get("nationality", ""), "dateOfBirth": player.get("date_of_birth") or "",
        "age": _age_from_dob(player.get("date_of_birth")), "shirtNumber": shirt_number,
        "teamId": team_id, "competitionCode": competition_code,
        "seasonStats": {
            "playedMatches": played, "goals": goals, "assists": assists,
            "involvement": goals + assists, "penalties": penalties,
            "goalsPerGame": round(goals / played, 2) if played else 0.0,
            "assistsPerGame": round(assists / played, 2) if played else 0.0,
        },
        "nextMatch": next_match,
    }


@football_router.post("/football/predict/player")
def predict_player(req: FootballPlayerPredictionRequest):
    player = _fb_players.get(req.player_id)
    if not player:
        raise HTTPException(404, "Player not found.")
    team = _fb_teams.get(req.team_id, {})
    comp_code = req.competition_code.upper()
    stats = _fb_player_stats_by_player.get((comp_code, req.player_id))
    goals = stats.get("goals", 0) if stats else 0
    assists = stats.get("assists", 0) if stats else 0
    played = stats.get("played_matches", 0) if stats else 0

    upcoming = _upcoming_for_team(req.team_id)
    if not upcoming:
        raise HTTPException(409, "No upcoming match found for this player's team.")
    nm = upcoming[0]
    is_home = nm["home_team_id"] == req.team_id
    opponent_id = nm["away_team_id"] if is_home else nm["home_team_id"]
    opponent = _fb_teams.get(opponent_id, {})
    comp = _fb_competitions.get(nm["competition_code"])
    comp_name = comp.get("name", nm["competition_code"]) if comp else nm["competition_code"]

    opp_standing = _fb_standings.get((nm["competition_code"], opponent_id))
    comp_standings = [s for (code, _), s in _fb_standings.items() if code == nm["competition_code"]]
    total_ga = sum(s.get("goals_against", 0) for s in comp_standings)
    total_played = sum(max(s.get("played_games", 0), 1) for s in comp_standings)
    league_avg_ga = (total_ga / total_played) if total_played else football_prediction.BASELINE_GOALS
    if opp_standing and opp_standing.get("played_games") and league_avg_ga:
        opp_avg_ga = opp_standing.get("goals_against", 0) / opp_standing["played_games"]
        opponent_defense_factor = opp_avg_ga / league_avg_ga
    else:
        opponent_defense_factor = 1.0

    model_payload = football_prediction.predict_player_next_match(
        goals, assists, played, opponent_defense_factor, is_home,
    )
    fallback_reasoning = model_payload.pop("prediction_reasoning")

    player_name = player.get("name", req.player_name)
    team_name = team.get("name", "")
    opp_name = opponent.get("name", "")
    news_ctx = _player_news(player_name, team_name, opp_name, comp_name)

    prompt = f"""You are an expert football analyst reviewing a statistical model's projection.

PLAYER: {player_name}
TEAM: {team_name}
OPPONENT: {opp_name} ({"home" if is_home else "away"} fixture)
COMPETITION: {comp_name}
SEASON STATS: {goals} goals, {assists} assists in {played} matches

--- STATISTICAL MODEL PROJECTION (your anchor) ---
{_json.dumps(model_payload)}
The model already accounts for: this season's per-game scoring rate, the
next opponent's defensive record, and home/away.
{_news_section(news_ctx)}
Your job: refine ONLY where the news gives a clear reason (e.g. confirmed
starting role, injury doubt, penalty duties). Stay within +/-15% of every
model value -- except when the news is concrete and dated: then you may
move the affected values up to +/-30%, and must set "news_adjusted" to true
and cite it in your reasoning. If the news says the player is OUT or a
doubtful starter, keep the numbers as an "if he plays" projection but open
the reasoning with his status.

Return ONLY a valid JSON object with exactly these keys:
  goals_predicted, goals_low, goals_high,
  assists_predicted, assists_low, assists_high,
  news_adjusted, prediction_reasoning

Do not use markdown. Do not wrap in code blocks.
"""

    refineable = ["goals_predicted", "goals_low", "goals_high",
                  "assists_predicted", "assists_low", "assists_high"]
    result = _model_anchored_football(
        model_payload, refineable, prompt, fallback_reasoning,
        allow_wide=bool(news_ctx and news_ctx.get("noteworthy")),
    )
    result["involvement_predicted"] = round(
        result.get("goals_predicted", 0) + result.get("assists_predicted", 0), 2
    )
    status = (news_ctx or {}).get("player_status")
    if status in ("OUT", "DOUBTFUL"):
        result["player_status"] = status
    return result


@football_router.get("/football/matches/{match_id}/predict")
def predict_match_endpoint(match_id: int):
    """Full two-sided fixture prediction. Not required by the current
    frontend flow (see MatchPrediction.tsx / HOW_IT_WORKS.md for context)
    but kept available since football_prediction.predict_fixture() already
    supports it at negligible extra cost."""
    match = next((m for m in _fb_matches if m["id"] == match_id), None)
    if not match:
        raise HTTPException(404, "Match not found.")
    home = _fb_teams.get(match.get("home_team_id"))
    away = _fb_teams.get(match.get("away_team_id"))
    if not home or not away:
        raise HTTPException(409, "Teams for this fixture are not resolved.")
    home_brief = {"id": home["id"], "name": home.get("name", ""), "shortName": _team_short(home),
                  "crest": home.get("crest", ""), "tla": home.get("tla", "")}
    away_brief = {"id": away["id"], "name": away.get("name", ""), "shortName": _team_short(away),
                  "crest": away.get("crest", ""), "tla": away.get("tla", "")}
    combined = _fb_matches_by_team.get(home["id"], []) + _fb_matches_by_team.get(away["id"], [])
    return football_prediction.predict_fixture(match, home_brief, away_brief, combined)


# ── Standalone app (local dev only -- production mounts football_router
#    directly onto server.py's app; see server.py's `app.include_router`) ─────
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
