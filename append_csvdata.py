import pandas as pd
import time
from nba_api.stats.endpoints import leaguegamelog


load_df = pd.read_csv("nba_player_game_logs.csv")
game_date = load_df["GAME_DATE"].max()

# --- ADDED FIX: Disguise headers to bypass the NBA bot blocker ---
custom_headers = {
    'Host': 'stats.nba.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nba.com/',
    'Origin': 'https://www.nba.com',
    'Connection': 'keep-alive',
}

# --- ADDED FIX: 3-attempt retry loop with headers and timeout ---
max_retries = 3
for attempt in range(max_retries):
    try:
        gamelog = leaguegamelog.LeagueGameLog(
            season="2025-26",
            player_or_team_abbreviation="P",
            date_from_nullable=game_date,
            headers=custom_headers, 
            timeout=60
        )
        df = gamelog.get_data_frames()[0]
        break  # If successful, break out of the loop
    except Exception as e:
        if attempt < max_retries - 1:
            time.sleep(10)  # Wait 10 seconds before trying again
        else:
            raise e  # Fail loudly if it misses 3 times in a row

df1 = df[['PLAYER_ID', 'GAME_ID', 'GAME_DATE', 'PLAYER_NAME','TEAM_ABBREVIATION','MATCHUP', 'WL','MIN','PTS', 'AST', 'REB', 'STL', 'BLK', 'OREB', 'DREB', 'FG_PCT', 'FG3M', 'FG3A', 'FG3_PCT', 'FTM','FTA']]

final_df = pd.concat([load_df, df1], ignore_index=True)

final_df = final_df.drop_duplicates(
    subset=["PLAYER_ID", "GAME_ID"],
    keep="last"
)

final_df.to_csv("nba_player_game_logs.csv", index=False)



#print(load_df.head(5))