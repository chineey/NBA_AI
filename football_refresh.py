"""
Fetch football data for the 10 free-tier club competitions from
football-data.org and upsert it into Supabase, so the live backend never
calls the API itself (avoids the free tier's 10 req/min rate limit).

Run manually, like refresh.py:
    python football_refresh.py                        # all 10 competitions
    python football_refresh.py --competitions PL,CL    # restrict, for testing
    python football_refresh.py --skip-squads           # skip per-team squad sync

Every football-data.org call goes through a sliding-window throttle
(9 requests/minute, a 1-request safety margin under the confirmed 10/min
free-tier cap). A full run across all 10 competitions is ~50 calls before
squads; the squad sync adds one call per team (~180-250 teams), so a full
run including squads takes roughly 25-35 minutes. Safe to re-run any time
-- every upsert is keyed on football-data.org's own IDs.
"""

from __future__ import annotations

import argparse
import os
import time
from collections import deque

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

FOOTBALL_BASE = "https://api.football-data.org/v4"
COMPETITIONS = ["PL", "BL1", "SA", "PD", "FL1", "CL", "DED", "PPL", "ELC", "BSA"]


class Throttle:
    """Sliding-window limiter: at most `max_per_window` calls in any
    trailing `window_seconds`. 9/60s leaves a 1-request/min safety margin
    under football-data.org's confirmed 10 req/min free-tier cap."""

    def __init__(self, max_per_window: int = 9, window_seconds: float = 60.0):
        self.max_per_window = max_per_window
        self.window_seconds = window_seconds
        self._calls: deque[float] = deque()

    def wait(self):
        now = time.time()
        while self._calls and now - self._calls[0] > self.window_seconds:
            self._calls.popleft()
        if len(self._calls) >= self.max_per_window:
            sleep_for = self.window_seconds - (now - self._calls[0]) + 0.05
            if sleep_for > 0:
                time.sleep(sleep_for)
        self._calls.append(time.time())


_throttle = Throttle()


def _get(path: str, params: dict | None = None) -> dict:
    """Throttled GET against football-data.org, with 429/5xx retry."""
    headers = {"X-Auth-Token": os.getenv("FOOTBALL_API_KEY", "")}
    for attempt in range(3):
        _throttle.wait()
        resp = requests.get(f"{FOOTBALL_BASE}{path}", headers=headers, params=params, timeout=30)
        if resp.status_code == 429:
            print(f"    429 rate-limited on {path}, sleeping 60s (attempt {attempt + 1}/3)...")
            time.sleep(60)
            continue
        if resp.status_code >= 500:
            print(f"    {resp.status_code} on {path}, retrying in 10s (attempt {attempt + 1}/3)...")
            time.sleep(10)
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError(f"Failed to fetch {path} after 3 attempts")


def _upsert(sb, table: str, rows: list[dict], batch: int = 500):
    """Batched upsert with retry/backoff, matching migrate_to_supabase.py's pattern."""
    if not rows:
        return
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        for attempt in range(3):
            try:
                sb.table(table).upsert(chunk).execute()
                break
            except Exception as e:
                if attempt < 2:
                    print(f"    upsert to {table} failed ({e}), retrying in 3s...")
                    time.sleep(3)
                else:
                    raise
        print(f"    {table}: {min(i + batch, len(rows))}/{len(rows)} upserted")


