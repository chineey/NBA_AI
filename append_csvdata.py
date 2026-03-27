import pandas as pd
import requests
import os
import time
import urllib.parse # <--- ADDED THIS TO FIX THE BROKEN URL
from dotenv import load_dotenv

load_dotenv()

load_df = pd.read_csv("nba_player_game_logs.csv")
game_date = load_df["GAME_DATE"].max()

scraper_api_key = os.getenv("SCRAPER_API_KEY")

# 1. The raw NBA URL
nba_url = f"https://stats.nba.com/stats/leaguegamelog?Counter=0&DateFrom={game_date}&DateTo=&Direction=ASC&LeagueID=00&PlayerOrTeam=P&Season=2025-26&SeasonType=Regular+Season&Sorter=DATE"

# 2. ENCODE the URL so the '&' symbols don't break ScraperAPI!
encoded_nba_url = urllib.parse.quote(nba_url, safe='')

# 3. Add the encoded URL and premium=true to the ScraperAPI request
scraper_url = f"http://api.scraperapi.com/?api_key={scraper_api_key}&premium=true&url={encoded_nba_url}"

custom_headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.nba.com/',
    'Origin': 'https://www.nba.com',
}

max_retries = 3
df = None

for attempt in range(max_retries):
    try:
        print(f"Attempt {attempt + 1} to fetch NBA data starting from {game_date}...")
        
        response = requests.get(scraper_url, headers=custom_headers, timeout=60)
        
        if response.status_code != 200:
            print(f"ScraperAPI Error {response.status_code}: {response.text}")
            time.sleep(10)
            continue
            
        try:
            data = response.json()
        except ValueError:
            print("Failed to parse JSON. ScraperAPI returned an HTML error page.")
            print("ERROR MESSAGE PREVIEW:", response.text[:200])
            time.sleep(10)
            continue

        headers = data['resultSets'][0]['headers']
        rows = data['resultSets'][0]['rowSet']
        df = pd.DataFrame(rows, columns=headers)
        
        print("Data successfully fetched and parsed!")
        break 
        
    except Exception as e:
        print(f"Fetch failed: {e}")
        if attempt < max_retries - 1:
            print("Sleeping for 10 seconds before retrying...")
            time.sleep(10)
        else:
            print("Max retries reached.")
            raise e 

if df is not None and not df.empty:
    print(f"Found {len(df)} recent games. Merging into database...")
    
    df1 = df[['PLAYER_ID', 'GAME_ID', 'GAME_DATE', 'PLAYER_NAME','TEAM_ABBREVIATION','MATCHUP', 'WL','MIN','PTS', 'AST', 'REB', 'STL', 'BLK', 'OREB', 'DREB', 'FG_PCT', 'FG3M', 'FG3A', 'FG3_PCT', 'FTM','FTA']]

    final_df = pd.concat([load_df, df1], ignore_index=True)

    final_df = final_df.drop_duplicates(
        subset=["PLAYER_ID", "GAME_ID"],
        keep="last"
    )

    final_df.to_csv("nba_player_game_logs.csv", index=False)
    print(f"Success! CSV updated. Total rows: {len(final_df)}")
else:
    print("No new games found to append.")