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


class TeamPredictionRequest(BaseModel):
    team_name: str


nba_data_df = pd.read_csv('nba_player_game_logs.csv')
HAS_TOV = 'TOV' in nba_data_df.columns

ABBR_TO_FULL = {
    "ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "BKN": "Brooklyn Nets",
    "CHA": "Charlotte Hornets", "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
    "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons",
    "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
    "LAC": "LA Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies",
    "MIA": "Miami Heat", "MIL": "Milwaukee Bucks", "MIN": "Minnesota Timberwolves",
    "NOP": "New Orleans Pelicans", "NYK": "New York Knicks", "OKC": "Oklahoma City Thunder",
    "ORL": "Orlando Magic", "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns",
    "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs",
    "TOR": "Toronto Raptors", "UTA": "Utah Jazz", "WAS": "Washington Wizards",
}

_TEAM_SEARCH = {
    "atlanta hawks": "ATL", "hawks": "ATL",
    "boston celtics": "BOS", "celtics": "BOS",
    "brooklyn nets": "BKN", "nets": "BKN",
    "charlotte hornets": "CHA", "hornets": "CHA",
    "chicago bulls": "CHI", "bulls": "CHI",
    "cleveland cavaliers": "CLE", "cavaliers": "CLE", "cavs": "CLE",
    "dallas mavericks": "DAL", "mavericks": "DAL", "mavs": "DAL",
    "denver nuggets": "DEN", "nuggets": "DEN",
    "detroit pistons": "DET", "pistons": "DET",
    "golden state warriors": "GSW", "warriors": "GSW", "golden state": "GSW",
    "houston rockets": "HOU", "rockets": "HOU",
    "indiana pacers": "IND", "pacers": "IND",
    "la clippers": "LAC", "los angeles clippers": "LAC", "clippers": "LAC",
    "los angeles lakers": "LAL", "lakers": "LAL",
    "memphis grizzlies": "MEM", "grizzlies": "MEM",
    "miami heat": "MIA", "heat": "MIA",
    "milwaukee bucks": "MIL", "bucks": "MIL",
    "minnesota timberwolves": "MIN", "timberwolves": "MIN", "wolves": "MIN",
    "new orleans pelicans": "NOP", "pelicans": "NOP",
    "new york knicks": "NYK", "knicks": "NYK",
    "oklahoma city thunder": "OKC", "thunder": "OKC", "oklahoma city": "OKC",
    "orlando magic": "ORL", "magic": "ORL",
    "philadelphia 76ers": "PHI", "76ers": "PHI", "sixers": "PHI",
    "phoenix suns": "PHX", "suns": "PHX",
    "portland trail blazers": "POR", "trail blazers": "POR", "blazers": "POR",
    "sacramento kings": "SAC", "kings": "SAC",
    "san antonio spurs": "SAS", "spurs": "SAS",
    "toronto raptors": "TOR", "raptors": "TOR",
    "utah jazz": "UTA", "jazz": "UTA",
    "washington wizards": "WAS", "wizards": "WAS",
}


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

def _resolve_team_abbr(name: str) -> str | None:
    name_up = name.strip().upper()
    if name_up in ABBR_TO_FULL:
        return name_up
    return _TEAM_SEARCH.get(name.strip().lower())


