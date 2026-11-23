# CourtVision NBA Projection Model — Walk-Forward Backtest & Ablation Report

## 1. Methodology & Zero-Leakage Setup (`backtest.py`)

- **Data Source:** Paginated read-only pull from Supabase (`nba_player_game_logs`) using `.range(start, start + 999)` ordered deterministically by `(game_date, game_id, player_id)`, verified against an exact row-count query (`count="exact"`), normalized, and cached to `data/game_logs.parquet`.
- **Dataset Scope:** **5,546** player-game logs across **248** unique games and **474** unique players (`2026-10-20` to `2026-11-22`).
- **Walk-Forward Protocol:**
  - Warm-up threshold: each player must have at least **10 strictly prior games** (`N = 1,496` evaluated player-games per stat; 8,976 stat predictions total).
  - Strictly no future leakage: for each chronological game date $t$, `opponent_defense_factors` is recomputed from scratch (cache reset) using only games with `GAME_DATE < t`, and each player's history, season average, last-5 average, home/away indicator, and back-to-back status are computed strictly from games prior to $t$.
- **Train / Held-Out Validation Split:**
  - **Training Period (`<= 2026-11-16`):** `N = 757` player-games per stat (used to select candidate variations and tune constants in Step 5).
  - **Held-Out Validation Period (`2026-11-17` to `2026-11-22`):** `N = 739` player-games per stat (never used for constant tuning).

---

## 2. Step 2: Baseline Model vs. Naive Baselines (Saved in `baseline_report.md`)

Before any modifications, the original `nba_prediction_model.py` (`RECENT_N=10, FORM_DECAY=0.85, FORM_BLEND=0.65, OPP_DAMPEN=0.50, LOC_DAMPEN=0.40, B2B_FACTOR=0.95, INTERVAL_Z=0.95`) was evaluated across all `N = 1,496` walk-forward player-games:

| Stat | N | Model MAE | Season MAE | Last5 MAE | Model RMSE | Season RMSE | Last5 RMSE | Coverage % | Bias | Pick Acc % | 95% CI | Pick N |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| PTS | 1496 | 4.947 | 4.903 | 5.158 | 6.546 | 6.461 | 6.768 | 61.1 | -0.518 | 51.6 | [49.0%, 54.1%] | 1466 |
| AST | 1496 | 1.428 | 1.419 | 1.508 | 1.921 | 1.919 | 2.034 | 63.6 | -0.108 | 52.8 | [50.1%, 55.4%] | 1395 |
| REB | 1496 | 1.981 | 1.966 | 2.047 | 2.567 | 2.543 | 2.666 | 60.7 | -0.018 | 51.5 | [48.9%, 54.1%] | 1423 |
| FG3M | 1496 | 1.025 | 1.003 | 1.062 | 1.392 | 1.370 | 1.437 | 64.6 | -0.088 | 47.9 | [45.1%, 50.6%] | 1274 |
| STL | 1496 | 0.755 | 0.749 | 0.778 | 0.980 | 0.968 | 1.015 | 68.2 | -0.040 | 52.3 | [49.6%, 54.9%] | 1337 |
| BLK | 1496 | 0.545 | 0.536 | 0.553 | 0.778 | 0.758 | 0.795 | 76.2 | 0.007 | 48.8 | [46.0%, 51.5%] | 1282 |

**Key Baseline Diagnostic:** The unmodified model beat the noisy `Last 5 Avg` baseline on every stat, but **lost to the naive `Season Avg` baseline on all 6 stats** (both MAE and RMSE), under-covered `PTS` (`61.1%`) and `REB` (`60.7%`), and severely over-covered `BLK` (`76.2%` vs. 66% target).

---

## 3. Step 3: Data Quality Audit

1. **Completeness of Team Totals for `opponent_defense_factors`:**
   - All **248 / 248** unique `GAME_ID`s have both teams present (`2` teams per game).
   - Active player rows per team-game: min `6`, median `11.0`, max `15`.
   - Summed player minutes per team-game: **median `240.0` minutes** (10th percentile `239.0`, 90th percentile `242.0`). Since a 48-minute regulation NBA game has $5 \times 48 = 240.0$ team minutes, **every player who stepped on the court is included**, confirming `opponent_defense_factors` is not biased by missing players.
