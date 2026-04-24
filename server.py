from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types
from dotenv import load_dotenv
import os
import pandas as pd

load_dotenv()
app = FastAPI()

_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client(api_key=os.getenv("GEMINI_API"))


class PredictionRequest(BaseModel):
    player_name: str
    stats: list  # kept for backward compatibility


nba_data_df = pd.read_csv('nba_player_game_logs.csv')
HAS_TOV = 'TOV' in nba_data_df.columns


def _avg(games: list, key: str) -> float:
    vals = [g[key] for g in games if g.get(key) is not None]
    return round(sum(vals) / len(vals), 1) if vals else 0.0


def _build_game_dict(row) -> dict:
    return {
        "gameDate": row['GAME_DATE'].strftime('%Y-%m-%d') if hasattr(row['GAME_DATE'], 'strftime') else str(row['GAME_DATE'])[:10],
        "matchup": row['MATCHUP'],
        "wl": row['WL'],
        "min": float(row['MIN']),
        "pts": int(row['PTS']),
        "ast": int(row['AST']),
        "reb": int(row['REB']),
        "fgPct": float(row['FG_PCT']),
        "fg3m": int(row['FG3M']),
        "fg3a": int(row['FG3A']),
        "fg3Pct": float(row['FG3_PCT']),
        "stl": int(row['STL']),
        "blk": int(row['BLK']),
        "oreb": int(row['OREB']),
        "dreb": int(row['DREB']),
        "ftm": int(row['FTM']),
        "fta": int(row['FTA']),
        "tov": int(row['TOV']) if HAS_TOV and pd.notna(row.get('TOV')) else None,
    }


