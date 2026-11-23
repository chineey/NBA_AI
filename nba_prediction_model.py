"""
NBA statistical projection engine.

Replaces "ask the LLM to guess a number" with a calibrated statistical model
validated via zero-leakage walk-forward backtesting (`backtest.py`):

1. DNP filtering: excludes 0-minute DNP rows when at least 3 active games exist,
   preserving genuine low-minute rotation appearances.
2. Minutes x Per-Minute Rate projection: projects expected minutes from
   exponentially weighted recent minutes and season average (with a starter vs.
   bench role stability weight), then multiplies by a minute-weighted blended
   per-minute production rate (blended 70/30 with direct per-game rate to
   stabilize non-linear usage shifts).
3. De-overlapped recent/season blend & Empirical-Bayes shrinkage: scales down
   recent-form weight early in the season when the recent window overlaps with
   the season window, and shrinks per-minute rates toward league priors.
4. Opponent defensive adjustment: how much the next opponent allows in each
   stat relative to the league average, cached by dataset size and max date.
5. Flat league-wide home/away adjustment (+1.5% home, -1.5% away), replacing
   noisy small-sample per-player home/away splits.
6. Back-to-back fatigue discount.
7. Distribution-appropriate ~66% prediction intervals: pooled recent+season
   standard deviation with predictive sample inflation sqrt(1 + 1/n) for
   PTS/AST/REB, and closed-form Wilson-Hilferty Gamma-Poisson (overdispersed
   count) quantiles for low-count stats (FG3M, STL, BLK).
"""

from __future__ import annotations

import math

import pandas as pd

# ── Tuned constants (fit on train <= 2026-11-16, validated on held-out > 2026-11-16) ──
RECENT_N      = 10     # 10-game recent form window; beat 8 and 12 on train & held-out MAE
FORM_DECAY    = 0.80   # Exponential decay per game back; tuned from 0.85 via train grid search
FORM_BLEND    = 0.30   # Base weight on recent form vs season baseline (reduced from 0.65 to curb noise)
OPP_DAMPEN    = 0.50   # Dampening on opponent defensive ratio; 0.50 optimal on train & held-out
LOC_DAMPEN    = 0.015  # Flat league-wide home/away edge (+1.5% home, -1.5% away); replaced noisy per-player split
B2B_FACTOR    = 0.96   # Back-to-back fatigue multiplier (-4%); tuned from 0.95 on train split
INTERVAL_Z    = 0.98   # Normal multiplier for continuous stats (PTS, AST, REB) targeting ~66% coverage
COUNT_Z       = 1.10   # Wilson-Hilferty Gamma-Poisson multiplier for low-count stats (FG3M, STL, BLK)
PRIOR_GAMES   = 1.5    # Empirical-Bayes pseudo-games pulling early-season rates toward league priors

PLAYER_STATS = ["PTS", "AST", "REB", "FG3M", "STL", "BLK"]

# League-average per-minute priors used for small-sample Empirical-Bayes shrinkage
_LEAGUE_RATE_PRIOR: dict[str, float] = {
    "PTS":  0.460,
    "AST":  0.105,
    "REB":  0.180,
    "FG3M": 0.055,
    "STL":  0.032,
    "BLK":  0.021,
}

_LEAGUE_PG_PRIOR: dict[str, float] = {
    "PTS":  11.0,
    "AST":  2.5,
    "REB":  4.3,
    "FG3M": 1.3,
    "STL":  0.77,
    "BLK":  0.50,
}

_LOW_COUNT_STATS = {"FG3M", "STL", "BLK"}


# ── Opponent defensive factors ────────────────────────────────────────────────
_def_cache: dict = {"key": None, "factors": None}


def _team_game_totals(df: pd.DataFrame) -> pd.DataFrame:
    """One row per (GAME_ID, TEAM): summed team stats."""
    cols = {s: "sum" for s in PLAYER_STATS if s in df.columns}
    g = df.groupby(["GAME_ID", "TEAM_ABBREVIATION"], as_index=False, observed=True).agg(cols)
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
        allowed = merged.groupby("TEAM_ABBREVIATION", observed=True)[opp_col].mean()
        for team, val in allowed.items():
            factors.setdefault(str(team), {})[stat] = round(float(val) / float(league_avg), 3)

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


