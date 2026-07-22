"""
Football match/team/player projection engine.

Model: time-decayed Poisson with Dixon-Coles low-score correction -- the
same family of model bookmakers use to seed football odds. For each team
we estimate attack and defense strength from its own recent finished
matches (exponentially decayed so recent form counts more), shrunk toward
a neutral baseline when the sample is small. Unlike the previous World Cup
version of this module, there is no external Elo prior here: club
competitions don't have the equivalent of ~150 years of international
match history to seed one, so early-season strength estimates start
neutral and sharpen as we ingest more of our own match data (see
football_refresh.py). The two strengths combine into expected goals
(lambda) for each side, which feed a full Poisson score matrix. Every
market is derived from that matrix.

This module is intentionally free of any Gemini/LLM code, mirroring
nba_model.py -- it is a pure, deterministic engine. AI-assisted refinement
(the evidence-gated clamp) is orchestrated by the caller (football_server.py),
exactly like server.py owns that step for the NBA model.

All functions take match/team data as plain dicts/lists rather than
fetching anything themselves -- the caller (football_server.py) owns
loading that data from Supabase into memory and passes in the relevant
slice. This keeps the engine pure and easily testable.
"""

from __future__ import annotations

import math

# ── Model constants ───────────────────────────────────────────────────────────
BASELINE_GOALS = 1.35   # avg goals per team per match in top European club football
DECAY          = 0.90   # per-match exponential decay on form weighting
SHRINK_K       = 6.0    # form trust: with only ~1 season of our own ingested match
                        # history per team (not decades like the old Elo prior),
                        # a team needs ~6 matches to reach 50% trust vs. the
                        # neutral 1.0/1.0 baseline -- a documented judgment call,
                        # not backtest-tuned (no historical club dataset to tune against).
H2H_N          = 3      # head-to-head: last N meetings between the two sides
H2H_SHRINK     = 30.0   # lightly blended -- club h2h samples within one ingested
                        # season are usually tiny (1-4 meetings), so this stays
                        # a minor nudge, same spirit as the old WC model.
HOME_ADV       = 1.35   # club-football-typical home advantage (real venues, unlike
                        # the World Cup's neutral-venue tournament format)
DC_RHO         = -0.10  # Dixon-Coles low-score dependence parameter
MAX_GOALS      = 10     # score matrix dimension (0..10 goals each side)
LAMBDA_MIN     = 0.20
LAMBDA_MAX     = 4.50


# ── Team strength from our own ingested match history ────────────────────────
def team_strength(team_id: int, matches: list[dict], before_iso: str | None = None) -> dict:
    """
    Estimate attack/defense strength for a team from its own finished
    matches, shrunk toward a neutral 1.0/1.0 baseline when the sample is
    small.

    attack  > 1.0  -> scores more than the baseline team
    defense < 1.0  -> concedes less than the baseline team

    `matches` is any list of match dicts with home_team_id, away_team_id,
    full_time_home, full_time_away, status, utc_date -- typically every
    match for the relevant competition(s), pre-filtered or not (this
    function filters to the given team_id itself).
    """
    rows = []
    for m in matches:
        if m.get("status") != "FINISHED":
            continue
        hg, ag = m.get("full_time_home"), m.get("full_time_away")
        if hg is None or ag is None:
            continue
        if before_iso and (m.get("utc_date") or "") >= before_iso:
            continue
        home_id, away_id = m.get("home_team_id"), m.get("away_team_id")
        if team_id == home_id:
            scored, conceded = hg, ag
        elif team_id == away_id:
            scored, conceded = ag, hg
        else:
            continue
        rows.append({"utc_date": m.get("utc_date") or "", "scored": scored, "conceded": conceded})

    rows.sort(key=lambda r: r["utc_date"], reverse=True)

    if not rows:
        return {
            "attack": 1.0, "defense": 1.0, "matches": 0,
            "avgScored": BASELINE_GOALS, "avgConceded": BASELINE_GOALS,
            "form": "", "recent": [],
        }

    w_sum = s_sum = c_sum = 0.0
    for i, r in enumerate(rows):
        w = DECAY ** i
        w_sum += w
        s_sum += w * r["scored"]
        c_sum += w * r["conceded"]
    avg_scored = s_sum / w_sum
    avg_conceded = c_sum / w_sum

    n = len(rows)
    trust = n / (n + SHRINK_K)
    attack = 1.0 + trust * (avg_scored / BASELINE_GOALS - 1.0)
    defense = 1.0 + trust * (avg_conceded / BASELINE_GOALS - 1.0)

    def _result(r):
        return "W" if r["scored"] > r["conceded"] else ("D" if r["scored"] == r["conceded"] else "L")

    return {
        "attack": round(attack, 3), "defense": round(defense, 3), "matches": n,
        "avgScored": round(avg_scored, 2), "avgConceded": round(avg_conceded, 2),
        "form": "".join(_result(r) for r in rows[:5]),
        "recent": [
            {"date": r["utc_date"][:10], "score": f"{r['scored']}-{r['conceded']}", "result": _result(r)}
            for r in rows[:5]
        ],
    }


