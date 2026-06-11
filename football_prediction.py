"""
Football match prediction engine.

Model: time-decayed Poisson with Dixon-Coles low-score correction.

For each team we estimate attack and defense strength from its recent
finished matches (exponentially decayed so recent form counts more),
shrunk toward the tournament baseline when the sample is small. The two
strengths combine into expected goals (lambda) for each side, which feed
a full Poisson score matrix. Every market is derived from that matrix:

  - 1X2 (home / draw / away) and double chance
  - Over/Under 0.5 to 4.5 goals
  - Both teams to score
  - Most likely correct scores
  - Predicted full-time score (mode of the matrix)

This is the same family of model bookmakers use to seed football odds.
It produces calibrated probabilities, not certainties.
"""

from __future__ import annotations

import math
import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException

from gemini_context import grounded_research, clamp

FOOTBALL_BASE = "https://api.football-data.org/v4"

# ── Model constants ───────────────────────────────────────────────────────────
BASELINE_GOALS = 1.30   # avg goals per team per match in international football
DECAY          = 0.90   # per-match exponential decay on form weighting
SHRINK_K       = 5.0    # Bayesian shrinkage: strength pulled to 1.0 when n is small
HOME_ADV       = 1.06   # mild edge for the listed home side (WC venues are near-neutral)
DC_RHO         = -0.10  # Dixon-Coles low-score dependence parameter
MAX_GOALS      = 10     # score matrix dimension (0..10 goals each side)
LAMBDA_MIN     = 0.20
LAMBDA_MAX     = 4.50
FORM_MATCHES   = 20     # how many finished matches to pull per team

# Bounds on the news-based xG adjustment. ±20% on expected goals already
# swings 1X2 by ~8-10 points — enough to absorb a missing star striker
# without ever letting the LLM overrule the statistical model.
CTX_FACTOR_MIN = 0.80
CTX_FACTOR_MAX = 1.20
CTX_TTL        = 3600   # re-research a fixture at most once an hour

# ── Elo strength priors ───────────────────────────────────────────────────────
# The free football-data tier has no national-team matches outside the World
# Cup itself, so before a team's first tournament game there is no form data
# at all. These approximate Elo ratings (eloratings.net family, mid-2020s
# snapshot) give every team a realistic starting strength; the Bayesian
# shrinkage in _team_strength blends real results in on top as they happen,
# so the priors fade with every match played.
ELO_PRIORS = {
    "ESP": 2150, "ARG": 2140, "FRA": 2030, "POR": 1990, "ENG": 1980,
    "BRA": 1970, "NED": 1940, "GER": 1930, "COL": 1920, "URY": 1890,
    "JPN": 1880, "ECU": 1880, "CRO": 1870, "MEX": 1850, "BEL": 1850,
    "MAR": 1850, "NOR": 1850, "AUT": 1830, "SUI": 1810, "IRN": 1800,
    "TUR": 1800, "USA": 1790, "PAR": 1780, "SEN": 1760, "CAN": 1750,
    "SWE": 1750, "KOR": 1740, "CZE": 1740, "CIV": 1730, "EGY": 1720,
    "ALG": 1710, "AUS": 1700, "TUN": 1700, "SCO": 1690, "BIH": 1660,
    "PAN": 1650, "RSA": 1650, "GHA": 1640, "UZB": 1640, "COD": 1640,
    "KSA": 1630, "QAT": 1620, "JOR": 1620, "IRQ": 1600, "NZL": 1590,
    "CPV": 1560, "CUW": 1540, "HAI": 1500,
}
ELO_DEFAULT = 1600
ELO_SCALE   = 380   # ~1 goal of expected margin per ~250-300 Elo points
_ELO_MEAN   = sum(ELO_PRIORS.values()) / len(ELO_PRIORS)


def _elo_prior(tla: str | None) -> tuple[float, float, int]:
    """(prior_attack, prior_defense, elo) for a team, relative to the WC field."""
    elo = ELO_PRIORS.get((tla or "").upper(), ELO_DEFAULT)
    factor = math.exp((elo - _ELO_MEAN) / ELO_SCALE)
    return math.sqrt(factor), 1.0 / math.sqrt(factor), elo

# ── Team form cache (football-data free tier allows ~10 req/min) ─────────────
_form_cache: dict[int, tuple[float, list[dict]]] = {}
_FORM_TTL = 6 * 3600  # 6 hours


def _headers() -> dict:
    return {"X-Auth-Token": os.getenv("FOOTBALL_API_KEY", "")}