def sync_competition(sb, code: str) -> set[int]:
    """Fetch + upsert everything for one competition. Returns the set of team IDs seen."""
    print(f"[{code}] competition meta...")
    comp = _get(f"/competitions/{code}")
    season = comp.get("currentSeason") or {}
    season_id = season.get("id")
    area = comp.get("area") or {}
    start_date = season.get("startDate")
    sb.table("football_competitions").upsert({
        "code": code,
        "competition_id": comp.get("id"),
        "name": comp.get("name", ""),
        "area_name": area.get("name", ""),
        "area_code": area.get("code", ""),
        "emblem": comp.get("emblem") or "",
        "current_season_id": season_id,
        "current_season_start": start_date,
        "current_season_end": season.get("endDate"),
    }).execute()

    print(f"[{code}] teams...")
    teams_data = _get(f"/competitions/{code}/teams")
    teams = [t for t in teams_data.get("teams", []) if t.get("id")]
    _upsert(sb, "football_teams", [{
        "id": t["id"],
        "name": t.get("name", ""),
        "short_name": t.get("shortName", ""),
        "tla": t.get("tla", ""),
        "crest": t.get("crest", ""),
        "address": t.get("address", ""),
        "website": t.get("website", ""),
        "founded": t.get("founded"),
        "club_colors": t.get("clubColors", ""),
        "venue": t.get("venue", ""),
    } for t in teams])

    if season_id:
        season_start_year = int(start_date[:4]) if start_date else None
        _upsert(sb, "football_team_competitions", [{
            "team_id": t["id"], "competition_code": code, "season_id": season_id,
            "season_start_year": season_start_year,
        } for t in teams])

    print(f"[{code}] matches...")
    matches_data = _get(f"/competitions/{code}/matches", params={"season": season_id} if season_id else None)
    match_rows = []
    for m in matches_data.get("matches", []):
        score = m.get("score") or {}
        ft = score.get("fullTime") or {}
        ht = score.get("halfTime") or {}
        match_rows.append({
            "id": m["id"],
            "competition_code": code,
            "season_id": season_id,
            "utc_date": m.get("utcDate"),
            "status": m.get("status", ""),
            "matchday": m.get("matchday"),
            "stage": m.get("stage", ""),
            "match_group": m.get("group"),
            "home_team_id": (m.get("homeTeam") or {}).get("id"),
            "away_team_id": (m.get("awayTeam") or {}).get("id"),
            "full_time_home": ft.get("home"),
            "full_time_away": ft.get("away"),
            "half_time_home": ht.get("home"),
            "half_time_away": ht.get("away"),
            "winner": score.get("winner"),
            "venue": m.get("venue") or "",
            "referees": ", ".join(r.get("name", "") for r in m.get("referees", []) if r.get("name")),
        })
    _upsert(sb, "football_matches", match_rows)

    print(f"[{code}] standings...")
    try:
        standings_data = _get(f"/competitions/{code}/standings")
        standing_rows = []
        for grp in standings_data.get("standings", []):
            if grp.get("type") != "TOTAL":
                continue
            stage = grp.get("stage", "REGULAR_SEASON")
            for entry in grp.get("table", []):
                team = entry.get("team") or {}
                if not team.get("id"):
                    continue
                standing_rows.append({
                    "competition_code": code, "season_id": season_id, "team_id": team["id"],
                    "stage": stage, "standings_group": grp.get("group"),
                    "position": entry.get("position"), "played_games": entry.get("playedGames", 0),
                    "won": entry.get("won", 0), "draw": entry.get("draw", 0), "lost": entry.get("lost", 0),
                    "points": entry.get("points", 0), "goals_for": entry.get("goalsFor", 0),
                    "goals_against": entry.get("goalsAgainst", 0),
                    "goal_difference": entry.get("goalDifference", 0),
                    "form": entry.get("form") or "",
                })
        _upsert(sb, "football_standings", standing_rows)
    except Exception as e:
        print(f"    [warn] standings unavailable for {code}: {e}")

    print(f"[{code}] scorers...")
    try:
        scorers_data = _get(f"/competitions/{code}/scorers", params={"limit": 100})
        player_rows, stat_rows = [], []
        for s in scorers_data.get("scorers", []):
            p = s.get("player") or {}
            team = s.get("team") or {}
            if not p.get("id"):
                continue
            player_rows.append({
                "id": p["id"], "name": p.get("name", ""),
                "position": p.get("position") or p.get("section", "") or "",
                "nationality": p.get("nationality", ""),
                "date_of_birth": p.get("dateOfBirth"),
            })
            stat_rows.append({
                "competition_code": code, "season_id": season_id, "player_id": p["id"],
                "team_id": team.get("id"),
                "goals": s.get("goals", 0) or 0, "assists": s.get("assists", 0) or 0,
                "penalties": s.get("penalties"), "played_matches": s.get("playedMatches", 0) or 0,
            })
        _upsert(sb, "football_players", player_rows)
        _upsert(sb, "football_player_season_stats", stat_rows)
    except Exception as e:
        print(f"    [warn] scorers unavailable for {code}: {e}")

    return {t["id"] for t in teams}


def probe_squads_available(team_id: int) -> bool:
    try:
        data = _get(f"/teams/{team_id}")
        return bool(data.get("squad"))
    except Exception as e:
        print(f"[squad probe] /v4/teams/{{id}} not usable on this plan: {e}")
        return False


def sync_squad(sb, team_id: int):
    data = _get(f"/teams/{team_id}")
    squad = data.get("squad", [])
    _upsert(sb, "football_players", [{
        "id": p["id"], "name": p.get("name", ""), "position": p.get("position", ""),
        "nationality": p.get("nationality", ""), "date_of_birth": p.get("dateOfBirth"),
    } for p in squad if p.get("id")])
    _upsert(sb, "football_player_team", [{
        "player_id": p["id"], "team_id": team_id,
        "shirt_number": p.get("shirtNumber"), "position": p.get("position", ""),
    } for p in squad if p.get("id")])


def main():
    parser = argparse.ArgumentParser(description="Refresh football league data into Supabase.")
    parser.add_argument("--competitions", type=str, default=",".join(COMPETITIONS),
                         help="Comma-separated competition codes (default: all 10 free-tier club competitions).")
    parser.add_argument("--skip-squads", action="store_true", help="Skip per-team squad sync.")
    args = parser.parse_args()
    codes = [c.strip().upper() for c in args.competitions.split(",") if c.strip()]

    sb_url = os.getenv("SUPABASE_URL", "")
    sb_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not sb_url or not sb_key:
        raise SystemExit("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    if not os.getenv("FOOTBALL_API_KEY"):
        raise SystemExit("ERROR: FOOTBALL_API_KEY must be set in .env")
    sb = create_client(sb_url, sb_key)

    print(f"Syncing {len(codes)} competition(s): {', '.join(codes)}")
    all_team_ids: set[int] = set()
    for code in codes:
        try:
            all_team_ids |= sync_competition(sb, code)
        except Exception as e:
            print(f"[{code}] FAILED: {e}")

    if args.skip_squads:
        print("Skipping squad sync (--skip-squads).")
    elif not all_team_ids:
        print("No teams found, skipping squad sync.")
    else:
        probe_id = next(iter(all_team_ids))
        squads_available = probe_squads_available(probe_id)
        print(f"Squad data available on this API plan: {squads_available}")
        if squads_available:
            remaining = sorted(all_team_ids - {probe_id})
            sync_squad(sb, probe_id)
            eta_min = (len(remaining) + 1) // 9 + 1
            print(f"Syncing squads for {len(remaining) + 1} teams (~{eta_min} min at the throttled rate)...")
            for i, team_id in enumerate(remaining, start=2):
                try:
                    sync_squad(sb, team_id)
                except Exception as e:
                    print(f"    [warn] squad sync failed for team {team_id}: {e}")
                if i % 20 == 0:
                    print(f"    {i}/{len(all_team_ids)} teams done")
        else:
            print("Squad endpoint not available on this API plan -- "
                  "/football/teams/{id}/squad will fall back to scorer-derived rosters.")

    print("Football refresh complete.")


if __name__ == "__main__":
    main()
