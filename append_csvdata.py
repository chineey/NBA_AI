import pandas as pd
from nba_api.stats.endpoints import leaguegamelog
import os
from dotenv import load_dotenv
import requests
import urllib3

# --- FIX: Disable SSL verification for the ScraperAPI proxy ---
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
original_request = requests.Session.request

def patched_request(self, method, url, **kwargs):
    kwargs['verify'] = False # This forces Python to ignore the SSL mismatch
    return original_request(self, method, url, **kwargs)

requests.Session.request = patched_request
# --------------------------------------------------------------

load_dotenv()

load_df = pd.read_csv("nba_player_game_logs.csv")
game_date = load_df["GAME_DATE"].max()

# Replace YOUR_API_KEY with the one from ScraperAPI
scraper_api = os.getenv("SCRAPER_API_KEY")
proxy_url = f"http://scraperapi:{scraper_api}@proxy-server.scraperapi.com:8001"

gamelog = leaguegamelog.LeagueGameLog(
    season="2025-26",
    player_or_team_abbreviation="P",
    date_from_nullable=game_date,
    proxy=proxy_url, # <--- THIS SNEAKS PAST THE NBA FIREWALL
    timeout=60 # <--- FIX: Added so ScraperAPI has enough time to route the request
)

df = gamelog.get_data_frames()[0]
df1 = df[['PLAYER_ID', 'GAME_ID', 'GAME_DATE', 'PLAYER_NAME','TEAM_ABBREVIATION','MATCHUP', 'WL','MIN','PTS', 'AST', 'REB', 'STL', 'BLK', 'OREB', 'DREB', 'FG_PCT', 'FG3M', 'FG3A', 'FG3_PCT', 'FTM','FTA']]

final_df = pd.concat([load_df, df1], ignore_index=True)

final_df = final_df.drop_duplicates(
    subset=["PLAYER_ID", "GAME_ID"],
    keep="last"
)

final_df.to_csv("nba_player_game_logs.csv", index=False)