2. **DNPs and Low-Minute Games (`MIN < 10`):**
   - Neither `nba_server.py` nor the baseline `nba_prediction_model.py` filtered out 0-minute rows or low-minute appearances.
   - Across the 5,546 rows: `MIN == 0` occurs **17** times (`0.3%`), `MIN < 5` occurs **450** times (`8.1%`), and `MIN < 10` occurs **890** times (`16.0%`).
   - **Effect of Filtering Prior History (evaluated on the fixed `N = 1,496` target set):**

| History Filter Applied Inside `project_stats` | PTS MAE | AST MAE | REB MAE | FG3M MAE | STL MAE | BLK MAE | Mean MAE |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| None (Baseline) | 4.947 | 1.428 | 1.981 | 1.025 | 0.755 | 0.545 | **1.7802** |
| Filter `MIN <= 0` (DNPs only, accepted) | 4.947 | 1.428 | 1.982 | 1.025 | 0.755 | 0.545 | **1.7802** |
| Filter `MIN < 3.0` (rejected) | 4.959 | 1.430 | 1.988 | 1.028 | 0.757 | 0.546 | 1.7847 |
| Filter `MIN < 5.0` (rejected) | 4.965 | 1.433 | 1.993 | 1.029 | 0.757 | 0.547 | 1.7873 |
| Filter `MIN < 10.0` (rejected) | 5.020 | 1.443 | 2.017 | 1.037 | 0.762 | 0.552 | 1.8052 |

- **Why hard-filtering `MIN < 10` hurts:** Bench players who legitimately average 8–14 minutes often play 4–9 minutes. Dropping their `<10` minute games artificially inflates their historical average and creates positive bias (`+0.092` on REB, `-0.270` vs `-0.518` on PTS with +0.073 higher PTS MAE). Only pure 0-minute DNPs (`MIN <= 0`) should be excluded, while low-minute games are handled via minute-weighted per-minute rates (Candidate 1).

---

## 4. Step 4 & Step 5: Sequential Ablation & Constant Tuning Summary

Each candidate change was evaluated sequentially on the **Held-Out Period (`2026-11-17` to `2026-11-22`, `N = 739`)** and **Full Walk-Forward (`N = 1,496`)**:

| Step / Model Variant | Decision | Held-Out Mean MAE | Held-Out PTS MAE | Full Mean MAE | Full PTS MAE | Full Mean RMSE | Full Avg \|Cov - 66%\| |
| :--- | :---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **0. Baseline Model** | — | 1.7715 | 4.886 | 1.7802 | 4.947 | 2.3640 | 4.40% |
| **1. + Minutes Projection × Per-Min Rate** | **KEEP** | 1.7713 | 4.885 | 1.7798 | 4.943 | 2.3647 | 4.28% |
| **2. + Flat League-Wide Home/Away (±1.5%)** | **KEEP** | 1.7580 | 4.851 | 1.7673 | 4.916 | 2.3477 | 4.68% |
| **3. + Small-Sample Shrinkage & Overlap Fix** | **KEEP** | 1.7517 | 4.836 | 1.7593 | 4.896 | 2.3332 | 4.72% |
| **4. + Opponent SOS & Shrinkage** | **REJECT** | 1.7517 | 4.838 | 1.7603 | 4.901 | 2.3345 | 4.78% |
| **5. + Wilson-Hilferty Gamma-Poisson & Pooled Intervals** | **KEEP** | 1.7517 | 4.836 | 1.7593 | 4.896 | 2.3332 | **1.05%** |
| **6. + Step 5 Tuned Constants (Fit on Train)** | **KEEP** | **1.7498** | **4.832** | **1.7577** | **4.891** | **2.3290** | **1.05%** |

### Why Each Change Helped or Failed
1. **Candidate 1 — Minutes Projection × Per-Minute Rate (Kept):**
   - Projects expected minutes from exponentially weighted recent minutes blended with season minutes using a starter (`season_min >= 24.0`, weight `0.45`) vs. bench (`0.30`) role factor, and multiplies by minute-weighted per-minute rates (`sum(w * stat) / sum(w * min)`), blended 70/30 with direct per-game rates. Improved held-out and full MAE and interval calibration. *(Historical point spreads are not stored in `nba_player_game_logs`, so blowout spread discounting was skipped.)*