def _get(path: str, timeout: int = 30) -> dict:
    with httpx.Client(timeout=httpx.Timeout(connect=20, read=timeout, write=10, pool=5)) as c:
        r = c.get(f"{FOOTBALL_BASE}{path}", headers=_headers())
        if r.status_code == 429:
            raise HTTPException(429, "Football API rate limit — wait a moment and retry.")
        if r.status_code == 403:
            raise HTTPException(403, "Football API access denied. Check FOOTBALL_API_KEY.")
        if r.status_code == 404:
            raise HTTPException(404, "Not found.")
        r.raise_for_status()
        return r.json()


def _fetch_team_matches(team_id: int) -> list[dict]:
    """Recent finished matches for a team, cached for 6 hours."""
    now = time.time()
    cached = _form_cache.get(team_id)
    if cached and now - cached[0] < _FORM_TTL:
        return cached[1]
    data = _get(f"/teams/{team_id}/matches?status=FINISHED&limit={FORM_MATCHES}")
    matches = data.get("matches", [])
    _form_cache[team_id] = (now, matches)
    return matches


# ── Strength estimation ───────────────────────────────────────────────────────
def _team_strength(team_id: int, tla: str | None = None,
                   before_iso: str | None = None) -> dict:
    """
    Estimate attack/defense strength from recent finished matches, shrunk
    toward an Elo-based prior (not neutral 1.0) when the sample is small.

    attack  > 1.0  → scores more than the baseline team
    defense < 1.0  → concedes less than the baseline team
    """
    prior_attack, prior_defense, elo = _elo_prior(tla)
    matches = _fetch_team_matches(team_id)

    rows = []
    for m in matches:
        ft = (m.get("score") or {}).get("fullTime") or {}
        hg, ag = ft.get("home"), ft.get("away")
        if hg is None or ag is None:
            continue
        # Exclude the fixture itself (and anything after it) when predicting
        # an already-played match, so the model never sees the answer.
        if before_iso and (m.get("utcDate") or "") >= before_iso:
            continue
        home_id = (m.get("homeTeam") or {}).get("id")
        if home_id == team_id:
            scored, conceded = hg, ag
        else:
            scored, conceded = ag, hg
        rows.append({
            "utcDate":  m.get("utcDate", ""),
            "scored":   int(scored),
            "conceded": int(conceded),
            "opponent": ((m.get("awayTeam") if home_id == team_id else m.get("homeTeam")) or {}).get("shortName", ""),
            "result":   "W" if scored > conceded else ("D" if scored == conceded else "L"),
        })

    # most recent first
    rows.sort(key=lambda r: r["utcDate"], reverse=True)

    if not rows:
        return {
            "attack": round(prior_attack, 3), "defense": round(prior_defense, 3),
            "matches": 0, "elo": elo,
            "avgScored": round(BASELINE_GOALS * prior_attack, 2),
            "avgConceded": round(BASELINE_GOALS * prior_defense, 2),
            "form": "", "recent": [],
        }

    w_sum = s_sum = c_sum = 0.0
    for i, r in enumerate(rows):
        w = DECAY ** i
        w_sum += w
        s_sum += w * r["scored"]
        c_sum += w * r["conceded"]

    avg_scored   = s_sum / w_sum
    avg_conceded = c_sum / w_sum

    # Shrink toward the Elo prior when the sample is small
    n = len(rows)
    trust = n / (n + SHRINK_K)
    attack  = prior_attack  + trust * (avg_scored / BASELINE_GOALS - prior_attack)
    defense = prior_defense + trust * (avg_conceded / BASELINE_GOALS - prior_defense)

    return {
        "attack":      round(attack, 3),
        "defense":     round(defense, 3),
        "matches":     n,
        "elo":         elo,
        "avgScored":   round(avg_scored, 2),
        "avgConceded": round(avg_conceded, 2),
        "form":        "".join(r["result"] for r in rows[:5]),
        "recent": [
            {"date": r["utcDate"][:10], "opponent": r["opponent"],
             "score": f"{r['scored']}-{r['conceded']}", "result": r["result"]}
            for r in rows[:5]
        ],
    }


# ── Poisson machinery ─────────────────────────────────────────────────────────
def _poisson_pmf(lmbda: float, k: int) -> float:
    return math.exp(-lmbda) * lmbda ** k / math.factorial(k)


def _dc_tau(x: int, y: int, lh: float, la: float, rho: float) -> float:
    """Dixon-Coles correction for the dependence in low-scoring games."""
    if x == 0 and y == 0:
        return 1.0 - lh * la * rho
    if x == 0 and y == 1:
        return 1.0 + lh * rho
    if x == 1 and y == 0:
        return 1.0 + la * rho
    if x == 1 and y == 1:
        return 1.0 - rho
    return 1.0


