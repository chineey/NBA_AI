from fastapi import FastAPI, HTTPException, Query, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os, httpx
from datetime import date as _date

load_dotenv()

# ── Football-data.org ────────────────────────────────────────────────────────
FOOTBALL_KEY  = os.getenv("FOOTBALL_API_KEY", "")
FOOTBALL_BASE = "https://api.football-data.org/v4"
_FBD_HEADERS  = {"X-Auth-Token": FOOTBALL_KEY}

WC_CODE = "WC"


def _get(path: str, timeout: int = 30) -> dict:
    with httpx.Client(timeout=httpx.Timeout(connect=20, read=timeout, write=10, pool=5)) as c:
        r = c.get(f"{FOOTBALL_BASE}{path}", headers=_FBD_HEADERS)
        if r.status_code == 429:
            raise HTTPException(429, "Football API rate limit — wait a moment.")
        if r.status_code == 403:
            raise HTTPException(403, "Football API access denied. Check FOOTBALL_API_KEY.")
        if r.status_code == 404:
            raise HTTPException(404, "Not found.")
        r.raise_for_status()
        return r.json()


# ── Helpers ───────────────────────────────────────────────────────────────────
def _format_wc_match(m: dict) -> dict:
    home  = m.get("homeTeam", {})
    away  = m.get("awayTeam", {})
    score = m.get("score", {})
    ft    = score.get("fullTime", {})
    ht    = score.get("halfTime", {})
    return {
        "matchId":   m["id"],
        "utcDate":   m.get("utcDate", ""),
        "date":      (m.get("utcDate") or "")[:10],
        "status":    m.get("status", ""),
        "stage":     m.get("stage", ""),
        "group":     m.get("group"),
        "matchday":  m.get("matchday"),
        "homeTeam": {
            "id":        home.get("id"),
            "name":      home.get("name", ""),
            "shortName": home.get("shortName") or home.get("name", ""),
            "crest":     home.get("crest", ""),
            "tla":       home.get("tla", ""),
        },
        "awayTeam": {
            "id":        away.get("id"),
            "name":      away.get("name", ""),
            "shortName": away.get("shortName") or away.get("name", ""),
            "crest":     away.get("crest", ""),
            "tla":       away.get("tla", ""),
        },
        "score": {
            "winner":   score.get("winner"),
            "fullTime": {"home": ft.get("home"), "away": ft.get("away")},
            "halfTime": {"home": ht.get("home"), "away": ht.get("away")},
        },
        "venue":    m.get("venue", ""),
        "referees": [r.get("name", "") for r in m.get("referees", [])],
    }


# ── Router ────────────────────────────────────────────────────────────────────
football_router = APIRouter()


@football_router.get("/football/worldcup/fixtures")
def wc_fixtures(
    status:   str      = Query(default=""),   # SCHEDULED, LIVE, IN_PLAY, PAUSED, FINISHED
    stage:    str      = Query(default=""),   # GROUP_STAGE, ROUND_OF_16, QUARTER_FINALS, SEMI_FINALS, FINAL
    matchday: int|None = Query(default=None),
    dateFrom: str      = Query(default=""),   # YYYY-MM-DD
    dateTo:   str      = Query(default=""),   # YYYY-MM-DD
):
    params: list[str] = []
    if status:
        params.append(f"status={status.upper()}")
    if stage:
        params.append(f"stage={stage.upper()}")
    if matchday is not None:
        params.append(f"matchday={matchday}")
    if dateFrom:
        params.append(f"dateFrom={dateFrom}")
    if dateTo:
        params.append(f"dateTo={dateTo}")
    qs   = ("?" + "&".join(params)) if params else ""
    data = _get(f"/competitions/{WC_CODE}/matches{qs}")
    matches = [_format_wc_match(m) for m in data.get("matches", [])]
    return {
        "competition": data.get("competition", {}),
        "count":       len(matches),
        "filters":     data.get("filters", {}),
        "matches":     matches,
    }


