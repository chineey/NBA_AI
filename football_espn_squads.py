"""
Backfill full football squads from ESPN's free, unauthenticated site API,
for competitions where football-data.org's /v4/teams/{id} squad endpoint
isn't available on the current API plan (see football_refresh.py's
probe_squads_available() -- run football_refresh.py first).

Uses the same free ESPN endpoint espn_refresh.py already relies on for NBA
rosters (no API key). Writes into the same football_players /
football_player_team tables football_refresh.py's sync_squad() would have
populated, so football_server.py's /football/teams/{id}/squad endpoint
needs no changes -- it already prefers real squad rows over the
scorer-derived fallback once those tables are non-empty.

Player identity: an ESPN athlete is first matched by normalized name
against that same team's existing scorer-derived football_players rows
(from football_refresh.py's competition scorers sync), so a match reuses
the real football-data.org player ID instead of creating a duplicate.
Unmatched players (defenders/keepers/bench players who've never scored or
assisted) get a synthetic ID -- ESPN's own athlete ID offset well outside
football-data.org's ID range, so it can never collide with a real
football-data.org ID introduced later.

Run after football_refresh.py:
    python football_espn_squads.py                       # all 10 competitions
    python football_espn_squads.py --competitions PL,CL   # restrict, for testing
    python football_espn_squads.py --dry-run              # fetch + match + report, no writes
"""

from __future__ import annotations

import argparse
import difflib
import os
import re
import sys
import time
import unicodedata

import requests
from dotenv import load_dotenv
from supabase import create_client

from football_refresh import COMPETITIONS, _upsert

load_dotenv()

# Windows consoles default to a legacy codepage (e.g. cp1252) that can't
# print every Unicode club/player name (Turkish "ğ", etc.) -- reconfigure to
# UTF-8 so a foreign-language name never crashes the whole run.
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer"
ESPN_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
ESPN_REQUEST_DELAY = 0.6  # polite delay -- ESPN's site API is unauthenticated/undocumented, no published cap

ESPN_SLUGS = {
    "PL": "eng.1", "PD": "esp.1", "BL1": "ger.1", "SA": "ita.1", "FL1": "fra.1",
    "CL": "uefa.champions", "DED": "ned.1", "PPL": "por.1", "ELC": "eng.2", "BSA": "bra.1",
}

# football-data.org's squad "position" field uses these four broad buckets
# (see football_server.py's POS_COLOR/POS_ABBR) -- map ESPN's more granular
# names onto them so the frontend needs no changes.
POSITION_MAP = {
    "Goalkeeper": "Goalkeeper",
    "Defender": "Defence",
    "Midfielder": "Midfield",
    "Forward": "Offence",
    "Attacker": "Offence",
}

# ESPN's numeric athlete IDs are namespaced well above football-data.org's
# own ID range, so a synthetic ID here can never collide with a real
# football-data.org player ID introduced later by football_refresh.py.
ESPN_ID_OFFSET = 900_000_000

_STRIP_WORDS = {
    "fc", "cf", "afc", "sc", "cd", "ac", "sd", "ud", "as", "cfc", "the",
    "club", "calcio", "futebol", "clube", "football", "soccer", "association",
}


# Single-token subset matches are only trusted when the token isn't one of
# these common club words shared by many unrelated clubs (e.g. "united"
# would otherwise happily match Man United, Newcastle United, West Ham...).
_AMBIGUOUS_TOKENS = {
    "united", "city", "real", "athletic", "atletico", "atlético", "sporting",
    "dynamo", "dinamo", "inter", "county", "rovers", "wanderers", "town", "albion",
    "villa", "national", "olympique", "racing", "royal", "internazionale",
}


def _normalize(name: str) -> str:
    """Lowercase, strip accents/punctuation, drop generic club-name noise words."""
    name = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    name = re.sub(r"[^a-z0-9 ]", " ", name.lower())
    words = [w for w in name.split() if w not in _STRIP_WORDS]
    return " ".join(words).strip()


def _tokens(name: str) -> set[str]:
    return set(_normalize(name).split())


