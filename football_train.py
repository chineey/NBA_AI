"""
Offline trainer for the football prediction model.

Run:  python football_train.py            (uses local international_results.csv,
                                           downloads it if missing)

Does four things:
1. Computes Elo ratings (eloratings.net rules) over the full history of
   international football (1872 -> today) from the martj42 dataset.
2. Tunes the Poisson model constants (baseline goals, Elo->goals scale,
   home Elo bonus, Dixon-Coles rho) by grid search on pre-2022 data.
3. Backtests on 2022+ matches (includes WC 2022): score log-likelihood and
   1X2 log loss vs naive baselines — so changes must prove themselves.
4. Writes elo_ratings.json (TLA-keyed ratings + tuned constants), which
   football_prediction.py loads at startup, falling back to its hardcoded
   table when the file is absent.

XGBoost comparison (optional): if the xgboost package is installed, also
trains two Poisson regressors for home/away goals on the same features and
reports the same metrics. It is only worth wiring in if it beats the tuned
Elo-Poisson here.

Training-only dependencies (not needed at runtime): xgboost (optional).
"""

from __future__ import annotations

import json
import math
import os
import time
import urllib.request

import numpy as np
import pandas as pd

DATA_FILE = "international_results.csv"
DATA_URL = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv"
OUT_FILE = "elo_ratings.json"
TEST_FROM = "2022-01-01"
MAX_GOALS = 10

# football-data.org TLA -> dataset team name, for the 48 WC 2026 teams
TLA_TO_NAME = {
    "ALG": "Algeria", "ARG": "Argentina", "AUS": "Australia", "AUT": "Austria",
    "BEL": "Belgium", "BIH": "Bosnia and Herzegovina", "BRA": "Brazil",
    "CAN": "Canada", "CPV": "Cape Verde", "COL": "Colombia", "COD": "DR Congo",
    "CRO": "Croatia", "CUW": "Curaçao", "CZE": "Czech Republic", "ECU": "Ecuador",
    "EGY": "Egypt", "ENG": "England", "FRA": "France", "GER": "Germany",
    "GHA": "Ghana", "HAI": "Haiti", "IRN": "Iran", "IRQ": "Iraq",
    "CIV": "Ivory Coast", "JPN": "Japan", "JOR": "Jordan", "MEX": "Mexico",
    "MAR": "Morocco", "NED": "Netherlands", "NZL": "New Zealand", "NOR": "Norway",
    "PAN": "Panama", "PAR": "Paraguay", "POR": "Portugal", "QAT": "Qatar",
    "KSA": "Saudi Arabia", "SCO": "Scotland", "SEN": "Senegal",
    "RSA": "South Africa", "KOR": "South Korea", "ESP": "Spain", "SWE": "Sweden",
    "SUI": "Switzerland", "TUN": "Tunisia", "TUR": "Turkey",
    "USA": "United States", "URY": "Uruguay", "UZB": "Uzbekistan",
}


def load_data() -> pd.DataFrame:
    stale = (not os.path.exists(DATA_FILE)
             or time.time() - os.path.getmtime(DATA_FILE) > 24 * 3600)
    if stale:
        print(f"Downloading {DATA_URL} ...")
        urllib.request.urlretrieve(DATA_URL, DATA_FILE)
    df = pd.read_csv(DATA_FILE)
    df = df.dropna(subset=["home_score", "away_score"]).copy()
    df["home_score"] = df["home_score"].astype(int)
    df["away_score"] = df["away_score"].astype(int)
    df = df.sort_values("date").reset_index(drop=True)
    print(f"{len(df)} finished internationals, {df.date.min()} -> {df.date.max()}")
    return df


# ── Elo (eloratings.net rules) ────────────────────────────────────────────────
HOME_ELO_BONUS = 100.0


def k_factor(tournament: str) -> float:
    t = tournament.lower()
    if t == "fifa world cup":
        return 60
    if any(x in t for x in ("uefa euro", "copa américa", "copa america",
                            "african cup", "africa cup", "asian cup", "gold cup",
                            "concacaf championship", "oceania nations")):
        return 50 if "qualification" not in t else 40
    if "qualification" in t or "nations league" in t or "confederations" in t:
        return 40
    if t == "friendly":
        return 20
    return 30


def goal_multiplier(diff: int) -> float:
    if diff <= 1:
        return 1.0
    if diff == 2:
        return 1.5
    return 1.75 + max(0, diff - 3) / 8.0