def _score_matrix(lam_home: float, lam_away: float) -> list[list[float]]:
    matrix = [
        [
            _poisson_pmf(lam_home, h) * _poisson_pmf(lam_away, a)
            * _dc_tau(h, a, lam_home, lam_away, DC_RHO)
            for a in range(MAX_GOALS + 1)
        ]
        for h in range(MAX_GOALS + 1)
    ]
    total = sum(sum(row) for row in matrix)
    return [[p / total for p in row] for row in matrix]


def _markets(matrix: list[list[float]]) -> dict:
    p_home = p_draw = p_away = p_btts = 0.0
    totals: dict[int, float] = {}
    for h in range(MAX_GOALS + 1):
        for a in range(MAX_GOALS + 1):
            p = matrix[h][a]
            if h > a:
                p_home += p
            elif h == a:
                p_draw += p
            else:
                p_away += p
            if h > 0 and a > 0:
                p_btts += p
            totals[h + a] = totals.get(h + a, 0.0) + p

    def p_over(line: float) -> float:
        return sum(p for g, p in totals.items() if g > line)

    over_under = {}
    for line in (0.5, 1.5, 2.5, 3.5, 4.5):
        over = p_over(line)
        over_under[str(line)] = {"over": round(over, 4), "under": round(1 - over, 4)}

    return {
        "homeWin": round(p_home, 4),
        "draw":    round(p_draw, 4),
        "awayWin": round(p_away, 4),
        "doubleChance": {
            "homeOrDraw": round(p_home + p_draw, 4),
            "awayOrDraw": round(p_away + p_draw, 4),
            "homeOrAway": round(p_home + p_away, 4),
        },
        "overUnder": over_under,
        "btts": {"yes": round(p_btts, 4), "no": round(1 - p_btts, 4)},
    }


def _top_scores(matrix: list[list[float]], n: int = 6) -> list[dict]:
    flat = [
        {"score": f"{h}-{a}", "home": h, "away": a, "probability": round(matrix[h][a], 4)}
        for h in range(MAX_GOALS + 1)
        for a in range(MAX_GOALS + 1)
    ]
    flat.sort(key=lambda s: s["probability"], reverse=True)
    return flat[:n]


def _reasoning(home: dict, away: dict, hs: dict, as_: dict,
               lam_h: float, lam_a: float, markets: dict, top: dict) -> str:
    verdict_p = max(markets["homeWin"], markets["draw"], markets["awayWin"])
    if verdict_p == markets["homeWin"]:
        verdict = f"{home['shortName']} to win"
    elif verdict_p == markets["awayWin"]:
        verdict = f"{away['shortName']} to win"
    else:
        verdict = "a draw"

    total_xg = lam_h + lam_a
    goals_note = (
        "a high-scoring game" if total_xg >= 3.0
        else "a moderate goal count" if total_xg >= 2.2
        else "a tight, low-scoring game"
    )

    def team_line(team: dict, s: dict) -> str:
        if s["matches"] == 0:
            return (f"{team['shortName']} have not played a covered match yet, so the model "
                    f"starts from their historical strength rating (Elo {s.get('elo', '—')})")
        return (f"{team['shortName']} average {s['avgScored']} scored / {s['avgConceded']} "
                f"conceded over their last {s['matches']} matches (form: {s['form']})")

    return (
        f"{team_line(home, hs)}; "
        f"{team_line(away, as_)}. "
        f"The model expects {lam_h:.2f} goals for {home['shortName']} and {lam_a:.2f} "
        f"for {away['shortName']}, pointing to {goals_note}. "
        f"Most likely outcome: {verdict} ({verdict_p:.0%}), "
        f"with {top['score']} the single most likely scoreline ({top['probability']:.0%})."
    )