def _espn_get(path: str) -> dict:
    for attempt in range(3):
        time.sleep(ESPN_REQUEST_DELAY)
        try:
            resp = requests.get(f"{ESPN_BASE}{path}", headers=ESPN_HEADERS, timeout=20)
            resp.raise_for_status()
            return resp.json()
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            if attempt == 2:
                raise
            print(f"    [retry] {path} ({e.__class__.__name__}), attempt {attempt + 2}/3...")
    raise RuntimeError(f"unreachable: {path}")


def _espn_teams(slug: str) -> list[dict]:
    data = _espn_get(f"/{slug}/teams")
    try:
        return [entry["team"] for entry in data["sports"][0]["leagues"][0]["teams"]]
    except (KeyError, IndexError):
        return []


def _espn_roster(slug: str, espn_team_id: str) -> list[dict]:
    data = _espn_get(f"/{slug}/teams/{espn_team_id}/roster")
    return data.get("athletes", [])


def match_teams(fd_teams: list[dict], espn_teams: list[dict]) -> dict[int, dict]:
    """Match football-data.org teams (id, name, short_name) to ESPN team
    entries. Three tiers, cheapest/safest first: exact normalized-string
    match, then token-subset match (e.g. "Lyon" is a subset of "Olympique
    Lyon"), then fuzzy string similarity as a last resort. Unmatched teams
    are omitted and left on the scorer-derived fallback -- a missed match
    is far cheaper than a wrong one."""
    espn_by_norm: dict[str, dict] = {}
    espn_entries: list[tuple[set[str], dict]] = []
    for t in espn_teams:
        for candidate in (t.get("displayName"), t.get("shortDisplayName"), t.get("name"), t.get("nickname")):
            if not candidate:
                continue
            norm = _normalize(candidate)
            espn_by_norm.setdefault(norm, t)
            espn_entries.append((_tokens(candidate), t))
    espn_norms = list(espn_by_norm.keys())

    matched: dict[int, dict] = {}
    for fd in fd_teams:
        name_candidates = [fd.get("name", ""), fd.get("short_name", "")]
        norm_candidates = [_normalize(c) for c in name_candidates if c]
        found = None

        # 1. exact normalized-string match
        for c in norm_candidates:
            if c and c in espn_by_norm:
                found = espn_by_norm[c]
                break

        # 2. token-subset match, guarded against single ambiguous words
        if not found:
            for c in name_candidates:
                c_tokens = _tokens(c)
                if not c_tokens:
                    continue
                if len(c_tokens) == 1 and next(iter(c_tokens)) in _AMBIGUOUS_TOKENS:
                    continue
                for tokens, team in espn_entries:
                    if tokens and (c_tokens <= tokens or tokens <= c_tokens):
                        found = team
                        break
                if found:
                    break

        # 3. fuzzy fallback
        if not found:
            for c in norm_candidates:
                if not c:
                    continue
                close = difflib.get_close_matches(c, espn_norms, n=1, cutoff=0.75)
                if close:
                    found = espn_by_norm[close[0]]
                    break

        if found:
            matched[fd["id"]] = found
        else:
            print(f"    [no match] {fd.get('name')} ({fd.get('short_name')}) -- left on scorer-derived fallback")
    return matched


