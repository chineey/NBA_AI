
# NBA Betting Analysis UI

A full-stack NBA stats and prediction tool. The original UI design is available at https://www.figma.com/design/hPjKs85O2aM9ZPjLJYYiKj/NBA-Betting-Analysis-UI.

## Stack

- **Frontend:** React + Vite + TypeScript, gated behind Supabase Auth (email/password login)
- **Backend:** FastAPI (Python), hosted on Render
- **Database:** Supabase (PostgreSQL) — player game logs, player profiles, and team rosters
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

### Football (10 club competitions)

Like the NBA side, football data is ingested once into Supabase and served from an in-memory cache — the deployed backend never calls football-data.org itself, which avoids the free tier's 10 requests/minute limit under real traffic. (Earlier versions of this app called the API live per request for World Cup fixtures only; that's been replaced with this DB-backed, multi-league design.)

`football_prediction.py` implements a time-decayed Poisson model with the Dixon-Coles low-score correction — the same family of model bookmakers use to seed football odds. Club competitions have no equivalent to the decades of international history a national-team model could lean on, so each team's attack/defense strength is estimated purely from matches ingested into our own database (recent games weighted more, shrunk toward a neutral baseline on small samples) rather than an external rating. Every market is derived from the resulting score matrix.

Endpoints (all DB-backed, no live API calls):

| Endpoint | Description |
|---|---|
| `GET /football/competitions` | The 10 ingested competitions |
| `GET /football/competitions/{code}/teams` | Teams in a competition |
| `GET /football/all-teams` | Every team across all 10 competitions |
| `GET /football/players/search?name=` | Player search across all leagues |
| `GET /football/teams/{id}/squad` | Team squad |
| `GET /football/teams/{id}?competition_code=` | Recent form, season stats, next match |
| `POST /football/predict/team` | AI-refined prediction: goals for/against, clean sheet %, win/draw/loss |
| `GET /football/player/{id}` | Player season stats |
| `POST /football/predict/player` | AI-refined prediction: goals/assists for the player's next match |

**Data pipeline.** `football_refresh.py`, run manually (`python football_refresh.py`), pulls all 10 free-tier club competitions — Premier League, Bundesliga, Serie A, La Liga, Ligue 1, Champions League, Eredivisie, Primeira Liga, Championship, and Brasileirão — into Supabase: competitions, teams, a full season of matches per competition, standings, and scorer/assist stats, plus squads where the API plan allows it (falls back to a scorer-derived partial roster otherwise). Every football-data.org call goes through a sliding-window throttle capped at 9 requests/minute (a safety margin under the confirmed 10/min free-tier limit); a full run is ~250-300 calls, roughly 25-35 minutes. Every upsert is keyed on football-data.org's own IDs, so re-running any time (e.g. after a matchday) is always safe.

Same evidence-gated clamp as the NBA side: Gemini may refine the model's goal/assist numbers by ±15% on judgement alone, up to ±30% only when grounded news backs the move — win/draw/loss and clean-sheet probabilities always come straight from the statistical model, never from the LLM.

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
| `FOOTBALL_API_KEY` | football-data.org API key — only needed locally by `football_refresh.py`; the deployed backend reads exclusively from Supabase |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |

If `SUPABASE_URL` is not set, the backend falls back to `nba_player_game_logs.csv` for local development.

## Environment variables (frontend)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL, baked into the JS bundle at build time |
| `VITE_FOOTBALL_API_URL` | Football API base URL — defaults to `http://127.0.0.1:8001` for local dev against `football_server.py` |
| `VITE_SUPABASE_URL` | Supabase project URL, used by the frontend Supabase Auth client |
| `VITE_SUPABASE_ANON` | Supabase anon/public key, used for login/signup |

## Data refresh (NBA)

_For football, see `football_refresh.py` under **Prediction engines → Football** above — same idea, different script._

Game logs are **not** refreshed automatically in production. `stats.nba.com` blocks requests from Render's datacenter IPs, so the in-process APScheduler job (still wired up as a fallback, cron `09:00 UTC`) fails on every real deploy. The backend only ever reads from Supabase — it never fetches game data itself in production.

The real pipeline is `refresh.py`, run manually from a local machine:

- Scrapes ESPN's public scoreboard + box-score endpoints (no API key, no IP restrictions) for every day since the last known game date — or since October 1st if the table is empty or a new season just rolled over
- Resolves and upserts player profiles (height/weight/position/jersey/age via `nba_api`'s `CommonPlayerInfo`) and team rosters (via `CommonTeamRoster`) for any newly-seen players
- Upserts everything into Supabase in batches of 500, keyed on `(player_id, game_id)` — safe to re-run
- The live backend only reloads its in-memory dataframe from Supabase on startup, so a Render restart/redeploy (or waiting for the next natural restart) is what actually surfaces the new rows — `GET /refresh` re-runs the broken NBA-API fallback above and won't pick them up

```bash
python refresh.py
```

`espn_refresh.py` is a companion script that refreshes just team rosters from ESPN (`python espn_refresh.py --team BOS`, or all teams by default) — handy for picking up trades/signings between full game-log refreshes.

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