# ── Grounded news context (Gemini + Google Search) ───────────────────────────
def _fixture_context(match_id: int, home: dict, away: dict, utc_date: str) -> dict | None:
    """
    Research the fixture for what form data cannot show: confirmed injuries
    and suspensions, squad rotation (e.g. already qualified), press-conference
    hints, and tournament psychology.

    Gemini does NOT predict the match. It returns two expected-goals factors
    (1.0 = no effect) that are hard-clamped before they touch the Poisson
    model, so all market probabilities stay internally consistent.
    """
    h, a = home.get("name", ""), away.get("name", "")
    prompt = f"""Use Google Search to research the upcoming football match
{h} vs {a} (FIFA World Cup, kickoff {utc_date[:16]} UTC).

Look ONLY for factual, recent news a statistics model cannot see:
- confirmed injuries, suspensions, or late fitness doubts for key players
- squad rotation / B-team plans (e.g. a side that has already qualified)
- manager press-conference hints about lineup or formation changes
- relevant tournament psychology or notable head-to-head history

Do NOT judge general form or quality — a statistical model already covers
that. If you find nothing concrete and recent, both factors must be 1.0.

Then output a JSON object (no other JSON in your reply):
{{
  "home_xg_factor": <number {CTX_FACTOR_MIN}-{CTX_FACTOR_MAX}, 1.0 = no news effect on {h}'s expected goals>,
  "away_xg_factor": <number {CTX_FACTOR_MIN}-{CTX_FACTOR_MAX}, 1.0 = no news effect on {a}'s expected goals>,
  "key_factors": [<up to 4 short strings, each one concrete finding with its date>],
  "summary": "<1-2 sentences for fans; empty string if nothing found>"
}}

Calibration guide: a missing starter ≈ 0.95; the team's main striker or
playmaker ruled out ≈ 0.85-0.90; confirmed B-squad / heavy rotation ≈ 0.80.
Only move a factor when a search result supports it."""

    raw = grounded_research(prompt, cache_key=f"foot:{match_id}", ttl=CTX_TTL)
    if not raw:
        return None

    home_f = clamp(raw.get("home_xg_factor"), CTX_FACTOR_MIN, CTX_FACTOR_MAX, 1.0)
    away_f = clamp(raw.get("away_xg_factor"), CTX_FACTOR_MIN, CTX_FACTOR_MAX, 1.0)
    key_factors = [str(k) for k in raw.get("key_factors", []) if str(k).strip()][:4]
    summary = str(raw.get("summary", "")).strip()

    if home_f == 1.0 and away_f == 1.0 and not summary:
        return None
    return {
        "homeXgFactor": round(home_f, 3),
        "awayXgFactor": round(away_f, 3),
        "keyFactors": key_factors,
        "summary": summary,
        "source": "Gemini + Google Search",
    }


# ── Public entry point ────────────────────────────────────────────────────────
def predict_match(match_id: int) -> dict:
    match = _get(f"/matches/{match_id}")
    home = match.get("homeTeam") or {}
    away = match.get("awayTeam") or {}
    if not home.get("id") or not away.get("id"):
        raise HTTPException(409, "Teams for this fixture are not decided yet.")

    status   = match.get("status", "")
    utc_date = match.get("utcDate", "")
    finished = status == "FINISHED"

    # For finished matches, only use form from before kickoff (no leakage).
    before = utc_date if finished else None
    hs  = _team_strength(home["id"], tla=home.get("tla"), before_iso=before)
    as_ = _team_strength(away["id"], tla=away.get("tla"), before_iso=before)

    lam_h = BASELINE_GOALS * hs["attack"] * as_["defense"] * HOME_ADV
    lam_a = BASELINE_GOALS * as_["attack"] * hs["defense"]

    # Grounded news adjustment — only for matches still to be played, so a
    # finished match is always predicted blind (Gemini would know the result).
    context = None if finished else _fixture_context(match_id, home, away, utc_date)
    if context:
        lam_h *= context["homeXgFactor"]
        lam_a *= context["awayXgFactor"]

    lam_h = min(max(lam_h, LAMBDA_MIN), LAMBDA_MAX)
    lam_a = min(max(lam_a, LAMBDA_MIN), LAMBDA_MAX)

    matrix  = _score_matrix(lam_h, lam_a)
    markets = _markets(matrix)
    top     = _top_scores(matrix)

    team_info = lambda t: {
        "id": t.get("id"), "name": t.get("name", ""),
        "shortName": t.get("shortName") or t.get("name", ""),
        "crest": t.get("crest", ""), "tla": t.get("tla", ""),
    }

    ft = (match.get("score") or {}).get("fullTime") or {}

    return {
        "matchId":  match_id,
        "utcDate":  utc_date,
        "status":   status,
        "stage":    match.get("stage", ""),
        "homeTeam": team_info(home),
        "awayTeam": team_info(away),
        "actualScore": (
            {"home": ft.get("home"), "away": ft.get("away")} if finished else None
        ),
        "model": {
            "type": "Time-decayed Poisson with Elo priors (Dixon-Coles adjusted)"
                    + (" + grounded news adjustment" if context else ""),
            "expectedGoals": {"home": round(lam_h, 2), "away": round(lam_a, 2)},
            "homeForm": hs,
            "awayForm": as_,
            "contextAdjustment": context,
        },
        "prediction": {
            "outcome": markets,
            "predictedScore": {"home": top[0]["home"], "away": top[0]["away"]},
            "correctScores": top,
            "reasoning": _reasoning(home, away, hs, as_, lam_h, lam_a, markets, top[0])
                         + (f" News check: {context['summary']}" if context and context["summary"] else ""),
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "disclaimer": (
            "Probabilities are model estimates from recent form, not guarantees. "
            "Football has high inherent randomness — no predictor is perfect."
        ),
    }