def sync_competition_squads(sb, code: str, dry_run: bool) -> tuple[int, int]:
    slug = ESPN_SLUGS.get(code)
    if not slug:
        print(f"[{code}] no ESPN league mapping, skipping.")
        return (0, 0)

    tc_rows = sb.table("football_team_competitions").select("team_id").eq("competition_code", code).execute().data
    team_ids = [r["team_id"] for r in tc_rows]
    if not team_ids:
        print(f"[{code}] no teams found in Supabase -- run football_refresh.py first.")
        return (0, 0)
    fd_teams = sb.table("football_teams").select("id,name,short_name,tla").in_("id", team_ids).execute().data

    print(f"[{code}] fetching ESPN team list ({slug})...")
    espn_teams = _espn_teams(slug)
    matched = match_teams(fd_teams, espn_teams)
    print(f"[{code}] matched {len(matched)}/{len(fd_teams)} teams")

    # Existing scorer-derived players per team, so real football-data.org
    # player IDs get reused instead of duplicated under a synthetic ID. Not
    # filtered by this competition's code: a player's only scorer-derived row
    # may sit under a different competition the same team plays in (e.g. a
    # domestic-league squad's stats only came through via that team's
    # Champions League scorers), and a global-by-team lookup still can't
    # cross into another team's players since team_ids is already scoped.
    stats_rows = sb.table("football_player_season_stats") \
        .select("player_id,team_id").in_("team_id", team_ids).execute().data
    known_ids = {r["player_id"] for r in stats_rows}
    known_names: dict[int, str] = {}
    if known_ids:
        for r in sb.table("football_players").select("id,name").in_("id", list(known_ids)).execute().data:
            known_names[r["id"]] = r["name"]
    by_team_known: dict[int, dict[str, int]] = {}
    for r in stats_rows:
        name = known_names.get(r["player_id"])
        if name:
            by_team_known.setdefault(r["team_id"], {})[_normalize(name)] = r["player_id"]

    player_rows, link_rows = [], []
    teams_synced = 0
    for fd_team_id, espn_team in matched.items():
        try:
            athletes = _espn_roster(slug, espn_team["id"])
        except Exception as e:
            print(f"    [warn] roster fetch failed for {espn_team.get('displayName')}: {e}")
            continue
        if not athletes:
            continue
        teams_synced += 1
        team_known = by_team_known.get(fd_team_id, {})
        for a in athletes:
            name = a.get("fullName") or a.get("displayName", "")
            if not name:
                continue
            player_id = team_known.get(_normalize(name)) or (ESPN_ID_OFFSET + int(a["id"]))
            pos_name = (a.get("position") or {}).get("name", "")
            position = POSITION_MAP.get(pos_name, pos_name)
            jersey = a.get("jersey")
            player_rows.append({
                "id": player_id,
                "name": name,
                "position": position,
                "nationality": a.get("citizenship", ""),
                "date_of_birth": (a.get("dateOfBirth") or "")[:10] or None,
            })
            link_rows.append({
                "player_id": player_id,
                "team_id": fd_team_id,
                "shirt_number": int(jersey) if jersey and jersey.isdigit() else None,
                "position": position,
            })

    print(f"[{code}] {len(player_rows)} players across {teams_synced} teams")
    if not dry_run:
        _upsert(sb, "football_players", player_rows)
        _upsert(sb, "football_player_team", link_rows)
    return (teams_synced, len(player_rows))


def main():
    parser = argparse.ArgumentParser(description="Backfill football squads from ESPN's free API.")
    parser.add_argument("--competitions", type=str, default=",".join(COMPETITIONS),
                         help="Comma-separated competition codes (default: all 10).")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and match only, no Supabase writes.")
    args = parser.parse_args()
    codes = [c.strip().upper() for c in args.competitions.split(",") if c.strip()]

    sb_url = os.getenv("SUPABASE_URL", "")
    sb_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not sb_url or not sb_key:
        raise SystemExit("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sb = create_client(sb_url, sb_key)

    if args.dry_run:
        print("--- DRY RUN: fetching + matching only, no Supabase writes ---")

    total_teams = total_players = 0
    for code in codes:
        try:
            teams, players = sync_competition_squads(sb, code, args.dry_run)
            total_teams += teams
            total_players += players
        except Exception as e:
            print(f"[{code}] FAILED: {e}")

    print(f"\nDone. Synced squads for {total_teams} teams, {total_players} player rows total.")

    deployed_url = os.getenv("DEPLOYED_BACKEND_URL")
    if deployed_url and not args.dry_run:
        print(f"Triggering cache reload on deployed backend: {deployed_url}...")
        try:
            deployed_url = deployed_url.rstrip("/")
            resp = requests.get(f"{deployed_url}/football/reload", timeout=15)
            print(f"    Football reload response: {resp.status_code} - {resp.json()}")
        except Exception as e:
            print(f"    Failed to trigger reload on deployed backend: {e}")


if __name__ == "__main__":
    main()
