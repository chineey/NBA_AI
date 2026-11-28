# CourtVision Football Projection Model — Walk-Forward Backtest & Ablation Report

## 1. Methodology & Zero-Leakage Setup (`football_backtest.py`)

- **Data Source:** Paginated read-only pull from Supabase (`football_matches`) using `.range(start, start + 999)` ordered deterministically by `(utc_date, id)`, verified against an exact row-count query (`count="exact"`), and cached to `data/football_matches.parquet`.
- **Dataset Scope:** **3,440** total matches, **1,428** `FINISHED` matches with valid scores (`2026-01-28` to `2026-11-27`) across 10 competitions:
  - `BSA` (363), `ELC` (205), `PD` (130), `SA` (121), `DED` (118), `PL` (111), `FL1` (100), `PPL` (99), `BL1` (91), `CL` (90).
- **Walk-Forward Protocol:**
  - Warm-up threshold: both home and away teams must have at least **5 strictly prior finished matches** (`N = 930` evaluated matches).
  - Strictly no future leakage: for each match at index $t$, team attack/defense strengths and head-to-head factors are computed strictly from matches at indices $< t$.
- **Train / Held-Out Validation Split:**
  - **Training Period (`<= 2026-10-11`):** `N = 395` evaluated matches (used for constant tuning).
  - **Held-Out Validation Period (`2026-10-12` to `2026-11-27`):** `N = 535` evaluated matches (never used for constant tuning).

---

## 2. Baseline Model vs. Naive League Average (`N = 930`)

Before modifications, the baseline `football_prediction_model.py` (`DECAY=0.90, SHRINK_K=6.0, HOME_ADV=1.35, DC_RHO=-0.10`) was compared against a strictly causal Naive League Average baseline:

| Model | N | 1X2 Log Loss | 1X2 Brier | 1X2 Acc % | 95% CI | Goal MAE | Goal RMSE | O/U 2.5 Acc % | BTTS Acc % | Low-Risk Hit % | High-Risk Hit % |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Naive League Avg** | 930 | 1.0590 | 0.6397 | 46.45% | [43.3%, 49.7%] | **1.0049** | **1.2736** | **55.91%** | **57.20%** | 77.74% | **57.20%** |
| **Baseline Model** | 930 | **1.0083** | **0.6033** | **50.86%** | [47.7%, 54.1%] | 1.0526 | 1.2954 | 54.41% | 55.38% | **77.90%** | 48.71% |

**Key Baseline Diagnostic:** The baseline model beat the naive league average decisively on **1X2 Log Loss** (`-0.0507`), **1X2 Brier** (`-0.0364`), and **1X2 Accuracy** (`+4.41%`), but over-fitted small 5–10 game samples (`SHRINK_K=6.0`, `DECAY=0.90`), hurting Goal MAE/RMSE and Over/Under & BTTS calibration.

---

## 3. Sequential Ablation & Constant Tuning (Held-Out `N = 535`)

| Variant | Decision | Held-Out Log Loss | Held-Out Brier | Held-Out 1X2 Acc | Held-Out Goal MAE | Held-Out Goal RMSE | Held-Out O/U 2.5 LL | Held-Out BTTS LL |
| :--- | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **0. Baseline Model** | — | 0.9856 | 0.5874 | 54.21% | 1.1313 | 1.3820 | 0.7308 | 0.7244 |
| **1. + Competition Baselines** | **REJECT** | 0.9867 | 0.5871 | 54.39% | 1.1972 | 1.4684 | 0.7810 | 0.7561 |
| **2. + Venue Form Split (Home/Away)** | **REJECT** | 0.9912 | 0.5918 | 52.52% | 1.1396 | 1.3987 | 0.7398 | 0.7232 |
| **3. + Train-Tuned Constants** | **KEEP** | **0.9848** | **0.5872** | 53.64% | **1.0997** | **1.3482** | **0.7136** | **0.7190** |

### Why Each Change Helped or Failed
1. **Competition-Specific Baselines (Rejected):** Scaling `lambda` by per-competition goal averages while team strengths were normalized by global `BASELINE_GOALS = 1.35` double-counted league scoring differences and worsened Held-Out Log Loss (`0.9867` vs `0.9856`) and Goal MAE (`1.1972` vs `1.1313`).
2. **Venue-Specific Form Split (Rejected):** Upweighting home-only or away-only matches when a team only has 5–12 prior games halved the effective sample size and increased variance, worsening Held-Out Log Loss (`0.9912` vs `0.9856`).
3. **Train-Split Constant Tuning (Kept):** Grid search on the 395 training matches selected:
   - `DECAY = 0.94` (up from `0.90` — slower decay retains more form signal)
   - `SHRINK_K = 10.0` (up from `6.0` — stronger shrinkage reduces small-sample goal overestimation)
   - `HOME_ADV = 1.35` (unchanged)
   - `DC_RHO = -0.13` (up in magnitude from `-0.10` — stronger Dixon-Coles low-score dependence)

---

## 4. Before vs. After Summary (`N = 930` Full Walk-Forward)

| Metric | Baseline Model | Tuned Model | Delta |
| --- | ---: | ---: | ---: |
| **1X2 Log Loss** | 1.0083 | **1.0051** | **-0.0032** |
| **1X2 Brier** | 0.6033 | **0.6014** | **-0.0019** |
| **1X2 Accuracy** | 50.86% | **51.61%** (`[48.4%, 54.8%]`) | **+0.75%** |
| **Goal MAE** | 1.0526 | **1.0282** | **-0.0244** |
| **Goal RMSE** | 1.2954 | **1.2654** (beats Naive `1.2736`) | **-0.0300** |
| **O/U 2.5 Acc / LL** | 54.41% / 0.7261 | **55.27% / 0.7111** | **+0.86% / -0.0150** |
| **BTTS Acc / LL** | 55.38% / 0.7078 | **56.67% / 0.7017** | **+1.29% / -0.0061** |
| **Low-Risk Pick Hit %** | 77.90% | **78.39%** | **+0.49%** |
| **High-Risk Pick Hit %** | 48.71% | **49.03%** | **+0.32%** |

---

## 5. Symmetric Home/Away Advantage Fix (`× √HOME_ADV` / `÷ √HOME_ADV`)

Multiplying only `lam_h` by `HOME_ADV = 1.35` inflated total expected goals to ~`3.17` per match. Splitting home advantage symmetrically (`ha_h = √HOME_ADV`, `ha_a = 1 / √HOME_ADV`, `BASELINE_GOALS = 1.32`, `HOME_ADV = 1.32` in the experiment) keeps total expected goals calibrated (~`2.68`) and yielded major gains on Goal MAE, O/U 2.5, BTTS, 1X2 Accuracy, and High-Risk Picks:

| Metric | Tuned Asymmetric (Full / HO) | Symmetric H/A (Full / HO) |
| --- | :---: | :---: |
| **1X2 Accuracy** | 51.61% / 53.64% | **52.37%** / **54.58%** |
| **Goal MAE** | 1.0282 / 1.0997 | **0.9644** / **1.0281** |
| **Goal RMSE** | 1.2654 / 1.3482 | **1.2302** / **1.3085** |
| **O/U 2.5 Log Loss** | 0.7111 / 0.7136 | **0.6865** / **0.6759** |
| **BTTS Log Loss** | 0.7017 / 0.7190 | **0.6867** / **0.6889** |
| **Low-Risk Pick Hit %** | 78.39% / 78.97% | 78.23% / **79.53%** |
| **High-Risk Pick Hit %** | 49.03% / 48.04% | **52.69%** / **52.90%** |
