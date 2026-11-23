"""
Walk-forward backtest and data quality audit for CourtVision's NBA statistical
projection model (`nba_prediction_model.py`).

Strictly read-only against Supabase:
- Paginates `nba_player_game_logs` in 1,000-row chunks with `.range()` ordered
  by `(game_date, game_id, player_id)`.
- Verifies total fetched row count against an exact count query.
- Normalizes dtypes and caches to `data/game_logs.parquet` (re-pull with `--refresh`).
- Evaluates walk-forward predictions with zero future leakage (recomputing
  opponent defensive factors, season averages, and splits strictly prior to each
  game date).
"""

from __future__ import annotations

import argparse
import math
import os
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

import nba_prediction_model as mdl

load_dotenv()

PARQUET_PATH = Path("data/game_logs.parquet")
TABLE_NAME = "nba_player_game_logs"
PAGE_SIZE = 1000

STAT_KEYS = {
    "PTS": "pts",
    "AST": "ast",
    "REB": "reb",
    "FG3M": "fg3m",
    "STL": "stl",
    "BLK": "blk",
}

FLOAT_COLS = [
    "MIN", "PTS", "AST", "REB", "STL", "BLK", "OREB", "DREB",
    "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "TOV",
]


def pull_from_supabase() -> pd.DataFrame:
    """Read-only paginated pull from Supabase with exact count verification."""
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment/.env")

    sb = create_client(url, key)

    count_resp = sb.table(TABLE_NAME).select("player_id", count="exact").limit(1).execute()
    expected_count = count_resp.count

    rows: list[dict] = []
    start = 0
    while True:
        resp = (
            sb.table(TABLE_NAME)
            .select("*")
            .order("game_date")
            .order("game_id")
            .order("player_id")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE

    if expected_count is not None and len(rows) != expected_count:
        raise RuntimeError(
            f"Row count mismatch: fetched {len(rows)} rows vs count query {expected_count}"
        )

    df = pd.DataFrame(rows)
    df.columns = [c.upper() for c in df.columns]
    return normalize_dtypes(df)


def normalize_dtypes(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize dates as datetime, stats as float, team and player columns as categoricals."""
    df = df.copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    for col in FLOAT_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0).astype("float64")
    for cat_col in ("TEAM_ABBREVIATION", "PLAYER_NAME"):
        if cat_col in df.columns:
            df[cat_col] = df[cat_col].astype(str).astype("category")
    df = df.sort_values(["GAME_DATE", "GAME_ID", "PLAYER_ID"]).reset_index(drop=True)
    return df


def load_game_logs(refresh: bool = False) -> pd.DataFrame:
    """Load game logs from local parquet cache or pull from Supabase."""
    if PARQUET_PATH.exists() and not refresh:
        df = pd.read_parquet(PARQUET_PATH)
        return normalize_dtypes(df)

    df = pull_from_supabase()
    PARQUET_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(PARQUET_PATH, index=False)
    return df


def parse_opponent(matchup: str) -> str:
    if not matchup:
        return ""
    parts = str(matchup).replace("vs.", "@").split("@")
    return parts[-1].strip().upper() if len(parts) > 1 else ""


def row_to_game_dict(row) -> dict:
    gd = row["GAME_DATE"]
    gd_str = gd.strftime("%Y-%m-%d") if hasattr(gd, "strftime") else str(gd)[:10]
    return {
        "gameDate": gd_str,
        "matchup": str(row["MATCHUP"]),
        "wl": str(row.get("WL", "")),
        "min": float(row["MIN"]),
        "pts": float(row["PTS"]),
        "ast": float(row["AST"]),
        "reb": float(row["REB"]),
        "fg3m": float(row["FG3M"]),
        "stl": float(row["STL"]),
        "blk": float(row["BLK"]),
    }


def run_walk_forward(
    df: pd.DataFrame,
    warmup: int = 10,
    min_minutes_filter: float = 0.0,
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.DataFrame:
    """
    Walk-forward evaluation across chronological game dates.
    For every player-game with at least `warmup` prior games, computes predictions
    strictly using data from `GAME_DATE < current_date`.
    """
    df = df.sort_values(["GAME_DATE", "GAME_ID", "PLAYER_ID"]).reset_index(drop=True)
    # Deduplicate any duplicate (PLAYER_ID, GAME_ID) rows just as nba_server.py does
    df = df.drop_duplicates(subset=["PLAYER_ID", "GAME_ID"], keep="first").reset_index(drop=True)

    unique_dates = sorted(df["GAME_DATE"].unique())
    records: list[dict] = []

    # Maintain per-player history list (most recent first) updated strictly after each date completes
    player_history: dict[int, list[dict]] = {}

    for g_date in unique_dates:
        day_df = df[df["GAME_DATE"] == g_date]
        prior_df = df[df["GAME_DATE"] < g_date]

        in_window = True
        if start_date and g_date < pd.Timestamp(start_date):
            in_window = False
        if end_date and g_date > pd.Timestamp(end_date):
            in_window = False

        if in_window and not prior_df.empty:
            # Reset cache so opponent_defense_factors computes strictly as-of g_date
            mdl._def_cache["key"] = None
            # Convert categoricals to str view for groupby inside opponent_defense_factors
            prior_for_def = prior_df.copy()
            prior_for_def["TEAM_ABBREVIATION"] = prior_for_def["TEAM_ABBREVIATION"].astype(str)
            def_factors = mdl.opponent_defense_factors(prior_for_def)

            g_date_str = pd.Timestamp(g_date).strftime("%Y-%m-%d")

            for row in day_df.to_dict("records"):
                pid = int(row["PLAYER_ID"])
                hist = player_history.get(pid, [])
                if min_minutes_filter > 0:
                    hist_filtered = [g for g in hist if g["min"] >= min_minutes_filter]
                else:
                    hist_filtered = hist

                if len(hist_filtered) < warmup:
                    continue

                matchup = str(row["MATCHUP"])
                opp_abbr = parse_opponent(matchup)
                home_away = "HOME" if "vs." in matchup else "AWAY"
                is_b2b = mdl.detect_next_b2b(hist_filtered, g_date_str)
                opp_f = def_factors.get(opp_abbr) if opp_abbr else None

                proj = mdl.project_stats(
                    hist_filtered,
                    STAT_KEYS,
                    opp_f,
                    home_away,
                    is_b2b,
                )

                last_5 = hist_filtered[:5]
                for stat, key in STAT_KEYS.items():
                    s_vals = [g[key] for g in hist_filtered]
                    l5_vals = [g[key] for g in last_5]
                    s_avg = sum(s_vals) / len(s_vals)
                    l5_avg = sum(l5_vals) / len(l5_vals)

                    p_stat = proj[stat]
                    records.append(
                        {
                            "game_date": g_date,
                            "player_id": pid,
                            "stat": stat,
                            "actual": float(row[stat]),
                            "pred": float(p_stat["predicted"]),
                            "low": float(p_stat["low"]),
                            "high": float(p_stat["high"]),
                            "season_avg": s_avg,
                            "last5_avg": l5_avg,
                            "actual_min": float(row["MIN"]),
                        }
                    )

        # After evaluating all games on g_date, append today's games to player_history (most recent first)
        for row in day_df.to_dict("records"):
            pid = int(row["PLAYER_ID"])
            g_dict = row_to_game_dict(row)
            player_history.setdefault(pid, []).insert(0, g_dict)

    return pd.DataFrame(records)


def wilson_ci(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson score interval for a binomial proportion (returned in percentage points)."""
    if total == 0:
        return (0.0, 0.0)
    p = successes / total
    denom = 1.0 + (z ** 2) / total
    center = (p + (z ** 2) / (2.0 * total)) / denom
    half = (z / denom) * math.sqrt((p * (1.0 - p) / total) + ((z ** 2) / (4.0 * (total ** 2))))
    return (max(0.0, (center - half) * 100.0), min(100.0, (center + half) * 100.0))


def summarize_metrics(res_df: pd.DataFrame) -> pd.DataFrame:
    """Compute MAE, RMSE, baselines, interval coverage, bias, and pick accuracy + 95% CI per stat."""
    rows = []
    for stat in STAT_KEYS:
        sub = res_df[res_df["stat"] == stat]
        if sub.empty:
            continue
        n = len(sub)
        err_m = sub["pred"] - sub["actual"]
        err_s = sub["season_avg"] - sub["actual"]
        err_l5 = sub["last5_avg"] - sub["actual"]

        mae_m = err_m.abs().mean()
        rmse_m = math.sqrt((err_m ** 2).mean())
        mae_s = err_s.abs().mean()
        rmse_s = math.sqrt((err_s ** 2).mean())
        mae_l5 = err_l5.abs().mean()
        rmse_l5 = math.sqrt((err_l5 ** 2).mean())

        inside = ((sub["actual"] >= sub["low"]) & (sub["actual"] <= sub["high"])).mean() * 100.0
        bias = err_m.mean()

        # Pick accuracy proxy: Over/Under vs player's season average to date
        pred_diff = sub["pred"] - sub["season_avg"]
        act_diff = sub["actual"] - sub["season_avg"]
        valid_mask = (pred_diff != 0) & (act_diff != 0)
        valid = sub[valid_mask]
        n_picks = len(valid)
        hits = int((((valid["pred"] - valid["season_avg"]) > 0) == ((valid["actual"] - valid["season_avg"]) > 0)).sum())
        pick_acc = (hits / n_picks * 100.0) if n_picks > 0 else 0.0
        ci_lo, ci_hi = wilson_ci(hits, n_picks)

        rows.append(
            {
                "Stat": stat,
                "N": n,
                "Model MAE": round(mae_m, 3),
                "Season MAE": round(mae_s, 3),
                "Last5 MAE": round(mae_l5, 3),
                "Model RMSE": round(rmse_m, 3),
                "Season RMSE": round(rmse_s, 3),
                "Last5 RMSE": round(rmse_l5, 3),
                "Coverage %": round(inside, 1),
                "Bias": round(bias, 3),
                "Pick Acc %": round(pick_acc, 1),
                "95% CI": f"[{ci_lo:.1f}%, {ci_hi:.1f}%]",
                "Pick N": n_picks,
            }
        )
    return pd.DataFrame(rows)


def audit_data_quality(df: pd.DataFrame) -> dict:
    """Step 3 data quality audit on the game logs."""
    total_rows = len(df)
    unique_games = df["GAME_ID"].nunique()
    unique_players = df["PLAYER_ID"].nunique()

    min_zero = int((df["MIN"] == 0).sum())
    min_under_5 = int((df["MIN"] < 5).sum())
    min_under_10 = int((df["MIN"] < 10).sum())

    teams_per_game = df.groupby("GAME_ID")["TEAM_ABBREVIATION"].nunique()
    games_with_2_teams = int((teams_per_game == 2).sum())

    team_game_players = df.groupby(["GAME_ID", "TEAM_ABBREVIATION"], observed=True).size()
    team_game_min_sum = df.groupby(["GAME_ID", "TEAM_ABBREVIATION"], observed=True)["MIN"].sum()

    return {
        "total_rows": total_rows,
        "unique_games": unique_games,
        "unique_players": unique_players,
        "date_min": str(df["GAME_DATE"].min().date()),
        "date_max": str(df["GAME_DATE"].max().date()),
        "min_eq_0": min_zero,
        "min_lt_5": min_under_5,
        "min_lt_10": min_under_10,
        "games_with_2_teams": games_with_2_teams,
        "players_per_team_game_min": int(team_game_players.min()),
        "players_per_team_game_median": float(team_game_players.median()),
        "players_per_team_game_max": int(team_game_players.max()),
        "team_minutes_median": round(float(team_game_min_sum.median()), 1),
        "team_minutes_p10": round(float(np.percentile(team_game_min_sum, 10)), 1),
        "team_minutes_p90": round(float(np.percentile(team_game_min_sum, 90)), 1),
    }


def format_markdown_table(summary_df: pd.DataFrame) -> str:
    cols = list(summary_df.columns)
    header = "| " + " | ".join(cols) + " |"
    sep = "| " + " | ".join(["---"] + ["---:" for _ in cols[1:]]) + " |"
    lines = [header, sep]
    for _, r in summary_df.iterrows():
        lines.append("| " + " | ".join(str(r[c]) for c in cols) + " |")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Walk-forward backtest for nba_prediction_model.py")
    parser.add_argument("--refresh", action="store_true", help="Re-pull game logs from Supabase")
    parser.add_argument("--warmup", type=int, default=10, help="Minimum prior games per player (default: 10)")
    parser.add_argument("--min-minutes", type=float, default=0.0, help="Filter prior games below this minute threshold")
    parser.add_argument("--save-baseline", type=str, default="", help="Optional markdown path to save baseline report")
    args = parser.parse_args()

    df = load_game_logs(refresh=args.refresh)
    dq = audit_data_quality(df)
    print(f"Loaded {dq['total_rows']} rows ({dq['unique_games']} games, {dq['unique_players']} players, {dq['date_min']} -> {dq['date_max']})")

    res_df = run_walk_forward(df, warmup=args.warmup, min_minutes_filter=args.min_minutes)
    summary = summarize_metrics(res_df)
    md_table = format_markdown_table(summary)
    print("\n" + md_table)

    if args.save_baseline:
        out_path = Path(args.save_baseline)
        out_path.write_text(
            f"# Baseline Walk-Forward Backtest Report (Warmup >= {args.warmup} games)\n\n"
            f"- **Dataset:** {dq['total_rows']} player-game rows across {dq['unique_games']} games "
            f"({dq['date_min']} to {dq['date_max']})\n\n"
            f"{md_table}\n",
            encoding="utf-8",
        )
        print(f"\nSaved baseline report to {out_path}")


if __name__ == "__main__":
    main()