def h2h_factors(team_a_id: int, team_b_id: int, matches: list[dict],
                before_iso: str | None = None) -> dict | None:
    """
    Multiplicative goal factors from the last H2H_N meetings between two
    teams, oriented to team_a (aFactor scales team_a's expected goals,
    bFactor scales team_b's). Pure query against our own ingested matches --
    no live API call, no offline export file needed, since we hold the
    full match history for every ingested competition ourselves.
    """
    rows = []
    for m in matches:
        if m.get("status") != "FINISHED":
            continue
        hg, ag = m.get("full_time_home"), m.get("full_time_away")
        if hg is None or ag is None:
            continue
        home_id, away_id = m.get("home_team_id"), m.get("away_team_id")
        if {home_id, away_id} != {team_a_id, team_b_id}:
            continue
        if before_iso and (m.get("utc_date") or "") >= before_iso:
            continue
        if home_id == team_a_id:
            scored, conceded = hg, ag
        else:
            scored, conceded = ag, hg
        rows.append({"utc_date": m.get("utc_date") or "", "scored": scored, "conceded": conceded})

    rows.sort(key=lambda r: r["utc_date"], reverse=True)
    rows = rows[:H2H_N]
    if not rows:
        return None

    w_sum = s_sum = c_sum = 0.0
    for i, r in enumerate(rows):
        w = DECAY ** i
        w_sum += w
        s_sum += w * r["scored"]
        c_sum += w * r["conceded"]
    att = (s_sum / w_sum) / BASELINE_GOALS
    con = (c_sum / w_sum) / BASELINE_GOALS
    t = len(rows) / (len(rows) + H2H_SHRINK)
    return {
        "aFactor": round(min(max(1.0 + t * (att - 1.0), 0.80), 1.25), 3),
        "bFactor": round(min(max(1.0 + t * (con - 1.0), 0.80), 1.25), 3),
        "meetings": [f"{r['utc_date'][:10]}: {r['scored']}-{r['conceded']}" for r in rows],
    }


# ── Poisson / Dixon-Coles machinery (unchanged from the World Cup version --
#    this math is competition-agnostic) ───────────────────────────────────────
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


def score_matrix(lam_a: float, lam_b: float) -> list[list[float]]:
    matrix = [
        [
            _poisson_pmf(lam_a, a) * _poisson_pmf(lam_b, b)
            * _dc_tau(a, b, lam_a, lam_b, DC_RHO)
            for b in range(MAX_GOALS + 1)
        ]
        for a in range(MAX_GOALS + 1)
    ]
    total = sum(sum(row) for row in matrix)
    return [[p / total for p in row] for row in matrix]


def _markets(matrix: list[list[float]]) -> dict:
    """From team_a's perspective: p_a = a scores more, p_b = b scores more."""
    p_a = p_draw = p_b = p_btts = 0.0
    totals: dict[int, float] = {}
    for a in range(MAX_GOALS + 1):
        for b in range(MAX_GOALS + 1):
            p = matrix[a][b]
            if a > b:
                p_a += p
            elif a == b:
                p_draw += p
            else:
                p_b += p
            if a > 0 and b > 0:
                p_btts += p
            totals[a + b] = totals.get(a + b, 0.0) + p

    def p_over(line: float) -> float:
        return sum(p for g, p in totals.items() if g > line)

    over_under = {}
    for line in (0.5, 1.5, 2.5, 3.5, 4.5):
        over = p_over(line)
        over_under[str(line)] = {"over": round(over, 4), "under": round(1 - over, 4)}

    return {
        "aWin": round(p_a, 4), "draw": round(p_draw, 4), "bWin": round(p_b, 4),
        "overUnder": over_under,
        "btts": {"yes": round(p_btts, 4), "no": round(1 - p_btts, 4)},
    }


