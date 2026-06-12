
# NBA Betting Analysis UI

A full-stack NBA stats and prediction tool. The original UI design is available at https://www.figma.com/design/hPjKs85O2aM9ZPjLJYYiKj/NBA-Betting-Analysis-UI.

## Stack

- **Frontend:** React + Vite
- **Backend:** FastAPI (Python), hosted on Render
- **Database:** Supabase (PostgreSQL) — stores player game logs
- **AI:** Statistical models + Gemini 2.5 Flash refinement

## Prediction engines

### NBA (players and teams)

Predictions are anchored by a statistical model (`nba_model.py`), not LLM guesswork:

1. Exponentially weighted recent form (last 10 games) blended with season baseline
2. Opponent defensive adjustment — how much the next opponent allows in each stat vs the league average, computed from the game logs
3. Home/away split adjustment (dampened)
4. Back-to-back fatigue discount
5. Prediction intervals from the player's own game-to-game volatility

Before refinement, a Google-Search-grounded Gemini call (`gemini_context.py`) researches what the game logs cannot show: injury report status, minutes restrictions, role changes, and key opponent absences. The findings are injected into the refinement prompt with an **evidence-gated clamp**: Gemini may move numbers ±15% on judgement alone, and up to ±30% only when it cites a concrete, dated news item. If the news lists the player as OUT or QUESTIONABLE, the response carries a `player_status` flag the UI surfaces as a warning banner (the projection itself stays conditional on him playing). If Gemini is unavailable, the model's numbers are returned directly — the endpoint never fails because of the LLM.

### Football (World Cup)

`football_prediction.py` implements a time-decayed Poisson model with the Dixon-Coles low-score correction — the same family of model bookmakers use to seed football odds. From each team's recent finished matches it estimates attack/defense strength (recent games weighted more, shrunk toward baseline on small samples), converts them to expected goals, and derives every market from the full score matrix:

- Win / Draw / Win probabilities and double chance
- Over/Under 0.5 through 4.5 goals
- Both teams to score
- Most likely correct scores and the predicted full-time score

Endpoints:

| Endpoint | Description |
|---|---|
| `GET /football/worldcup/predict/{match_id}` | Full model prediction for a fixture |
| `GET /football/worldcup/assists?limit=20` | Top assist providers |

For finished matches, only form from before kickoff is used (no data leakage). Team form is cached for 6 hours to respect the football-data.org free-tier rate limit. Clicking any fixture card in the UI opens the prediction modal.

**Elo priors and training.** The free data tier has no national-team matches outside the World Cup itself, so each team starts from an Elo strength prior instead of a neutral baseline; observed tournament results blend in on top via Bayesian shrinkage (form trust backtest-tuned to ~29% at 20 games — heavier trust scored worse because raw goal counts ignore opponent strength), plus a light last-3 head-to-head adjustment (~9% influence; stronger H2H weighting hurt the backtest). `football_train.py` recomputes everything offline from the [martj42 international results dataset](https://github.com/martj42/international_results) (~49k matches since 1872): it derives current Elo ratings for all 48 teams, tunes the model constants by grid search on pre-2022 data, backtests on 2022+ (4,570 matches incl. WC 2022; tuned model 0.8755 1X2 log loss vs 1.0986 uniform — also beating an XGBoost comparison at 0.8823), and writes `elo_ratings.json` + `h2h_history.json`, which the live model loads at startup. Re-run it after each international window to refresh.

## Running locally

```bash
# Frontend
npm i
npm run dev

# Backend
pip install -r requirements.txt
uvicorn server:app --reload
```

## Environment variables (backend)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `GEMINI_API` | Gemini API key |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |

If `SUPABASE_URL` is not set, the backend falls back to `nba_player_game_logs.csv` for local development.

## Data refresh

Player game logs are updated daily at **9 AM UTC** via APScheduler running inside the FastAPI process.

- Fetches new games from the NBA API since the last known game date
- Upserts records into Supabase (no duplicates)
- Reloads the in-memory dataframe after each refresh

### Season handling

- The current season is derived automatically from today's date — no hardcoded season strings
- **Offseason (July–September):** the refresh job is skipped entirely
- **Season rollover (October):** old Supabase data is cleared and the new season starts fresh from October 1

### Keeping Render awake

Render's free tier spins down after 15 minutes of inactivity, which would kill the scheduler. A cron job on [cron-job.org](https://cron-job.org) pings the backend every **14 minutes** to keep it alive.

| Field | Value |
|---|---|
| URL | `https://nba-ai.onrender.com` |
| Method | GET |
| Schedule | Every 14 minutes |
