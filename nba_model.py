"""
NBA statistical projection engine.

Replaces "ask the LLM to guess a number" with a real model:

1. Exponentially weighted recent form (last 10 games, recent weighted more)
   blended with the season baseline.
2. Opponent defensive adjustment — how much the next opponent allows in each
   stat relative to the league average, computed from the same game logs.
3. Home/away split adjustment (dampened).
4. Back-to-back fatigue discount.
5. Prediction intervals from the player's own game-to-game volatility.

Gemini is then used only to sanity-check within tight bounds and write the
reasoning — and if Gemini is down, the model's numbers stand on their own.
"""

from __future__ import annotations

import math

import pandas as pd

RECENT_N      = 10    # games used for form
FORM_DECAY    = 0.85  # weight decay per game back
FORM_BLEND    = 0.65  # weight on recent form vs season baseline
OPP_DAMPEN    = 0.50  # how strongly opponent defense moves the projection
LOC_DAMPEN    = 0.40  # how strongly home/away split moves the projection
B2B_FACTOR    = 0.95  # fatigue discount on a back-to-back
INTERVAL_Z    = 0.95  # ~66% interval width multiplier on stddev

PLAYER_STATS = ["PTS", "AST", "REB", "FG3M", "STL", "BLK"]


# ── Opponent defensive factors ────────────────────────────────────────────────
_def_cache: dict = {"key": None, "factors": None}


def _team_game_totals(df: pd.DataFrame) -> pd.DataFrame:
    """One row per (GAME_ID, TEAM): summed team stats."""
    cols = {s: "sum" for s in PLAYER_STATS if s in df.columns}
    g = df.groupby(["GAME_ID", "TEAM_ABBREVIATION"], as_index=False).agg(cols)
    return g


def opponent_defense_factors(df: pd.DataFrame) -> dict[str, dict[str, float]]:
    """
    For every team, the average each stat *allowed* to opponents,
    expressed as a ratio to the league average. 1.05 PTS means
    opponents score 5% more than usual against this team.

    Cached and keyed on dataset size so it recomputes after refreshes.
    """
    key = (len(df), str(df["GAME_DATE"].max()) if len(df) else "")
    if _def_cache["key"] == key:
        return _def_cache["factors"]

    totals = _team_game_totals(df.fillna(0))
    # Join each team-game row to its opponent's row in the same game
    merged = totals.merge(totals, on="GAME_ID", suffixes=("", "_OPP"))
    merged = merged[merged["TEAM_ABBREVIATION"] != merged["TEAM_ABBREVIATION_OPP"]]

    factors: dict[str, dict[str, float]] = {}
    if merged.empty:
        _def_cache.update(key=key, factors=factors)
        return factors

    for stat in PLAYER_STATS:
        opp_col = f"{stat}_OPP"
        if opp_col not in merged.columns:
            continue
        league_avg = merged[opp_col].mean()
        if not league_avg:
            continue
        allowed = merged.groupby("TEAM_ABBREVIATION")[opp_col].mean()
        for team, val in allowed.items():
            factors.setdefault(team, {})[stat] = round(float(val) / float(league_avg), 3)

    _def_cache.update(key=key, factors=factors)
    return factors


# ── Core projection helpers ───────────────────────────────────────────────────
def _weighted_mean(values: list[float], decay: float = FORM_DECAY) -> float:
    if not values:
        return 0.0
    w_sum = v_sum = 0.0
    for i, v in enumerate(values):
        w = decay ** i
        w_sum += w
        v_sum += w * v
    return v_sum / w_sum


def _stddev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = sum(values) / len(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / (len(values) - 1))


def _adjustment(ratio: float, dampen: float) -> float:
    """Pull a ratio toward 1.0 so single factors can't swing wildly."""
    return 1.0 + dampen * (ratio - 1.0)


def project_stats(
    games: list[dict],
    stat_keys: dict[str, str],
    opponent_factors: dict[str, float] | None,
    next_home_away: str | None,
    is_b2b: bool,
) -> dict:
    """
    games: list of game dicts, most recent first, with lowercase stat keys
           and a 'matchup' field ('XXX vs. YYY' = home).
    stat_keys: maps output name -> key in the game dict, e.g. {'PTS': 'pts'}.
    opponent_factors: per-stat defensive ratios for the next opponent.
    Returns {STAT: {'predicted', 'low', 'high', 'recentAvg', 'seasonAvg'}}.
    """
    recent = games[:RECENT_N]
    out: dict[str, dict] = {}

    for stat, key in stat_keys.items():
        season_vals = [float(g.get(key, 0) or 0) for g in games]
        recent_vals = [float(g.get(key, 0) or 0) for g in recent]

        season_avg = sum(season_vals) / len(season_vals) if season_vals else 0.0
        form       = _weighted_mean(recent_vals)
        base       = FORM_BLEND * form + (1 - FORM_BLEND) * season_avg

        pred = base
        if opponent_factors and stat in opponent_factors:
            pred *= _adjustment(opponent_factors[stat], OPP_DAMPEN)

        if next_home_away in ("HOME", "AWAY") and season_avg > 0:
            split = [
                float(g.get(key, 0) or 0) for g in games
                if (("vs." in str(g.get("matchup", ""))) == (next_home_away == "HOME"))
            ]
            if len(split) >= 3:
                split_avg = sum(split) / len(split)
                pred *= _adjustment(split_avg / season_avg, LOC_DAMPEN)

        if is_b2b:
            pred *= B2B_FACTOR

        sd   = _stddev(recent_vals) or max(0.15 * base, 0.5)
        low  = max(0.0, pred - INTERVAL_Z * sd)
        high = pred + INTERVAL_Z * sd

        out[stat] = {
            "predicted": round(pred, 1),
            "low":       round(low, 1),
            "high":      round(high, 1),
            "recentAvg": round(form, 1),
            "seasonAvg": round(season_avg, 1),
        }

    return out


def detect_next_b2b(games: list[dict], next_game_date: str | None) -> bool:
    """True if the upcoming game falls the day after the most recent game."""
    if not games or not next_game_date:
        return False
    try:
        last = pd.to_datetime(games[0]["gameDate"])
        nxt  = pd.to_datetime(next_game_date)
        return abs((nxt - last).days) == 1
    except Exception:
        return False


def to_int_payload(proj: dict, mapping: dict[str, str]) -> dict:
    """Flatten projection into the legacy *_predicted/_low/_high integer keys."""
    payload: dict = {}
    for stat, prefix in mapping.items():
        p = proj.get(stat, {})
        payload[f"{prefix}_predicted"] = int(round(p.get("predicted", 0)))
        payload[f"{prefix}_low"]       = int(round(p.get("low", 0)))
        payload[f"{prefix}_high"]      = int(round(p.get("high", 0)))
    return payload