def compute_elo(df: pd.DataFrame) -> tuple[dict[str, float], pd.DataFrame]:
    """Sequential Elo; also returns per-match pre-game ratings for backtesting."""
    elo: dict[str, float] = {}
    pre_h, pre_a = np.empty(len(df)), np.empty(len(df))
    for i, r in enumerate(df.itertuples(index=False)):
        eh = elo.get(r.home_team, 1500.0)
        ea = elo.get(r.away_team, 1500.0)
        pre_h[i], pre_a[i] = eh, ea
        dr = eh - ea + (0.0 if r.neutral else HOME_ELO_BONUS)
        expected = 1.0 / (1.0 + 10 ** (-dr / 400.0))
        result = 1.0 if r.home_score > r.away_score else (0.5 if r.home_score == r.away_score else 0.0)
        delta = k_factor(r.tournament) * goal_multiplier(abs(r.home_score - r.away_score)) * (result - expected)
        elo[r.home_team] = eh + delta
        elo[r.away_team] = ea - delta
    out = df.copy()
    out["elo_h"], out["elo_a"] = pre_h, pre_a
    return elo, out


# ── Poisson / Dixon-Coles machinery (mirrors football_prediction.py) ─────────
def dc_tau(x: int, y: int, lh: float, la: float, rho: float) -> float:
    if x == 0 and y == 0:
        return 1.0 - lh * la * rho
    if x == 0 and y == 1:
        return 1.0 + lh * rho
    if x == 1 and y == 0:
        return 1.0 + la * rho
    if x == 1 and y == 1:
        return 1.0 - rho
    return 1.0


_POIS_CACHE: dict[float, np.ndarray] = {}


def pois_vec(lam: float) -> np.ndarray:
    key = round(lam, 3)
    v = _POIS_CACHE.get(key)
    if v is None:
        ks = np.arange(MAX_GOALS + 1)
        v = np.exp(-lam) * lam ** ks / np.array([math.factorial(k) for k in ks])
        _POIS_CACHE[key] = v
    return v


def score_matrix(lh: float, la: float, rho: float) -> np.ndarray:
    m = np.outer(pois_vec(lh), pois_vec(la))
    m[0, 0] *= 1.0 - lh * la * rho
    m[0, 1] *= 1.0 + lh * rho
    m[1, 0] *= 1.0 + la * rho
    m[1, 1] *= 1.0 - rho
    return m / m.sum()


def evaluate(matches: pd.DataFrame, lam_h: np.ndarray, lam_a: np.ndarray,
             rho: float) -> dict[str, float]:
    """Score NLL (joint scoreline) and 1X2 log loss over a match set."""
    score_nll = wdl_ll = 0.0
    n = len(matches)
    hs = matches["home_score"].to_numpy()
    as_ = matches["away_score"].to_numpy()
    for i in range(n):
        m = score_matrix(min(lam_h[i], 4.5), min(lam_a[i], 4.5), rho)
        h, a = min(int(hs[i]), MAX_GOALS), min(int(as_[i]), MAX_GOALS)
        score_nll -= math.log(max(m[h, a], 1e-12))
        p_home = np.tril(m, -1).sum()
        p_draw = np.trace(m)
        p_away = np.triu(m, 1).sum()
        actual = 0 if h > a else (1 if h == a else 2)
        wdl_ll -= math.log(max((p_home, p_draw, p_away)[actual], 1e-12))
    return {"score_nll": score_nll / n, "wdl_logloss": wdl_ll / n}


def elo_lambdas(df: pd.DataFrame, base: float, scale: float, home_elo: float) -> tuple[np.ndarray, np.ndarray]:
    dr = df["elo_h"].to_numpy() - df["elo_a"].to_numpy() \
         + np.where(df["neutral"].to_numpy(), 0.0, home_elo)
    lam_h = base * np.exp(dr / (2 * scale))
    lam_a = base * np.exp(-dr / (2 * scale))
    return np.clip(lam_h, 0.2, 4.5), np.clip(lam_a, 0.2, 4.5)