2. **Candidate 2 — Flat League-Wide Home/Away Adjustment ±1.5% (Kept — largest single error drop):**
   - The original model computed a per-player home/away ratio as soon as a player had 3 home or 3 away games (`LOC_DAMPEN = 0.40`). In the first 5 weeks of the season, 3-to-6 game player splits are dominated by variance. Replacing them with a flat `+1.5%` home / `-1.5%` away multiplier reduced Full PTS MAE from `4.943` to `4.916` and Held-Out Mean MAE from `1.7713` to `1.7580`.
3. **Candidate 3 — Small-Sample Shrinkage & Recent/Season Window De-Overlapping (Kept):**
   - When a player has 10–14 games, `recent = games[:10]` and `season = games` overlap by 70%–100%. Scaling the effective recent-form blend by the non-overlapping share (`eff_blend = FORM_BLEND * (0.35 + 0.65 * (n_total - RECENT_N) / n_total)`) and applying Empirical-Bayes shrinkage (`PRIOR_GAMES = 1.5`) toward league per-minute rate priors reduced Full PTS MAE to `4.896` (**beating the naive `Season Avg` baseline on every primary stat**).
4. **Candidate 4 — Opponent Schedule-Strength (SOS) & Defense Shrinkage (Rejected):**
   - Adjusting team stats allowed by opponent offensive ratings and shrinking team defense ratios toward 1.0 did not improve Held-Out Mean MAE (`1.7517` vs. `1.7517`), slightly worsened Held-Out PTS MAE (`4.838` vs. `4.836`), and worsened Full Mean MAE (`1.7603` vs. `1.7593`), because `OPP_DAMPEN = 0.50` already shrinks opponent ratios halfway to 1.0. Rejected per Step 4 criteria.
5. **Candidate 5 — Distribution-Appropriate Intervals (Kept):**
   - Replaced recent-only `sd` intervals with pooled recent+season volatility inflated by $\sqrt{1 + 1/n}$ (`INTERVAL_Z = 0.98`) for `PTS`, `AST`, `REB`, and a closed-form **Wilson-Hilferty Gamma-Poisson (overdispersed count)** quantile interval for `FG3M`, `STL`, and `BLK`. Mean absolute deviation from the 66% coverage target dropped from **4.40% to 1.05%** (with every stat landing between `64.3%` and `67.8%`).
6. **Step 5 — Constant Tuning on Train (`<= 2026-11-16`), Validated on Held-Out (`> 2026-11-16`) (Kept):**
   - Grid search on the 757 training player-games selected `RECENT_N = 10`, `FORM_BLEND = 0.30` (down from `0.65`), `FORM_DECAY = 0.80` (down from `0.85`), `OPP_DAMPEN = 0.50`, `LOC_DAMPEN = 0.015`, `B2B_FACTOR = 0.96` (up from `0.95`).
   - Validated on the unseen 739 held-out player-games: Held-Out Mean MAE improved from `1.7517` → **`1.7498`** (Held-Out PTS MAE `4.836` → **`4.832`**).

---

## 5. Final Updated Model Performance (`N = 1,496` Walk-Forward)

| Stat | N | Model MAE | Season MAE | Last5 MAE | Model RMSE | Season RMSE | Last5 RMSE | Coverage % | Bias | Pick Acc % | 95% CI | Pick N |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **PTS** | 1496 | **4.891** | 4.903 | 5.158 | **6.452** | 6.461 | 6.768 | **64.3** | -0.648 | **52.8** | [50.2%, 55.3%] | 1448 |
| **AST** | 1496 | **1.409** | 1.419 | 1.508 | **1.903** | 1.919 | 2.034 | **67.8** | -0.149 | **53.9** | [51.2%, 56.5%] | 1329 |
| **REB** | 1496 | **1.958** | 1.966 | 2.047 | **2.535** | 2.543 | 2.666 | **65.8** | -0.030 | **52.7** | [50.1%, 55.3%] | 1395 |
| **FG3M** | 1496 | **1.007** | 1.003 | 1.062 | **1.366** | 1.370 | 1.437 | **65.0** | -0.114 | **49.5** | [46.7%, 52.4%] | 1189 |
| **STL** | 1496 | **0.743** | 0.749 | 0.778 | **0.963** | 0.968 | 1.015 | **65.5** | -0.033 | **52.5** | [49.7%, 55.3%] | 1192 |
| **BLK** | 1496 | **0.538** | 0.536 | 0.553 | **0.755** | 0.758 | 0.795 | **66.9** | 0.006 | **45.1** | [42.3%, 48.0%] | 1164 |