def _top_scores(matrix: list[list[float]], n: int = 6) -> list[dict]:
    flat = [
        {"score": f"{a}-{b}", "a": a, "b": b, "probability": round(matrix[a][b], 4)}
        for a in range(MAX_GOALS + 1)
        for b in range(MAX_GOALS + 1)
    ]
    flat.sort(key=lambda s: s["probability"], reverse=True)
    return flat[:n]


# ── Shared lambda computation ─────────────────────────────────────────────────
def _compute_lambdas(home_id: int, away_id: int, matches: list[dict],
                     before_iso: str | None = None) -> tuple[float, float, dict, dict, dict | None]:
    hs = team_strength(home_id, matches, before_iso)
    as_ = team_strength(away_id, matches, before_iso)
    lam_h = BASELINE_GOALS * hs["attack"] * as_["defense"] * HOME_ADV
    lam_a = BASELINE_GOALS * as_["attack"] * hs["defense"]
    h2h = h2h_factors(home_id, away_id, matches, before_iso)
    if h2h:
        lam_h *= h2h["aFactor"]
        lam_a *= h2h["bFactor"]
    lam_h = min(max(lam_h, LAMBDA_MIN), LAMBDA_MAX)
    lam_a = min(max(lam_a, LAMBDA_MIN), LAMBDA_MAX)
    return lam_h, lam_a, hs, as_, h2h


# ── Public: fixture (two-sided) prediction ────────────────────────────────────
def predict_fixture(match: dict, home_team: dict, away_team: dict, matches: list[dict]) -> dict:
    """
    Full two-sided prediction for a specific fixture (home_team vs away_team).
    `match` needs at minimum {status, utc_date}; used to decide whether to
    predict "blind" (finished match -- only pre-kickoff form is used, so
    backtesting/inspection never leaks the result).
    """
    finished = match.get("status") == "FINISHED"
    before = match.get("utc_date") if finished else None
    home_id, away_id = home_team["id"], away_team["id"]

    lam_h, lam_a, hs, as_, h2h = _compute_lambdas(home_id, away_id, matches, before)
    matrix = score_matrix(lam_h, lam_a)
    markets = _markets(matrix)
    top = _top_scores(matrix)

    verdict_p = max(markets["aWin"], markets["draw"], markets["bWin"])
    if verdict_p == markets["aWin"]:
        verdict = f"{home_team.get('shortName', home_team.get('name', 'Home'))} to win"
    elif verdict_p == markets["bWin"]:
        verdict = f"{away_team.get('shortName', away_team.get('name', 'Away'))} to win"
    else:
        verdict = "a draw"

    reasoning = (
        f"The model expects {lam_h:.2f} goals for {home_team.get('shortName', 'the home side')} and "
        f"{lam_a:.2f} for {away_team.get('shortName', 'the away side')}, based on {hs['matches']} and "
        f"{as_['matches']} matches of recent form respectively. Most likely outcome: {verdict} "
        f"({verdict_p:.0%}), with {top[0]['score']} the single most likely scoreline ({top[0]['probability']:.0%})."
    )

    return {
        "homeTeam": home_team, "awayTeam": away_team,
        "model": {
            "type": "Time-decayed Poisson (Dixon-Coles adjusted)",
            "expectedGoals": {"home": round(lam_h, 2), "away": round(lam_a, 2)},
            "homeForm": hs, "awayForm": as_, "headToHead": h2h,
        },
        "prediction": {
            "outcome": {
                "homeWin": markets["aWin"], "draw": markets["draw"], "awayWin": markets["bWin"],
                "overUnder": markets["overUnder"], "btts": markets["btts"],
            },
            "predictedScore": {"home": top[0]["a"], "away": top[0]["b"]},
            "correctScores": [{"score": s["score"], "home": s["a"], "away": s["b"], "probability": s["probability"]} for s in top],
            "reasoning": reasoning,
        },
        "disclaimer": (
            "Probabilities are model estimates from recent form, not guarantees. "
            "Football has high inherent randomness -- no predictor is perfect."
        ),
    }