def _build_team_game(group) -> dict:
    game_date = group['GAME_DATE'].iloc[0]
    matchup = str(group['MATCHUP'].iloc[0])
    wl = str(group['WL'].iloc[0])

    pts  = int(group['PTS'].sum())
    ast  = int(group['AST'].sum())
    reb  = int(group['REB'].sum())
    oreb = int(group['OREB'].sum())
    dreb = int(group['DREB'].sum())
    stl  = int(group['STL'].sum())
    blk  = int(group['BLK'].sum())
    fg3m = int(group['FG3M'].sum())
    fg3a = int(group['FG3A'].sum())
    ftm  = int(group['FTM'].sum())
    fta  = int(group['FTA'].sum())
    tov  = int(group['TOV'].sum()) if HAS_TOV else None

    # Estimate team FG%: back-calculate FGM and FGA per player
    fg2m = ((group['PTS'] - group['FTM'] - 3 * group['FG3M']) / 2).clip(lower=0)
    fgm  = fg2m + group['FG3M']
    fga  = fgm.copy().astype(float)
    for idx in group.index:
        fp = group.at[idx, 'FG_PCT']
        fga.at[idx] = fgm.at[idx] / fp if fp > 0 else 0.0
    total_fgm = float(fgm.sum())
    total_fga = float(fga.sum())
    fg_pct  = round(total_fgm / total_fga, 3) if total_fga > 0 else 0.0
    fg3_pct = round(fg3m / fg3a, 3) if fg3a > 0 else 0.0
    ft_pct  = round(ftm / fta, 3)  if fta  > 0 else 0.0

    return {
        "gameDate": game_date.strftime('%Y-%m-%d') if hasattr(game_date, 'strftime') else str(game_date)[:10],
        "matchup": matchup, "wl": wl,
        "pts": pts, "ast": ast, "reb": reb,
        "oreb": oreb, "dreb": dreb, "stl": stl, "blk": blk,
        "fg3m": fg3m, "fg3a": fg3a, "fg3Pct": fg3_pct,
        "fgPct": fg_pct, "ftm": ftm, "fta": fta, "ftPct": ft_pct,
        "tov": tov,
    }


