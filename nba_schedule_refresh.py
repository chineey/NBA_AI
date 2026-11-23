"""
Standalone command to sync the NBA season schedule into Supabase (`nba_schedule`).
Intended to be run a few times per season (e.g., preseason, mid-season/trade deadline,
or playoffs) rather than on every daily game-log refresh.

Usage:
    python nba_schedule_refresh.py
    python nba_schedule_refresh.py --season 2025-26
    python nba_schedule_refresh.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import time
from datetime import date

import pandas as pd
import requests
from dotenv import load_dotenv
from nba_api.stats.endpoints import ScheduleLeagueV2
from supabase import create_client

import db_loader

load_dotenv()

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS nba_schedule (
    game_id TEXT PRIMARY KEY,
    season TEXT NOT NULL,
    game_date DATE NOT NULL,
    game_time_utc TEXT,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    game_status INTEGER,
    status_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_nba_schedule_game_date ON nba_schedule (game_date);
"""


def _current_season() -> str:
    today = date.today()
    start = today.year if today.month >= 10 else today.year - 1
    return f"{start}-{str(start + 1)[2:]}"


def _next_season() -> str:
    today = date.today()
    start = (today.year if today.month >= 10 else today.year - 1) + 1
    return f"{start}-{str(start + 1)[2:]}"


def _fetch_season_schedule(season: str) -> list[dict]:
    print(f"Fetching ScheduleLeagueV2 for {season}...")
    time.sleep(0.5)
    sched = ScheduleLeagueV2(league_id="00", season=season, timeout=15)
    df = sched.get_data_frames()[0]
    if df.empty:
        return []

    df.columns = [c.lower() for c in df.columns]
    parsed_dates = pd.to_datetime(df.get("gamedate"), errors="coerce")

    rows: list[dict] = []
    for idx, row in df.iterrows():
        gid = str(row.get("gameid") or "").strip()
        home = str(row.get("hometeam_teamtricode") or "").strip().upper()
        away = str(row.get("awayteam_teamtricode") or "").strip().upper()
        dt = parsed_dates.iloc[idx]
        if not gid or not home or not away or pd.isna(dt):
            continue

        raw_utc = row.get("gamedatetimeutc")
        game_time_utc = "" if pd.isna(raw_utc) else str(raw_utc).strip()
        raw_status = row.get("gamestatus")
        game_status = int(raw_status) if pd.notna(raw_status) else None
        raw_text = row.get("gamestatustext")
        status_text = "" if pd.isna(raw_text) else str(raw_text).strip()

        rows.append(
            {
                "game_id": gid,
                "season": season,
                "game_date": dt.strftime("%Y-%m-%d"),
                "game_time_utc": game_time_utc,
                "home_team": home,
                "away_team": away,
                "game_status": game_status,
                "status_text": status_text,
            }
        )
    return rows


def ensure_table_exists() -> None:
    if not db_loader.get_database_url():
        return
    with db_loader.pg_connection() as conn:
        if conn is None:
            return
        with conn.cursor() as cur:
            cur.execute(_CREATE_TABLE_SQL)
        conn.commit()


def run(seasons: list[str], dry_run: bool = False) -> None:
    all_rows: dict[str, dict] = {}
    for season in seasons:
        try:
            rows = _fetch_season_schedule(season)
            print(f"  {season}: {len(rows)} games")
            for r in rows:
                all_rows[r["game_id"]] = r
        except Exception as e:
            print(f"  {season}: skipped ({e})")

    records = list(all_rows.values())
    if not records:
        print("No schedule rows fetched.")
        return

    if dry_run:
        print(f"[DRY RUN] Would upsert {len(records)} rows into nba_schedule.")
        return

    ensure_table_exists()

    sb_url = os.getenv("SUPABASE_URL", "")
    sb_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not sb_url or not sb_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sb = create_client(sb_url, sb_key)

    print(f"Upserting {len(records)} rows into nba_schedule...")
    for i in range(0, len(records), 500):
        sb.table("nba_schedule").upsert(records[i : i + 500], on_conflict="game_id").execute()
        print(f"  {min(i + 500, len(records))}/{len(records)} done")

    deployed_url = os.getenv("DEPLOYED_BACKEND_URL")
    if deployed_url:
        print(f"Triggering /reload on {deployed_url}...")
        try:
            resp = requests.get(f"{deployed_url.rstrip('/')}/reload", timeout=15)
            print(f"  Reload response: {resp.status_code} - {resp.json()}")
        except Exception as e:
            print(f"  Reload failed: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync NBA season schedule into Supabase.")
    parser.add_argument(
        "--season",
        type=str,
        help="Specific NBA season label (e.g. 2025-26). Defaults to current + next season.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch schedule without writing to Supabase.",
    )
    args = parser.parse_args()
    target_seasons = [args.season] if args.season else [_current_season(), _next_season()]
    run(seasons=target_seasons, dry_run=args.dry_run)