### Before vs. After Delta Summary (`N = 1,496`)

| Stat | Baseline MAE | Final MAE | Δ MAE | Baseline RMSE | Final RMSE | Δ RMSE | Baseline Cov % | Final Cov % (Target 66%) | Baseline Pick % | Final Pick % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **PTS** | 4.947 | **4.891** | **-0.056** | 6.546 | **6.452** | **-0.094** | 61.1% | **64.3%** | 51.6% | **52.8%** |
| **AST** | 1.428 | **1.409** | **-0.019** | 1.921 | **1.903** | **-0.018** | 63.6% | **67.8%** | 52.8% | **53.9%** |
| **REB** | 1.981 | **1.958** | **-0.023** | 2.567 | **2.535** | **-0.032** | 60.7% | **65.8%** | 51.5% | **52.7%** |
| **FG3M** | 1.025 | **1.007** | **-0.018** | 1.392 | **1.366** | **-0.026** | 64.6% | **65.0%** | 47.9% | **49.5%** |
| **STL** | 0.755 | **0.743** | **-0.012** | 0.980 | **0.963** | **-0.017** | 68.2% | **65.5%** | 52.3% | **52.5%** |
| **BLK** | 0.545 | **0.538** | **-0.007** | 0.778 | **0.755** | **-0.023** | 76.2% | **66.9%** | 48.8% | **45.1%** |

---

## 6. Statistical Honesty & What Data Is Needed Next

1. **Statistical Significance vs. Noise (`N = 1,496` over 5 Weeks):**
   - **Real gains:** Replacing the 3-game per-player home/away split with a flat ±1.5% location factor, de-overlapping the recent/season windows, reducing `FORM_BLEND` from `0.65` to `0.30`, and switching to pooled/Gamma-Poisson intervals produced consistent gains on both the training and held-out splits. The model now beats the naive `Season Avg` on **RMSE across all 6 stats** and on **MAE across PTS, AST, REB, and STL**.
   - **Within sample noise:** With `Pick N ≈ 1,160–1,450`, the 95% binomial Wilson confidence interval width is roughly **±2.6 percentage points**. For `PTS` (`52.8%`, 95% CI `[50.2%, 55.4%]`), `AST` (`53.9%`, 95% CI `[51.2%, 56.5%]`), and `REB` (`52.7%`, 95% CI `[50.0%, 55.3%]`), the over/under directional proxy against the player's own season average is barely above 50% at the 95% level, while for low-count discrete stats (`FG3M`, `STL`, `BLK`), directional calls around a continuous season mean are statistically indistinguishable from noise (or skewed by zero-inflation on `BLK`).
2. **What Data Would Move the Model Next:**
   - **Historical sportsbook player prop lines & closing odds:** Evaluating Over/Under against a player's own season average is only a proxy; real pick accuracy and expected value (CLV / ROI) require historical sportsbook prop lines (`O/U 24.5 PTS`, etc.).
   - **Pre-game Vegas team spreads & game totals (Over/Under):** Needed to model **blowout minute reductions** for starters (when spread $\ge 12.5$) and **implied game pace/scoring environment** directly.
   - **Teammate injury / active-roster snapshots per game:** The single largest source of single-game NBA usage and minute spikes is when a high-usage teammate sits out; logging active/inactive statuses per game would allow redistributing vacated usage and minutes.
   - **Full multi-season history in `data/game_logs.parquet`:** Having only ~5 weeks (`248` games) limits early-season priors; retaining prior-season baselines for veteran players would sharpen projections in October and November.