@app.get("/player/{name}")
def get_player_stats(name: str):
    try:
        candidates = nba_data_df[nba_data_df['PLAYER_NAME'].str.contains(name, case=False, na=False)]
        if candidates.empty:
            raise HTTPException(status_code=404, detail="Player not found")

        player_id = int(candidates.iloc[0]["PLAYER_ID"])
        nba_players = nba_data_df[nba_data_df['PLAYER_ID'] == player_id].copy()
        nba_players['GAME_DATE'] = pd.to_datetime(nba_players['GAME_DATE'])
        nba_players = nba_players.sort_values(by='GAME_DATE', ascending=False)
        nba_players = nba_players.drop_duplicates(subset=['GAME_ID'], keep='first')
        nba_players = nba_players.fillna(0)

        recent_games = [_build_game_dict(row) for _, row in nba_players.head(10).iterrows()]

        season_avg = {
            "pts": round(float(nba_players["PTS"].mean()), 1),
            "reb": round(float(nba_players["REB"].mean()), 1),
            "ast": round(float(nba_players["AST"].mean()), 1),
        }

        return {
            "id": player_id,
            "name": nba_players.iloc[0]["PLAYER_NAME"],
            "team": "NBA",
            "position": "Player",
            "recentGames": recent_games,
            "seasonAvg": season_avg,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict")
def predict_performance(request: PredictionRequest):
    # Look up all games directly from CSV for accurate full-season context
    candidates = nba_data_df[nba_data_df['PLAYER_NAME'].str.contains(
        request.player_name, case=False, na=False)]
    if candidates.empty:
        raise HTTPException(status_code=404, detail="Player not found in database")

    player_id = int(candidates.iloc[0]["PLAYER_ID"])
    player_df = nba_data_df[nba_data_df['PLAYER_ID'] == player_id].copy()
    player_df['GAME_DATE'] = pd.to_datetime(player_df['GAME_DATE'])
    player_df = player_df.sort_values(by='GAME_DATE', ascending=False)
    player_df = player_df.drop_duplicates(subset=['GAME_ID'], keep='first')
    player_df = player_df.fillna(0)

    all_games = [_build_game_dict(row) for _, row in player_df.iterrows()]
    if not all_games:
        raise HTTPException(status_code=404, detail="No game data found for player")

    last_5 = all_games[:5]
    last_3 = all_games[:3]
    prev_3 = all_games[3:6]

    # Rolling averages (last 5)
    l5_pts   = _avg(last_5, 'pts')
    l5_ast   = _avg(last_5, 'ast')
    l5_reb   = _avg(last_5, 'reb')
    l5_fg3m  = _avg(last_5, 'fg3m')
    l5_stl   = _avg(last_5, 'stl')
    l5_blk   = _avg(last_5, 'blk')
    l5_min   = _avg(last_5, 'min')
    l5_fgpct = _avg(last_5, 'fgPct')
    l5_ftm   = _avg(last_5, 'ftm')
    l5_fta   = _avg(last_5, 'fta')
    l5_tov   = _avg(last_5, 'tov') if HAS_TOV else None

    # Season averages
    s_pts    = _avg(all_games, 'pts')
    s_ast    = _avg(all_games, 'ast')
    s_reb    = _avg(all_games, 'reb')
    s_fg3m   = _avg(all_games, 'fg3m')
    s_min    = _avg(all_games, 'min')
    s_fgpct  = _avg(all_games, 'fgPct')

    # Trends: last 3 vs prior 3
    trend_pts = round(_avg(last_3, 'pts') - _avg(prev_3, 'pts'), 1) if len(prev_3) >= 3 else 0.0
    trend_ast = round(_avg(last_3, 'ast') - _avg(prev_3, 'ast'), 1) if len(prev_3) >= 3 else 0.0
    trend_reb = round(_avg(last_3, 'reb') - _avg(prev_3, 'reb'), 1) if len(prev_3) >= 3 else 0.0

    def fmt(v: float) -> str:
        return f"+{v}" if v > 0 else str(v)

    # Home/away from most recent matchup
    location = "HOME" if 'vs.' in all_games[0].get('matchup', '') else "AWAY"

    # Back-to-back: did the last game come the day after the one before it?
    is_b2b = False
    if len(all_games) >= 2:
        try:
            d0 = pd.to_datetime(all_games[0]['gameDate'])
            d1 = pd.to_datetime(all_games[1]['gameDate'])
            is_b2b = abs((d0 - d1).days) == 1
        except Exception:
            pass

    wins   = [g.get('wl', '') for g in last_5].count('W')
    ft_pct = round(l5_ftm / l5_fta, 3) if l5_fta > 0 else 0.0
    tov_line = f"TOV (last 5 avg): {l5_tov}  |  " if HAS_TOV and l5_tov is not None else ""

    last_3_lines = "\n".join([
        f"  {g['gameDate']} | {g.get('matchup','')} | {g.get('wl','')} | "
        f"{g.get('pts',0)} PTS, {g.get('ast',0)} AST, {g.get('reb',0)} REB, "
        f"{g.get('fg3m',0)} 3PM, {g.get('ftm',0)}/{g.get('fta',0)} FT, "
        f"{int(g.get('min',0))} MIN"
        for g in last_3
    ])

    prompt = f"""You are an expert NBA analyst and sports betting predictor.

PLAYER: {candidates.iloc[0]['PLAYER_NAME']}
GAMES IN DATASET: {len(all_games)}

--- LAST 5 GAMES AVERAGES ---
PTS: {l5_pts}  |  AST: {l5_ast}  |  REB: {l5_reb}  |  FG3M: {l5_fg3m}
STL: {l5_stl}  |  BLK: {l5_blk}  |  MIN: {l5_min}  |  FG%: {l5_fgpct}
FTM/FTA: {l5_ftm}/{l5_fta} (FT%: {ft_pct:.1%})  |  {tov_line}W-L last 5: {wins}-{5-wins}

--- SEASON AVERAGES ({len(all_games)} games) ---
PTS: {s_pts}  |  AST: {s_ast}  |  REB: {s_reb}  |  FG3M: {s_fg3m}
MIN: {s_min}  |  FG%: {s_fgpct}

--- TRENDS (last 3 vs prior 3 games) ---
PTS trend: {fmt(trend_pts)}  |  AST trend: {fmt(trend_ast)}  |  REB trend: {fmt(trend_reb)}

--- NEXT GAME CONTEXT ---
Most recent game was: {location}
Fatigue: {"BACK-TO-BACK — player played yesterday, expect reduced efficiency" if is_b2b else "Normal rest"}

--- LAST 3 GAMES (most recent first) ---
{last_3_lines}

Based on all of the above, predict this player's stats for their NEXT game.
Factor in: hot/cold streaks, fatigue from back-to-back, home vs away splits, recent form vs season baseline.

Return ONLY a valid JSON object with exactly these keys:
  pts_predicted, pts_low, pts_high,
  ast_predicted, ast_low, ast_high,
  reb_predicted, reb_low, reb_high,
  fg3m_predicted, fg3m_low, fg3m_high,
  stl_predicted, blk_predicted,
  prediction_reasoning

All numeric values must be numbers (not strings).
_low and _high values are your confidence range for that stat.
prediction_reasoning must be 2-3 sentences explaining the key factors.
Do not use markdown. Do not wrap in code blocks.
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json"
        )
    )

    return response.text

#uvicorn server:app --reload
