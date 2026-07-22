"""
Fetch NBA team rosters from ESPN's API, resolve official NBA player IDs,
and upsert the roster data to Supabase.

This serves as a faster-updating fallback/alternative to stats.nba.com.

Usage:
    # Dry run (test only, no DB updates)
    python espn_refresh.py --dry-run
    
    # Update all rosters in Supabase
    python espn_refresh.py
    
    # Update only the Celtics roster
    python espn_refresh.py --team BOS
"""

import os
import sys
import time
import argparse
import requests
from dotenv import load_dotenv
from supabase import create_client
from nba_api.stats.static import players as static_players

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path)

# Standard list of 30 NBA teams
TEAMS = [
    'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
    'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
    'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'
]


def standard_to_espn_abbr(abbr: str) -> str:
    """Map standard NBA team abbreviations to ESPN API codes."""
    mapping = {
        'GSW': 'gs',
        'NOP': 'no',
        'NYK': 'ny',
        'SAS': 'sa',
        'PHX': 'pho',
        'UTA': 'uth',
        'WAS': 'wsh',
    }
    return mapping.get(abbr.upper(), abbr.lower())


def clean_height(h: str) -> str:
    """Convert ESPN height format (e.g., 6' 11") to NBA API format (e.g., 6-11)."""
    if not h:
        return ""
    # Standardize quotes and strip spaces
    h = h.replace('"', '').strip()
    if "'" in h:
        parts = h.split("'")
        ft = parts[0].strip()
        inches = parts[1].strip() if len(parts) > 1 else "0"
        return f"{ft}-{inches}"
    return h


def clean_weight(w) -> str:
    """Convert ESPN weight to integer string to match NBA API schema."""
    if w is None:
        return ""
    try:
        return str(int(float(w)))
    except Exception:
        return str(w).strip()


def find_official_player_id(player_name: str, espn_id: int, sb_client=None) -> int:
    """
    Resolve official NBA player ID from full name using offline static database
    and Supabase fallbacks. Falls back to ESPN ID if not resolved.
    """
    # 1. Try exact offline lookup from nba_api static database
    try:
        matches = static_players.find_players_by_full_name(player_name)
        if matches:
            return int(matches[0]['id'])
    except Exception:
        pass

    # 2. Try normalized offline lookup (remove punctuation & suffixes)
    normalized_name = player_name.replace('.', '').replace(',', '').strip()
    for suffix in [' Jr', ' III', ' II', ' IV', ' Sr']:
        if normalized_name.endswith(suffix):
            normalized_name = normalized_name[:-len(suffix)].strip()
            break
            
    try:
        matches = static_players.find_players_by_full_name(normalized_name)
        if matches:
            return int(matches[0]['id'])
    except Exception:
        pass

    # 3. Query Supabase cached tables if client is available
    if sb_client:
        try:
            # Query profiles table
            resp = sb_client.table('nba_player_profiles').select('player_id').ilike('name', f"%{normalized_name}%").limit(1).execute()
            if resp.data:
                return int(resp.data[0]['player_id'])
        except Exception:
            pass

        try:
            # Query game logs table
            resp = sb_client.table('nba_player_game_logs').select('player_id').ilike('player_name', f"%{normalized_name}%").limit(1).execute()
            if resp.data:
                return int(resp.data[0]['player_id'])
        except Exception:
            pass

    # Fallback to ESPN's ID if no official NBA ID can be mapped
    print(f"    [Warning] Could not resolve official NBA ID for {player_name}. Using ESPN ID: {espn_id}")
    return espn_id


def refresh_roster(team_abbr: str, sb_client, dry_run: bool = False) -> list:
    """Fetch, parse, and optionally upsert ESPN roster for a specific team."""
    espn_code = standard_to_espn_abbr(team_abbr)
    url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{espn_code}/roster"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  [Error] Failed to fetch roster for {team_abbr}: {e}")
        return []
        
    athletes = data.get("athletes", [])
    print(f"  Parsed {len(athletes)} players for {team_abbr} from ESPN.")
    
    roster_rows = []
    for athlete in athletes:
        raw_id = athlete.get("id")
        espn_id = int(raw_id) if raw_id else 0
        name = athlete.get("displayName", "")
        
        # Resolve NBA Player ID
        player_id = find_official_player_id(name, espn_id, sb_client)
        
        jersey = str(athlete.get("jersey", "")).strip()
        
        pos_obj = athlete.get("position", {})
        position = str(pos_obj.get("abbreviation", "")).strip()
        
        height = clean_height(athlete.get("displayHeight", ""))
        weight = clean_weight(athlete.get("weight"))
        
        roster_rows.append({
            "team_abbr": team_abbr,
            "player_id": player_id,
            "player_name": name,
            "jersey": jersey,
            "position": position,
            "height": height,
            "weight": weight,
        })
        
    if not dry_run and roster_rows and sb_client:
        print(f"  Upserting {len(roster_rows)} players for {team_abbr} to Supabase...")
        try:
            # Match the refresh.py batch-upsert pattern
            for i in range(0, len(roster_rows), 100):
                batch = roster_rows[i:i+100]
                sb_client.table('nba_team_rosters').upsert(batch).execute()
            print(f"  Roster upserted successfully for {team_abbr}.")
        except Exception as e:
            print(f"  [Error] Failed to upsert roster for {team_abbr} to Supabase: {e}")
            
    return roster_rows


def main():
    parser = argparse.ArgumentParser(description="Refresh NBA team rosters using ESPN API.")
    parser.add_option = parser.add_argument(
        "--team", 
        type=str, 
        choices=TEAMS, 
        help="Specify standard 3-letter abbreviation of team to refresh (default: all teams)."
    )
    parser.add_argument(
        "--dry-run", 
        action="store_true", 
        help="Fetch and resolve player details without modifying the Supabase database."
    )
    args = parser.parse_args()
    
    # Initialize Supabase client
    sb_url = os.getenv("SUPABASE_URL", "")
    sb_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    
    sb_client = None
    if not args.dry_run:
        if not sb_url or not sb_key:
            print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
            sys.exit(1)
        sb_client = create_client(sb_url, sb_key)
    else:
        print("--- RUNNING IN DRY-RUN MODE (No Supabase updates will be made) ---")
        # Try initializing client for resolution purposes, but ignore failures
        if sb_url and sb_key:
            try:
                sb_client = create_client(sb_url, sb_key)
            except Exception:
                pass

    teams_to_process = [args.team] if args.team else TEAMS
    print(f"Processing rosters for: {', '.join(teams_to_process)}")
    
    total_parsed = 0
    for idx, team in enumerate(teams_to_process):
        print(f"[{idx+1}/{len(teams_to_process)}] Refreshing {team}...")
        rows = refresh_roster(team, sb_client, args.dry_run)
        total_parsed += len(rows)
        
        # Polite rate limiting delay between team fetches
        if idx < len(teams_to_process) - 1:
            time.sleep(0.8)
            
    print(f"\nRoster refresh complete. Total players processed: {total_parsed}")


if __name__ == "__main__":
    main()