def main() -> None:
    df = load_data()
    final_elo, df = compute_elo(df)

    df = df[df["date"] >= "1990-01-01"].reset_index(drop=True)  # modern era only
    train = df[df["date"] < TEST_FROM]
    test = df[df["date"] >= TEST_FROM]
    print(f"train {len(train)} matches (<{TEST_FROM}), test {len(test)} matches")

    # ── Tune Elo->Poisson constants on the training period ──────────────────
    best, best_nll = None, float("inf")
    for base in (1.15, 1.25, 1.35):
        for scale in (300, 350, 400, 450, 500):
            for home_elo in (60, 100):
                for rho in (-0.05, -0.10, -0.15):
                    lh, la = elo_lambdas(train, base, scale, home_elo)
                    nll = evaluate(train, lh, la, rho)["score_nll"]
                    if nll < best_nll:
                        best_nll, best = nll, (base, scale, home_elo, rho)
    base, scale, home_elo, rho = best
    print(f"tuned: baseline={base} scale={scale} home_elo={home_elo} rho={rho} "
          f"(train score NLL {best_nll:.4f})")

    # ── Backtest on held-out 2022+ ───────────────────────────────────────────
    lh, la = elo_lambdas(test, base, scale, home_elo)
    tuned = evaluate(test, lh, la, rho)

    # Baselines: uniform 1X2, and untuned production-style constants
    n = len(test)
    uniform_ll = -math.log(1 / 3)
    lh0, la0 = elo_lambdas(test, 1.30, 380, 100)
    untuned = evaluate(test, lh0, la0, -0.10)

    print("\n-- Backtest (2022+ held-out) --------------------------")
    print(f"{'model':28s} {'1X2 logloss':>12s} {'score NLL':>10s}")
    print(f"{'uniform 1/3 baseline':28s} {uniform_ll:12.4f} {'—':>10s}")
    print(f"{'untuned Elo-Poisson':28s} {untuned['wdl_logloss']:12.4f} {untuned['score_nll']:10.4f}")
    print(f"{'tuned Elo-Poisson':28s} {tuned['wdl_logloss']:12.4f} {tuned['score_nll']:10.4f}")

    # ── Optional: XGBoost lambda model on the same split ────────────────────
    try:
        import xgboost as xgb

        def features(d: pd.DataFrame) -> np.ndarray:
            return np.column_stack([
                d["elo_h"], d["elo_a"], d["elo_h"] - d["elo_a"],
                (~d["neutral"].astype(bool)).astype(float),
                [k_factor(t) for t in d["tournament"]],
            ])

        Xtr, Xte = features(train), features(test)
        params = dict(objective="count:poisson", max_depth=4, learning_rate=0.05,
                      n_estimators=400, subsample=0.8, colsample_bytree=0.8,
                      verbosity=0)
        mh = xgb.XGBRegressor(**params).fit(Xtr, train["home_score"])
        ma = xgb.XGBRegressor(**params).fit(Xtr, train["away_score"])
        xlh = np.clip(mh.predict(Xte), 0.2, 4.5)
        xla = np.clip(ma.predict(Xte), 0.2, 4.5)
        xres = evaluate(test, xlh, xla, rho)
        print(f"{'XGBoost lambdas':28s} {xres['wdl_logloss']:12.4f} {xres['score_nll']:10.4f}")
    except ImportError:
        print("(xgboost not installed — skipped comparison)")

    # ── Export ratings + tuned constants for the live model ─────────────────
    ratings = {}
    for tla, name in TLA_TO_NAME.items():
        if name in final_elo:
            ratings[tla] = round(final_elo[name])
        else:
            print(f"WARNING: no Elo history for {name} ({tla})")
    payload = {
        "generated": pd.Timestamp.utcnow().strftime("%Y-%m-%d"),
        "source": "github.com/martj42/international_results",
        "constants": {"baseline": base, "scale": scale, "home_elo": home_elo, "rho": rho},
        "ratings": ratings,
    }
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
    top = sorted(ratings.items(), key=lambda kv: -kv[1])
    print(f"\nWrote {OUT_FILE} ({len(ratings)} teams). Top 10: "
          + ", ".join(f"{t} {e}" for t, e in top[:10]))

    export_h2h(df)


def export_h2h(df: pd.DataFrame, out_file: str = "h2h_history.json") -> None:
    """Last 3 meetings for every pair of WC teams, oriented to the
    alphabetically-first TLA. The live model merges this with the (sparse)
    football-data head2head endpoint."""
    name_to_tla = {v: k for k, v in TLA_TO_NAME.items()}
    pairs: dict[str, list] = {}
    sub = df[df["home_team"].isin(name_to_tla) & df["away_team"].isin(name_to_tla)]
    for r in sub.itertuples(index=False):
        th, ta = name_to_tla[r.home_team], name_to_tla[r.away_team]
        first, second = sorted((th, ta))
        key = f"{first}|{second}"
        scored, conceded = (r.home_score, r.away_score) if th == first else (r.away_score, r.home_score)
        pairs.setdefault(key, []).append(
            {"date": r.date, "scored": int(scored), "conceded": int(conceded)})
    h2h = {k: sorted(v, key=lambda x: x["date"], reverse=True)[:3]
           for k, v in pairs.items()}
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(h2h, f, ensure_ascii=False)
    print(f"Wrote {out_file}: last-3 meetings for {len(h2h)} team pairs")


if __name__ == "__main__":
    main()