# ── Public: single-team "next match" prediction ───────────────────────────────
def predict_team_next_match(team_id: int, opponent_id: int, is_home: bool,
                             matches: list[dict], context: dict | None = None) -> dict:
    """
    Single-team-perspective prediction for `team_id`'s next match against
    `opponent_id`. `context`, if given, is `{"forFactor":, "againstFactor":}`
    -- already clamped by the caller (see football_server.py's evidence-gated
    Gemini refinement, mirroring server.py's NBA pattern).
    """
    if is_home:
        lam_h, lam_a, hs, os_, _ = _compute_lambdas(team_id, opponent_id, matches)
        lam_for, lam_against, form = lam_h, lam_a, hs
    else:
        lam_h, lam_a, os_, hs, _ = _compute_lambdas(opponent_id, team_id, matches)
        lam_for, lam_against, form = lam_a, lam_h, hs

    if context:
        lam_for *= context.get("forFactor", 1.0)
        lam_against *= context.get("againstFactor", 1.0)
        lam_for = min(max(lam_for, LAMBDA_MIN), LAMBDA_MAX)
        lam_against = min(max(lam_against, LAMBDA_MIN), LAMBDA_MAX)

    matrix = score_matrix(lam_for, lam_against)
    m = _markets(matrix)
    clean_sheet_p = sum(matrix[g][0] for g in range(MAX_GOALS + 1))

    sd_for = math.sqrt(lam_for)
    sd_against = math.sqrt(lam_against)

    reasoning = (
        f"Model expects {lam_for:.2f} goals for and {lam_against:.2f} against, based on "
        f"{form['matches']} matches of recent form"
        f"{' with home advantage applied' if is_home else ' (away fixture)'}. "
        f"Win/draw/loss odds: {m['aWin']:.0%} / {m['draw']:.0%} / {m['bWin']:.0%}."
    )

    return {
        "goals_for_predicted": round(lam_for, 1),
        "goals_for_low": round(max(0.0, lam_for - sd_for), 1),
        "goals_for_high": round(lam_for + sd_for, 1),
        "goals_against_predicted": round(lam_against, 1),
        "goals_against_low": round(max(0.0, lam_against - sd_against), 1),
        "goals_against_high": round(lam_against + sd_against, 1),
        "clean_sheet_probability": round(clean_sheet_p, 3),
        "win_probability": m["aWin"],
        "draw_probability": m["draw"],
        "loss_probability": m["bWin"],
        "prediction_reasoning": reasoning,
    }


# ── Public: player "next match" prediction ────────────────────────────────────
def predict_player_next_match(goals: int, assists: int, played_matches: int,
                              opponent_defense_factor: float, is_home: bool,
                              context: dict | None = None) -> dict:
    """
    Season-rate heuristic for a player's next match -- there is no per-game
    player data anywhere on this API tier to fit a real per-match model
    against (only season-aggregate goals/assists from the scorers endpoint),
    so this scales the player's season rate by the next opponent's
    defensive strength and a mild home/away nudge. `context`, if given, is
    `{"goalsFactor":, "assistsFactor":}` -- already clamped by the caller.
    """
    played = max(played_matches, 1)
    goals_rate = goals / played
    assists_rate = assists / played

    loc_adj = 1.10 if is_home else 0.92
    goals_pred = goals_rate * opponent_defense_factor * loc_adj
    assists_pred = assists_rate * opponent_defense_factor * loc_adj

    if context:
        goals_pred *= context.get("goalsFactor", 1.0)
        assists_pred *= context.get("assistsFactor", 1.0)

    def _band(v: float) -> tuple[float, float]:
        return round(max(0.0, v * 0.4), 2), round(v * 2.2 + 0.15, 2)

    g_low, g_high = _band(goals_pred)
    a_low, a_high = _band(assists_pred)

    reasoning = (
        f"Based on this season's rate of {goals_rate:.2f} goals and {assists_rate:.2f} assists "
        f"per game across {played} matches, adjusted for the next opponent's defensive record"
        f"{' and home advantage' if is_home else ''}. Football has no per-game player stats on "
        f"this data tier, so this is a season-rate estimate rather than a per-match model."
    )

    return {
        "goals_predicted": round(goals_pred, 2), "goals_low": g_low, "goals_high": g_high,
        "assists_predicted": round(assists_pred, 2), "assists_low": a_low, "assists_high": a_high,
        "involvement_predicted": round(goals_pred + assists_pred, 2),
        "prediction_reasoning": reasoning,
    }
