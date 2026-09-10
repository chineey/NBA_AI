"""
FastAPI wrapper around football_refresh.py for cron-triggered deploys.

Does NOT modify football_refresh.py. Imports its building blocks
(sync_competition, sync_squad, probe_squads_available, COMPETITIONS) and
re-implements main()'s orchestration here as an importable, non-blocking
job -- so the original script stays exactly as it was and is still safe
to run standalone from the CLI.

Wire it into your app with:
    from football_refresh_cronjob import router as football_refresh_router
    app.include_router(football_refresh_router)

Env vars needed (on top of what football_refresh.py already needs --
SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTBALL_API_KEY):
    REFRESH_TOKEN=<a long random string you generate once>

After the Supabase upserts finish, this reloads football_server.py's
in-memory cache directly (a plain function call, not an HTTP request) --
that only works because this router and football_server.py's football_router
are mounted in the same process (nba_server.py). DEPLOYED_BACKEND_URL /
LOCAL_BACKEND_URL are not used here.

Cron:
    0 6 * * * curl -X POST "https://your-backend/footballrefresh" \
        -H "X-Refresh-Token: $REFRESH_TOKEN"

NOTE: per the earlier project notes, automating football_refresh.py (and
refresh.py, for nba_api) via cron previously got the source IP blocked for
looking like bot traffic. Running this from your deployed backend reproduces
that pattern -- same IP, same rough daily timing. The jitter below and the
403-specific logging make a block easier to notice, they don't prevent one.
If refreshes start silently failing again, go back to running it manually.
"""

from __future__ import annotations

import os
import random
import threading
import time
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, Header, HTTPException
from supabase import create_client

from football_refresh import (
    COMPETITIONS,
    probe_squads_available,
    sync_competition,
    sync_squad,
)


def _trigger_backend_reload():
    """Reload football_server.py's in-memory cache directly, in-process.

    This refresh job runs inside the same deployed process as
    football_server.py (both are mounted on nba_server.py's app), so there
    is no need to make an HTTP round-trip back to ourselves -- that was only
    ever correct when football_refresh.py was a separate local script
    talking to a different deployed process. Calling the loader directly
    avoids depending on DEPLOYED_BACKEND_URL/LOCAL_BACKEND_URL or on
    self-networking working inside the container at all."""
    try:
        import football_server
        counts = football_server._load_football_data()
        football_server._fb_squads_cache.clear()
        print(f"    In-process reload done: {counts}")
        return counts
    except Exception as e:
        print(f"    In-process reload failed: {e}")
        return None


def run_refresh(codes: list[str], skip_squads: bool = False) -> dict:
    """Same orchestration as football_refresh.py's main(), reimplemented here
    so main() and the original file don't need to change. Never raises for
    per-competition failures (logged and skipped); does raise if required
    env vars are missing."""
    sb_url = os.getenv("SUPABASE_URL", "")
    sb_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not sb_url or not sb_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    if not os.getenv("FOOTBALL_API_KEY"):
        raise RuntimeError("FOOTBALL_API_KEY must be set in .env")
    sb = create_client(sb_url, sb_key)

    print(f"Syncing {len(codes)} competition(s): {', '.join(codes)}")
    all_team_ids: set[int] = set()
    failed_competitions: list[str] = []
    for code in codes:
        try:
            all_team_ids |= sync_competition(sb, code)
        except Exception as e:
            print(f"[{code}] FAILED: {e}")
            failed_competitions.append(code)

    squads_synced = 0
    squads_failed = 0
    squads_available = None
    if skip_squads:
        print("Skipping squad sync (skip_squads=True).")
    elif not all_team_ids:
        print("No teams found, skipping squad sync.")
    else:
        probe_id = next(iter(all_team_ids))
        squads_available = probe_squads_available(probe_id)
        print(f"Squad data available on this API plan: {squads_available}")
        if squads_available:
            remaining = sorted(all_team_ids - {probe_id})
            sync_squad(sb, probe_id)
            squads_synced += 1
            eta_min = (len(remaining) + 1) // 9 + 1
            print(f"Syncing squads for {len(remaining) + 1} teams (~{eta_min} min at the throttled rate)...")
            for i, team_id in enumerate(remaining, start=2):
                try:
                    sync_squad(sb, team_id)
                    squads_synced += 1
                except Exception as e:
                    print(f"    [warn] squad sync failed for team {team_id}: {e}")
                    squads_failed += 1
                if i % 20 == 0:
                    print(f"    {i}/{len(all_team_ids)} teams done")
        else:
            print("Squad endpoint not available on this API plan -- "
                  "/football/teams/{id}/squad will fall back to scorer-derived rosters.")

    print("Football refresh complete.")
    reload_counts = _trigger_backend_reload()

    return {
        "competitions_requested": codes,
        "competitions_failed": failed_competitions,
        "teams_seen": len(all_team_ids),
        "squads_available": squads_available,
        "squads_synced": squads_synced,
        "squads_failed": squads_failed,
        "reload_counts": reload_counts,
    }


# --------------------------------------------------------------------------
# FastAPI route
# --------------------------------------------------------------------------

router = APIRouter()

# Single in-process lock: refuse to start a second run while one is in
# progress (a run can take 25-35 minutes, longer than most cron intervals).
_job_lock = threading.Lock()
_job_state = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "last_result": None,
    "last_error": None,
}


def _run_job_locked(codes: list[str], skip_squads: bool):
    _job_state["running"] = True
    _job_state["started_at"] = datetime.now(timezone.utc).isoformat()
    _job_state["finished_at"] = None
    _job_state["last_error"] = None
    try:
        # Small random delay so a daily cron doesn't hit football-data.org at
        # the exact same second every day. Does not guarantee avoiding a
        # block -- see module docstring.
        jitter = random.uniform(0, 240)
        print(f"Starting job in {jitter:.0f}s (jitter)...")
        time.sleep(jitter)
        result = run_refresh(codes, skip_squads=skip_squads)
        _job_state["last_result"] = result
    except Exception as e:
        print(f"Refresh job FAILED: {e}")
        _job_state["last_error"] = str(e)
    finally:
        _job_state["running"] = False
        _job_state["finished_at"] = datetime.now(timezone.utc).isoformat()
        _job_lock.release()


def _check_token(x_refresh_token: str | None):
    expected = os.getenv("REFRESH_TOKEN")
    if not expected:
        raise HTTPException(status_code=500, detail="REFRESH_TOKEN not configured on the server")
    if x_refresh_token != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Refresh-Token header")


@router.post("/footballrefresh")
def trigger_football_refresh(
    competitions: str | None = None,
    skip_squads: bool = False,
    x_refresh_token: str | None = Header(default=None),
):
    """Cron target. Fires the refresh in a background thread and returns
    immediately -- do NOT wait on this request, the job runs for 25-35 min.
    Poll GET /footballrefresh/status for progress/result."""
    _check_token(x_refresh_token)

    if not _job_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="A refresh is already running")

    codes = (
        [c.strip().upper() for c in competitions.split(",") if c.strip()]
        if competitions else COMPETITIONS
    )
    thread = threading.Thread(target=_run_job_locked, args=(codes, skip_squads), daemon=True)
    thread.start()
    return {"status": "started", "competitions": codes, "skip_squads": skip_squads}


@router.get("/footballrefresh/status")
def football_refresh_status():
    return dict(_job_state)