@football_router.get("/football/worldcup/standings")
def wc_standings():
    data   = _get(f"/competitions/{WC_CODE}/standings")
    groups = []
    for grp in data.get("standings", []):
        table = []
        for entry in grp.get("table", []):
            t = entry.get("team", {})
            table.append({
                "position":       entry.get("position"),
                "team": {
                    "id":        t.get("id"),
                    "name":      t.get("name", ""),
                    "shortName": t.get("shortName") or t.get("name", ""),
                    "crest":     t.get("crest", ""),
                    "tla":       t.get("tla", ""),
                },
                "playedGames":    entry.get("playedGames",    0),
                "won":            entry.get("won",            0),
                "draw":           entry.get("draw",           0),
                "lost":           entry.get("lost",           0),
                "points":         entry.get("points",         0),
                "goalsFor":       entry.get("goalsFor",       0),
                "goalsAgainst":   entry.get("goalsAgainst",   0),
                "goalDifference": entry.get("goalDifference", 0),
            })
        groups.append({
            "stage": grp.get("stage", ""),
            "group": grp.get("group"),
            "table": table,
        })
    return {
        "competition": data.get("competition", {}),
        "season":      data.get("season", {}),
        "groups":      groups,
    }


@football_router.get("/football/worldcup/scorers")
def wc_scorers(limit: int = Query(default=20, ge=1, le=100)):
    data    = _get(f"/competitions/{WC_CODE}/scorers?limit={limit}")
    scorers = []
    for s in data.get("scorers", []):
        p  = s.get("player", {})
        tm = s.get("team",   {})
        scorers.append({
            "rank": len(scorers) + 1,
            "player": {
                "id":          p.get("id"),
                "name":        p.get("name", ""),
                "nationality": p.get("nationality", ""),
                "position":    p.get("position") or p.get("section", ""),
            },
            "team": {
                "id":        tm.get("id"),
                "name":      tm.get("name", ""),
                "shortName": tm.get("shortName") or tm.get("name", ""),
                "crest":     tm.get("crest", ""),
                "tla":       tm.get("tla", ""),
            },
            "goals":         s.get("goals",         0) or 0,
            "assists":       s.get("assists",        0) or 0,
            "penalties":     s.get("penalties"),
            "playedMatches": s.get("playedMatches",  0) or 0,
        })
    return {
        "competition": data.get("competition", {}),
        "count":       len(scorers),
        "scorers":     scorers,
    }


@football_router.get("/football/worldcup/match/{match_id}")
def wc_match(match_id: int):
    return _format_wc_match(_get(f"/matches/{match_id}"))


@football_router.get("/football/worldcup/assists")
def wc_assists(limit: int = Query(default=20, ge=1, le=100)):
    """Top assist providers, derived from the scorers list sorted by assists."""
    data = _get(f"/competitions/{WC_CODE}/scorers?limit=100")
    rows = []
    for s in data.get("scorers", []):
        assists = s.get("assists") or 0
        if assists <= 0:
            continue
        p  = s.get("player", {})
        tm = s.get("team",   {})
        rows.append({
            "player": {
                "id":          p.get("id"),
                "name":        p.get("name", ""),
                "nationality": p.get("nationality", ""),
                "position":    p.get("position") or p.get("section", ""),
            },
            "team": {
                "id":        tm.get("id"),
                "name":      tm.get("name", ""),
                "shortName": tm.get("shortName") or tm.get("name", ""),
                "crest":     tm.get("crest", ""),
                "tla":       tm.get("tla", ""),
            },
            "assists":       assists,
            "goals":         s.get("goals", 0) or 0,
            "playedMatches": s.get("playedMatches", 0) or 0,
        })
    rows.sort(key=lambda r: (-r["assists"], -r["goals"]))
    rows = rows[:limit]
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return {
        "competition": data.get("competition", {}),
        "count":       len(rows),
        "assists":     rows,
    }


@football_router.get("/football/worldcup/predict/{match_id}")
def wc_predict(match_id: int):
    """Full model prediction for a fixture: 1X2, over/under, correct scores."""
    from football_prediction import predict_match
    return predict_match(match_id)


# ── App ───────────────────────────────────────────────────────────────────────
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