@app.get("/team/{name}")
def get_team_stats(name: str):
    try:
        abbr = _resolve_team_abbr(name)
        if not abbr:
            raise HTTPException(status_code=404, detail="Team not found")

        team_df = nba_data_df[nba_data_df['TEAM_ABBREVIATION'] == abbr].copy()
        if team_df.empty:
            raise HTTPException(status_code=404, detail="No data found for team")

        team_df['GAME_DATE'] = pd.to_datetime(team_df['GAME_DATE'])
        team_df = team_df.fillna(0)

        games = []
        for game_id, group in team_df.groupby('GAME_ID'):
            g = _build_team_game(group)
            g['_sort'] = group['GAME_DATE'].iloc[0]
            games.append(g)

        games.sort(key=lambda x: x['_sort'], reverse=True)
        for g in games:
            del g['_sort']

        recent = games[:10]

        def _tavg(key):
            vals = [g[key] for g in games if g.get(key) is not None]
            return round(sum(vals) / len(vals), 1) if vals else 0.0

        season_avg = {
            "pts": _tavg('pts'), "reb": _tavg('reb'),
            "ast": _tavg('ast'), "fg3m": _tavg('fg3m'),
        }

        return {
            "abbr": abbr,
            "name": ABBR_TO_FULL.get(abbr, abbr),
            "recentGames": recent,
            "seasonAvg": season_avg,
            "totalGames": len(games),
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/team")
def predict_team_performance(request: TeamPredictionRequest):
    abbr = _resolve_team_abbr(request.team_name)
    if not abbr:
        raise HTTPException(status_code=404, detail="Team not found")

    team_df = nba_data_df[nba_data_df['TEAM_ABBREVIATION'] == abbr].copy()
    if team_df.empty:
        raise HTTPException(status_code=404, detail="No data found for team")

    team_df['GAME_DATE'] = pd.to_datetime(team_df['GAME_DATE'])
    team_df = team_df.fillna(0)

    games = []
    for game_id, group in team_df.groupby('GAME_ID'):
        g = _build_team_game(group)
        g['_sort'] = group['GAME_DATE'].iloc[0]
        games.append(g)

    games.sort(key=lambda x: x['_sort'], reverse=True)
    for g in games:
        del g['_sort']

    if not games:
        raise HTTPException(status_code=404, detail="No game data found for team")

    last_5 = games[:5]
    last_3 = games[:3]
    prev_3 = games[3:6]

    def tavg(lst, key):
        vals = [g[key] for g in lst if g.get(key) is not None]
        return round(sum(vals) / len(vals), 1) if vals else 0.0

    l5_pts  = tavg(last_5, 'pts');  l5_ast = tavg(last_5, 'ast')
    l5_reb  = tavg(last_5, 'reb');  l5_fg3m = tavg(last_5, 'fg3m')
    l5_stl  = tavg(last_5, 'stl');  l5_blk = tavg(last_5, 'blk')
    l5_tov  = tavg(last_5, 'tov')  if HAS_TOV else None
    l5_fg3a = tavg(last_5, 'fg3a'); l5_ftm = tavg(last_5, 'ftm')
    l5_fta  = tavg(last_5, 'fta')
    l5_fgpct = tavg(last_5, 'fgPct'); l5_fg3pct = tavg(last_5, 'fg3Pct')

    s_pts = tavg(games, 'pts'); s_ast = tavg(games, 'ast')
    s_reb = tavg(games, 'reb'); s_fg3m = tavg(games, 'fg3m')
    s_fgpct = tavg(games, 'fgPct')

    trend_pts = round(tavg(last_3, 'pts') - tavg(prev_3, 'pts'), 1) if len(prev_3) >= 3 else 0.0
    trend_ast = round(tavg(last_3, 'ast') - tavg(prev_3, 'ast'), 1) if len(prev_3) >= 3 else 0.0
    trend_reb = round(tavg(last_3, 'reb') - tavg(prev_3, 'reb'), 1) if len(prev_3) >= 3 else 0.0

    def fmt(v): return f"+{v}" if v > 0 else str(v)

    location = "HOME" if 'vs.' in games[0].get('matchup', '') else "AWAY"
    wins = [g.get('wl', '') for g in last_5].count('W')
    tov_line = f"TOV (last 5 avg): {l5_tov}  |  " if HAS_TOV and l5_tov is not None else ""

    last_3_lines = "\n".join([
        f"  {g['gameDate']} | {g.get('matchup','')} | {g.get('wl','')} | "
        f"{g.get('pts',0)} PTS, {g.get('ast',0)} AST, {g.get('reb',0)} REB, "
        f"{g.get('fg3m',0)}/{g.get('fg3a',0)} 3P, "
        f"FG%: {g.get('fgPct',0):.1%}, {g.get('ftm',0)}/{g.get('fta',0)} FT"
        for g in last_3
    ])

    full_name = ABBR_TO_FULL.get(abbr, abbr)

    prompt = f"""You are an expert NBA analyst and sports betting predictor.

TEAM: {full_name} ({abbr})
GAMES IN DATASET: {len(games)}

--- LAST 5 GAMES AVERAGES ---
PTS: {l5_pts}  |  AST: {l5_ast}  |  REB: {l5_reb}  |  FG3M: {l5_fg3m} / {l5_fg3a}
STL: {l5_stl}  |  BLK: {l5_blk}  |  FG%: {l5_fgpct:.1%}  |  3P%: {l5_fg3pct:.1%}
FTM/FTA: {l5_ftm}/{l5_fta}  |  {tov_line}W-L last 5: {wins}-{5-wins}

--- SEASON AVERAGES ({len(games)} games) ---
PTS: {s_pts}  |  AST: {s_ast}  |  REB: {s_reb}  |  FG3M: {s_fg3m}  |  FG%: {s_fgpct:.1%}

--- TRENDS (last 3 vs prior 3 games) ---
PTS trend: {fmt(trend_pts)}  |  AST trend: {fmt(trend_ast)}  |  REB trend: {fmt(trend_reb)}

--- NEXT GAME CONTEXT ---
Most recent game was: {location}
W-L record last 5: {wins}-{5-wins}

--- LAST 3 GAMES (most recent first) ---
{last_3_lines}

Based on all of the above, predict this TEAM's stats for their NEXT game.
Factor in: hot/cold streaks, home vs away, recent form vs season baseline, offensive/defensive trends.

Return ONLY a valid JSON object with exactly these keys:
  pts_predicted, pts_low, pts_high,
  ast_predicted, ast_low, ast_high,
  reb_predicted, reb_low, reb_high,
  fg3m_predicted, fg3m_low, fg3m_high,
  tov_predicted, tov_low, tov_high,
  fgPct_predicted,
  prediction_reasoning

All numeric values must be numbers (not strings).
fgPct_predicted is a decimal between 0 and 1 (e.g. 0.478).
_low and _high values are your confidence range for that stat.
prediction_reasoning must be 2-3 sentences explaining the key factors.
Do not use markdown. Do not wrap in code blocks.
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )

    return response.text


#uvicorn server:app --reload
