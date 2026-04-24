from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from nba_api.stats.static import players
from nba_api.stats.endpoints import playergamelog
from google import genai
from google.genai import types
from dotenv import load_dotenv
import os
import pandas as pd
import requests
from nba_api.stats.library.http import NBAStatsHTTP


# 1. Initialize the App (This is the "app" variable uvicorn is looking for!)
load_dotenv()
app = FastAPI()

# 2. Allow your React App to talk to this Server (CORS)
_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Initialize Gemini Client
client = genai.Client(api_key=os.getenv("GEMINI_API"))

# 3. Define the Data Structure for Requests
class PredictionRequest(BaseModel):
    player_name: str
    stats: list 

nba_data_df = pd.read_csv('nba_player_game_logs.csv')

@app.get("/player/{name}")
def get_player_stats(name: str):
    """
    Finds a player and returns their recent game stats.
    """
    try:
        # Find candidates by name, then pin to the exact PLAYER_ID of the first match
        candidates = nba_data_df[nba_data_df['PLAYER_NAME'].str.contains(name, case=False, na=False)]
        if candidates.empty:
            raise HTTPException(status_code=404, detail="Player not found")

        player_id = int(candidates.iloc[0]["PLAYER_ID"])

        # Filter strictly by PLAYER_ID so no other players' rows bleed in
        nba_players = nba_data_df[nba_data_df['PLAYER_ID'] == player_id].copy()

        nba_players['GAME_DATE'] = pd.to_datetime(nba_players['GAME_DATE'])
        nba_players = nba_players.sort_values(by='GAME_DATE', ascending=False)

        # Drop any duplicate game entries, keeping the first (most-recently appended) row
        nba_players = nba_players.drop_duplicates(subset=['GAME_ID'], keep='first')

        nba_players = nba_players.fillna(0)
        
        # Clean up data for the frontend
        #recent_games = nba_players.head(10).to_dict(orient='records')
        recent_games = []
        for index, row in nba_players.head(10).iterrows():
            recent_games.append({
                "gameDate": row['GAME_DATE'].strftime('%Y-%m-%d'),
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
                "dreb": int(row['DREB'])
            })

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

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict")
def predict_performance(request: PredictionRequest):
    """
    Sends the stats to Gemini to predict the next game.
    """
    # Create a prompt string from the stats
    stats_text = str(request.stats)
    
    prompt = f"""
    You are an expert NBA betting analyst. 
    Here are the recent stats for {request.player_name}: {stats_text}
    
    Based on this trend, predict their stats for the next game.
    Return ONLY a JSON object with these keys: pts, ast, reb, fg3m prediction_reasoning.
    Do not use markdown formatting.
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