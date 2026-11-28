"""
Walk-forward backtest, data audit, and ablation study for CourtVision's
football Poisson/Dixon-Coles model (`football_prediction_model.py`).

Strictly read-only against Supabase:
- Paginates `football_matches` in 1,000-row chunks ordered deterministically by
  `(utc_date, id)` and verifies count against `count="exact"`.
- Caches normalized matches to `data/football_matches.parquet` (`--refresh` to re-pull).
- Evaluates strictly chronologically (`utc_date < match.utc_date`, zero future leakage).
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

import football_prediction_model as fpm

load_dotenv(".env")

PARQUET_PATH = Path("data/football_matches.parquet")
TABLE_NAME = "football_matches"
PAGE_SIZE = 1000


def pull_from_supabase() -> pd.DataFrame:
    """Read-only paginated pull of football_matches from Supabase."""
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sb = create_client(url, key)

    count_resp = sb.table(TABLE_NAME).select("id", count="exact").limit(1).execute()
    expected_count = count_resp.count

    rows: list[dict] = []
    start = 0
    while True:
        resp = (
            sb.table(TABLE_NAME)
            .select("id,competition_code,utc_date,status,matchday,stage,home_team_id,away_team_id,full_time_home,full_time_away")
            .order("utc_date")
            .order("id")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE

    if expected_count is not None and len(rows) != expected_count:
        raise RuntimeError(f"Expected {expected_count} rows, fetched {len(rows)}")

    df = pd.DataFrame(rows)
    PARQUET_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(PARQUET_PATH, index=False)
    print(f"Pulled {len(df)} rows from Supabase -> {PARQUET_PATH}")
    return df


def load_matches(refresh: bool = False) -> list[dict]:
    if refresh or not PARQUET_PATH.exists():
        df = pull_from_supabase()
    else:
        df = pd.read_parquet(PARQUET_PATH)
    finished = df[
        (df["status"] == "FINISHED")
        & df["full_time_home"].notna()
        & df["full_time_away"].notna()
    ].copy()
    finished["full_time_home"] = finished["full_time_home"].astype(int)
    finished["full_time_away"] = finished["full_time_away"].astype(int)
    finished = finished.sort_values(["utc_date", "id"]).reset_index(drop=True)
    return finished.to_dict(orient="records")


def wilson_ci(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denom
    return (max(0.0, center - half), min(1.0, center + half))


def evaluate_matches(
    matches: list[dict],
    predict_fn,
    min_prior_games: int = 5,
    start_idx: int = 0,
    end_idx: int | None = None,
) -> dict:
    """Walk-forward evaluation over matches[start_idx:end_idx] with zero leakage."""
    if end_idx is None:
        end_idx = len(matches)

    by_team: dict[int, list[dict]] = {}
    for m in matches[:start_idx]:
        for tid in (m["home_team_id"], m["away_team_id"]):
            by_team.setdefault(tid, []).append(m)

    n_eval = 0
    log_loss_sum = 0.0
    brier_sum = 0.0
    correct_1x2 = 0
    home_ae_sum = 0.0
    away_ae_sum = 0.0
    home_se_sum = 0.0
    away_se_sum = 0.0
    ou25_correct = 0
    ou25_ll_sum = 0.0
    btts_correct = 0
    btts_ll_sum = 0.0
    low_risk_hits = 0
    low_risk_total = 0
    high_risk_hits = 0
    high_risk_total = 0

    for idx in range(start_idx, end_idx):
        m = matches[idx]
        hid, aid = m["home_team_id"], m["away_team_id"]
        h_hist = by_team.get(hid, [])
        a_hist = by_team.get(aid, [])

        if len(h_hist) >= min_prior_games and len(a_hist) >= min_prior_games:
            # Strictly prior matches only
            prior_matches = matches[:idx]
            pred = predict_fn(m, h_hist, a_hist, prior_matches)
            lam_h, lam_a = pred["lam_h"], pred["lam_a"]
            mk = pred["markets"]
            picks = pred["picks"]

            hg, ag = m["full_time_home"], m["full_time_away"]
            actual = 0 if hg > ag else (1 if hg == ag else 2)
            probs = [
                max(mk["aWin"], 1e-6),
                max(mk["draw"], 1e-6),
                max(mk["bWin"], 1e-6),
            ]
            s = sum(probs)
            probs = [p / s for p in probs]

            log_loss_sum += -math.log(probs[actual])
            target = [1.0 if i == actual else 0.0 for i in range(3)]
            brier_sum += sum((probs[i] - target[i]) ** 2 for i in range(3))

            pred_class = int(np.argmax(probs))
            if pred_class == actual:
                correct_1x2 += 1

            home_ae_sum += abs(lam_h - hg)
            away_ae_sum += abs(lam_a - ag)
            home_se_sum += (lam_h - hg) ** 2
            away_se_sum += (lam_a - ag) ** 2

            # Over/Under 2.5
            p_o25 = min(max(mk["overUnder"]["2.5"]["over"], 1e-6), 1 - 1e-6)
            actual_o25 = 1 if (hg + ag) > 2.5 else 0
            if (p_o25 >= 0.5) == bool(actual_o25):
                ou25_correct += 1
            ou25_ll_sum += -(actual_o25 * math.log(p_o25) + (1 - actual_o25) * math.log(1 - p_o25))

            # BTTS (GG/NG)
            p_gg = min(max(mk["btts"]["yes"], 1e-6), 1 - 1e-6)
            actual_gg = 1 if (hg > 0 and ag > 0) else 0
            if (p_gg >= 0.5) == bool(actual_gg):
                btts_correct += 1
            btts_ll_sum += -(actual_gg * math.log(p_gg) + (1 - actual_gg) * math.log(1 - p_gg))

            # Tiered picks hit rate
            for pk in picks:
                lbl = pk["label"]
                hit = (
                    (lbl == "1X" and hg >= ag)
                    or (lbl == "12" and hg != ag)
                    or (lbl == "X2" and ag >= hg)
                    or (lbl == "GG" and hg > 0 and ag > 0)
                    or (lbl == "NG" and (hg == 0 or ag == 0))
                    or (lbl.startswith("O") and (hg + ag) > float(lbl[1:]))
                    or (lbl.startswith("U") and (hg + ag) < float(lbl[1:]))
                )
                if pk["risk"] == "low":
                    low_risk_total += 1
                    low_risk_hits += int(hit)
                else:
                    high_risk_total += 1
                    high_risk_hits += int(hit)

            n_eval += 1

        # Append current match to history only AFTER evaluating it
        by_team.setdefault(hid, []).append(m)
        by_team.setdefault(aid, []).append(m)

    ci_lo, ci_hi = wilson_ci(correct_1x2, n_eval)
    return {
        "n": n_eval,
        "log_loss": round(log_loss_sum / n_eval, 4) if n_eval else 0.0,
        "brier": round(brier_sum / n_eval, 4) if n_eval else 0.0,
        "acc_1x2": round(100.0 * correct_1x2 / n_eval, 2) if n_eval else 0.0,
        "acc_1x2_ci": (round(100.0 * ci_lo, 1), round(100.0 * ci_hi, 1)),
        "goal_mae": round((home_ae_sum + away_ae_sum) / (2 * n_eval), 4) if n_eval else 0.0,
        "goal_rmse": round(math.sqrt((home_se_sum + away_se_sum) / (2 * n_eval)), 4) if n_eval else 0.0,
        "ou25_acc": round(100.0 * ou25_correct / n_eval, 2) if n_eval else 0.0,
        "ou25_ll": round(ou25_ll_sum / n_eval, 4) if n_eval else 0.0,
        "btts_acc": round(100.0 * btts_correct / n_eval, 2) if n_eval else 0.0,
        "btts_ll": round(btts_ll_sum / n_eval, 4) if n_eval else 0.0,
        "low_risk_hit": round(100.0 * low_risk_hits / low_risk_total, 2) if low_risk_total else 0.0,
        "high_risk_hit": round(100.0 * high_risk_hits / high_risk_total, 2) if high_risk_total else 0.0,
    }


def make_baseline_predictor(
    baseline_goals: float = fpm.BASELINE_GOALS,
    decay: float = fpm.DECAY,
    shrink_k: float = fpm.SHRINK_K,
    home_adv: float = fpm.HOME_ADV,
    dc_rho: float = fpm.DC_RHO,
    use_comp_baseline: bool = False,
    use_venue_split: bool = False,
):
    def _strength(team_id: int, hist: list[dict], venue: str | None = None) -> tuple[float, float]:
        rows = []
        for m in reversed(hist):
            hg, ag = m["full_time_home"], m["full_time_away"]
            if m["home_team_id"] == team_id:
                is_home = True
                scored, conceded = hg, ag
            elif m["away_team_id"] == team_id:
                is_home = False
                scored, conceded = ag, hg
            else:
                continue
            w_venue = 1.0
            if use_venue_split and venue is not None:
                w_venue = 1.35 if ((venue == "home" and is_home) or (venue == "away" and not is_home)) else 0.65
            rows.append((scored, conceded, w_venue))

        if not rows:
            return 1.0, 1.0

        w_sum = s_sum = c_sum = 0.0
        for i, (sc, co, wv) in enumerate(rows):
            w = (decay ** i) * wv
            w_sum += w
            s_sum += w * sc
            c_sum += w * co
        avg_s = s_sum / w_sum
        avg_c = c_sum / w_sum
        n = len(rows)
        trust = n / (n + shrink_k)
        atk = 1.0 + trust * (avg_s / baseline_goals - 1.0)
        dfn = 1.0 + trust * (avg_c / baseline_goals - 1.0)
        return atk, dfn

    def _predict(m: dict, h_hist: list[dict], a_hist: list[dict], prior_matches: list[dict]) -> dict:
        hid, aid = m["home_team_id"], m["away_team_id"]
        h_atk, h_def = _strength(hid, h_hist, venue="home" if use_venue_split else None)
        a_atk, a_def = _strength(aid, a_hist, venue="away" if use_venue_split else None)

        bg = baseline_goals
        ha = home_adv
        if use_comp_baseline:
            comp = m.get("competition_code")
            comp_rows = [pm for pm in prior_matches if pm.get("competition_code") == comp]
            nc = len(comp_rows)
            if nc >= 10:
                comp_hg = sum(pm["full_time_home"] for pm in comp_rows) / nc
                comp_ag = sum(pm["full_time_away"] for pm in comp_rows) / nc
                comp_avg = (comp_hg + comp_ag) / 2.0
                t_c = nc / (nc + 25.0)
                bg = baseline_goals + t_c * (comp_avg - baseline_goals)
                if comp_ag > 0.2:
                    ha = home_adv + t_c * (min(max(comp_hg / comp_ag, 1.05), 1.65) - home_adv)

        lam_h = bg * h_atk * a_def * ha
        lam_a = bg * a_atk * h_def

        # H2H factor matching football_prediction_model.py
        h2h_rows = [
            pm for pm in reversed(h_hist)
            if {pm["home_team_id"], pm["away_team_id"]} == {hid, aid}
        ][:fpm.H2H_N]
        if h2h_rows:
            w_sum = s_sum = c_sum = 0.0
            for i, pm in enumerate(h2h_rows):
                w = decay ** i
                w_sum += w
                if pm["home_team_id"] == hid:
                    s_sum += w * pm["full_time_home"]
                    c_sum += w * pm["full_time_away"]
                else:
                    s_sum += w * pm["full_time_away"]
                    c_sum += w * pm["full_time_home"]
            att = (s_sum / w_sum) / bg
            con = (c_sum / w_sum) / bg
            t = len(h2h_rows) / (len(h2h_rows) + fpm.H2H_SHRINK)
            lam_h *= min(max(1.0 + t * (att - 1.0), 0.80), 1.25)
            lam_a *= min(max(1.0 + t * (con - 1.0), 0.80), 1.25)

        lam_h = min(max(lam_h, fpm.LAMBDA_MIN), fpm.LAMBDA_MAX)
        lam_a = min(max(lam_a, fpm.LAMBDA_MIN), fpm.LAMBDA_MAX)

        # Score matrix with configurable dc_rho
        old_rho = fpm.DC_RHO
        fpm.DC_RHO = dc_rho
        try:
            matrix = fpm.score_matrix(lam_h, lam_a)
        finally:
            fpm.DC_RHO = old_rho
        markets = fpm._markets(matrix)
        picks = fpm.tiered_picks(markets)
        return {"lam_h": lam_h, "lam_a": lam_a, "markets": markets, "picks": picks}

    return _predict


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()

    matches = load_matches(refresh=args.refresh)
    total = len(matches)
    split_idx = int(total * 0.60)
    print(f"Total finished matches: {total} | Train end idx: {split_idx} ({matches[split_idx - 1]['utc_date'][:10]}) | Held-out: {matches[split_idx]['utc_date'][:10]} to {matches[-1]['utc_date'][:10]}")

    # Naive uniform/home-edge baseline
    def naive_pred(m, h_hist, a_hist, prior_matches):
        nc = len(prior_matches)
        avg_h = sum(pm["full_time_home"] for pm in prior_matches) / nc if nc else 1.5
        avg_a = sum(pm["full_time_away"] for pm in prior_matches) / nc if nc else 1.1
        matrix = fpm.score_matrix(avg_h, avg_a)
        mk = fpm._markets(matrix)
        return {"lam_h": avg_h, "lam_a": avg_a, "markets": mk, "picks": fpm.tiered_picks(mk)}

    print("\n--- FULL WALK-FORWARD (min_prior_games=5) ---")
    naive_full = evaluate_matches(matches, naive_pred, min_prior_games=5)
    base_full = evaluate_matches(matches, make_baseline_predictor(), min_prior_games=5)
    print("Naive League Avg:", naive_full)
    print("Current Model   :", base_full)

    print("\n--- ABLATION ON HELD-OUT SPLIT ---")
    base_ho = evaluate_matches(matches, make_baseline_predictor(), min_prior_games=5, start_idx=split_idx)
    c1_ho = evaluate_matches(matches, make_baseline_predictor(use_comp_baseline=True), min_prior_games=5, start_idx=split_idx)
    c2_ho = evaluate_matches(matches, make_baseline_predictor(use_venue_split=True), min_prior_games=5, start_idx=split_idx)
    c12_ho = evaluate_matches(matches, make_baseline_predictor(use_comp_baseline=True, use_venue_split=True), min_prior_games=5, start_idx=split_idx)
    print("0. Baseline Held-Out      :", base_ho)
    print("1. + Comp Baselines       :", c1_ho)
    print("2. + Venue Form Split     :", c2_ho)
    print("3. + Comp + Venue Split   :", c12_ho)

    # Constant grid search on Train split
    print("\n--- CONSTANT TUNING ON TRAIN SPLIT ---")
    best_cfg = None
    best_train_ll = 999.0
    for decay in (0.85, 0.90, 0.94):
        for shrink_k in (4.0, 6.0, 10.0, 14.0):
            for home_adv in (1.20, 1.28, 1.35):
                for dc_rho in (-0.13, -0.10, -0.05):
                    res_tr = evaluate_matches(
                        matches,
                        make_baseline_predictor(
                            decay=decay, shrink_k=shrink_k, home_adv=home_adv, dc_rho=dc_rho,
                            use_comp_baseline=(c1_ho["log_loss"] < base_ho["log_loss"]),
                            use_venue_split=(c2_ho["log_loss"] < base_ho["log_loss"]),
                        ),
                        min_prior_games=5,
                        start_idx=0,
                        end_idx=split_idx,
                    )
                    if res_tr["log_loss"] < best_train_ll:
                        best_train_ll = res_tr["log_loss"]
                        best_cfg = (decay, shrink_k, home_adv, dc_rho, res_tr)

    print("Best Train cfg (decay, shrink_k, home_adv, dc_rho):", best_cfg[:4], "-> train:", best_cfg[4])
    d, sk, ha, rho, _ = best_cfg
    tuned_ho = evaluate_matches(
        matches,
        make_baseline_predictor(
            decay=d, shrink_k=sk, home_adv=ha, dc_rho=rho,
            use_comp_baseline=(c1_ho["log_loss"] < base_ho["log_loss"]),
            use_venue_split=(c2_ho["log_loss"] < base_ho["log_loss"]),
        ),
        min_prior_games=5,
        start_idx=split_idx,
    )
    tuned_full = evaluate_matches(
        matches,
        make_baseline_predictor(
            decay=d, shrink_k=sk, home_adv=ha, dc_rho=rho,
            use_comp_baseline=(c1_ho["log_loss"] < base_ho["log_loss"]),
            use_venue_split=(c2_ho["log_loss"] < base_ho["log_loss"]),
        ),
        min_prior_games=5,
    )
    print("Tuned Held-Out:", tuned_ho)
    print("Tuned Full    :", tuned_full)


if __name__ == "__main__":
    main()
