import pandas as pd
import time
from nba_api.stats.endpoints import LeagueGameLog

load_df = pd.read_csv("nba_player_game_logs.csv")
game_date = load_df["GAME_DATE"].max()

# Full browser-like headers that NBA stats API expects
custom_headers = {
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Host': 'stats.nba.com',
    'Origin': 'https://www.nba.com',
    'Referer': 'https://www.nba.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
}

max_retries = 3
season_types = ["Regular Season", "PlayIn", "Playoffs"]
all_fetched_dfs = []

for s_type in season_types:
    df_temp = None
    for attempt in range(max_retries):
        try:
            print(f"Attempt {attempt + 1} to fetch {s_type} data starting from {game_date}...")

            time.sleep(3)  # longer delay before each attempt
            logs = LeagueGameLog(
                date_from_nullable=game_date,
                season='2025-26',
                player_or_team_abbreviation='P',
                season_type_all_star=s_type,
                headers=custom_headers,
                timeout=120
            )
            df_temp = logs.get_data_frames()[0]

            if not df_temp.empty:
                print(f"Data for {s_type} successfully fetched!")
                all_fetched_dfs.append(df_temp)
            break

        except Exception as e:
            print(f"Fetch failed for {s_type}: {e}")
            if attempt < max_retries - 1:
                print("Sleeping for 30 seconds before retrying...")
                time.sleep(30)
            else:
                print(f"Max retries reached for {s_type}.")

# Combine all successfully fetched dataframes
if all_fetched_dfs:
    df = pd.concat(all_fetched_dfs, ignore_index=True)
else:
    df = pd.DataFrame()

if not df.empty:
    print(f"Found {len(df)} recent games. Merging into database...")

    df1 = df[['PLAYER_ID', 'GAME_ID', 'GAME_DATE', 'PLAYER_NAME', 'TEAM_ABBREVIATION', 'MATCHUP', 'WL', 'MIN', 'PTS', 'AST', 'REB', 'STL', 'BLK', 'OREB', 'DREB', 'FG_PCT', 'FG3M', 'FG3A', 'FG3_PCT', 'FTM', 'FTA']]

    final_df = pd.concat([load_df, df1], ignore_index=True)

    final_df = final_df.drop_duplicates(
        subset=["PLAYER_ID", "GAME_ID"],
        keep="last"
    )

    final_df.to_csv("nba_player_game_logs.csv", index=False)
    print(f"Success! CSV updated. Total rows: {len(final_df)}")
else:
    print("No new games found to append.")