def _gamma_poisson_interval(mu: float, sd: float, stat: str) -> tuple[float, float]:
    """
    Closed-form Wilson-Hilferty Gamma-Poisson (overdispersed count) ~66% interval
    for low-count stats (FG3M, STL, BLK).
    """
    if mu <= 0.05:
        return (0.0, 0.5)
    # Overdispersed count variance: blend player sample variance with Poisson variance (mu)
    if stat == "BLK":
        var = max(0.75 * (sd ** 2) + 0.25 * mu, 0.08)
        z = 0.92
    else:
        var = max(sd ** 2, mu * 0.95, 0.12)
        z = COUNT_Z
    k = max(0.25, (mu ** 2) / var)
    inv_9k = 1.0 / (9.0 * k)
    se_cube = 1.0 / (3.0 * math.sqrt(k))
    lo_cube = 1.0 - inv_9k - z * se_cube
    hi_cube = 1.0 - inv_9k + z * se_cube
    low = mu * (lo_cube ** 3) if lo_cube > 0 else 0.0
    high = mu * (max(0.0, hi_cube) ** 3)
    return (round(max(0.0, low), 1), round(max(low + 0.4, high), 1))


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
    # Filter pure 0-minute DNPs when enough active appearances exist (team logs lack 'min' and keep all rows)
    has_min = any(float(g.get("min", 0) or 0) > 0 for g in games)
    if has_min:
        active_games = [g for g in games if float(g.get("min", 0) or 0) > 0]
        use_games = active_games if len(active_games) >= 3 else games
    else:
        use_games = games

    recent = use_games[:RECENT_N]
    n_total = len(use_games)

    # De-overlap recent window vs season window early in the season
    non_overlap_share = max(0, n_total - RECENT_N) / max(n_total, 1)
    eff_blend = FORM_BLEND * (0.35 + 0.65 * non_overlap_share)

    # Expected minutes projection (Candidate 1) when player minutes are available
    proj_min = 0.0
    s_min_sum = 0.0
    if has_min and use_games:
        s_mins = [float(g.get("min", 0) or 0) for g in use_games]
        r_mins = [float(g.get("min", 0) or 0) for g in recent]
        s_min_sum = sum(s_mins)
        s_min_avg = s_min_sum / len(s_mins)
        r_min_avg = _weighted_mean(r_mins, decay=FORM_DECAY)
        # Starters (season avg >= 24 min) have steadier role allocation than bench rotation players
        role_weight = 0.45 if s_min_avg >= 24.0 else 0.30
        min_weight = role_weight * (eff_blend / max(FORM_BLEND, 1e-6))
        proj_min = min_weight * r_min_avg + (1.0 - min_weight) * s_min_avg

    out: dict[str, dict] = {}

    for stat, key in stat_keys.items():
        season_vals = [float(g.get(key, 0) or 0) for g in use_games]
        recent_vals = [float(g.get(key, 0) or 0) for g in recent]

        season_avg = sum(season_vals) / len(season_vals) if season_vals else 0.0
        form       = _weighted_mean(recent_vals, decay=FORM_DECAY)

        if has_min and proj_min > 0 and s_min_sum > 0:
            s_rate = sum(season_vals) / s_min_sum
            w_stat = w_min = 0.0
            for idx, g in enumerate(recent):
                w = FORM_DECAY ** idx
                w_stat += w * float(g.get(key, 0) or 0)
                w_min += w * float(g.get("min", 0) or 0)
            r_rate = (w_stat / w_min) if w_min > 0 else s_rate

            prior_rate = _LEAGUE_RATE_PRIOR.get(stat, s_rate)
            shrunk_s_rate = (n_total * s_rate + PRIOR_GAMES * prior_rate) / (n_total + PRIOR_GAMES)
            blended_rate = eff_blend * r_rate + (1.0 - eff_blend) * shrunk_s_rate

            rate_proj = proj_min * blended_rate
            pg_proj = eff_blend * form + (1.0 - eff_blend) * season_avg
            base = 0.70 * rate_proj + 0.30 * pg_proj
        else:
            prior_pg = _LEAGUE_PG_PRIOR.get(stat, season_avg)
            shrunk_s_avg = (n_total * season_avg + PRIOR_GAMES * prior_pg) / (max(n_total, 1) + PRIOR_GAMES) if use_games else 0.0
            base = eff_blend * form + (1.0 - eff_blend) * shrunk_s_avg

        pred = base
        if opponent_factors and stat in opponent_factors:
            pred *= _adjustment(opponent_factors[stat], OPP_DAMPEN)

        # Flat league-wide home/away location adjustment (+1.5% HOME, -1.5% AWAY)
        if next_home_away == "HOME":
            pred *= 1.0 + LOC_DAMPEN
        elif next_home_away == "AWAY":
            pred *= 1.0 - LOC_DAMPEN

        if is_b2b:
            pred *= B2B_FACTOR

        # Pooled recent + season volatility with predictive sample inflation sqrt(1 + 1/n)
        sd_rec = _stddev(recent_vals)
        sd_sea = _stddev(season_vals)
        sd_pool = (0.5 * sd_rec + 0.5 * sd_sea) if (sd_rec > 0 and sd_sea > 0) else (sd_sea or sd_rec)
        sd_pred = (sd_pool * math.sqrt(1.0 + 1.0 / max(n_total, 2))) or max(0.15 * base, 0.5)

        if stat in _LOW_COUNT_STATS:
            low, high = _gamma_poisson_interval(pred, sd_pred, stat)
        else:
            low  = round(max(0.0, pred - INTERVAL_Z * sd_pred), 1)
            high = round(pred + INTERVAL_Z * sd_pred, 1)

        out[stat] = {
            "predicted": round(pred, 1),
            "low":       low,
            "high":      high,
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
