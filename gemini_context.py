"""
Grounded Gemini research layer, shared by the NBA and football predictors.

Gemini is never asked to produce probabilities or stat lines here — that is
what makes LLM predictions unbalanced. It is used only for what the
statistical models cannot see: breaking news. A single Google-Search-grounded
call returns a structured "context brief" (injuries, suspensions, rotation
plans, motivation), and the callers convert that brief into small,
hard-clamped adjustments to their own model outputs.

Every call is cached and fails soft: no key, no network, junk output —
the statistical model simply runs unadjusted, exactly as before.
"""

from __future__ import annotations

import json
import os
import re
import time

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API")
        if not api_key:
            return None
        from google import genai
        _client = genai.Client(api_key=api_key)
    return _client


# ── Cache (grounded searches are slow and quota-limited) ─────────────────────
_cache: dict[str, tuple[float, dict | None]] = {}
_FAIL_TTL = 120  # retry soon after a transient failure instead of waiting out ttl


def extract_json(text: str) -> dict | None:
    """Pull the first JSON object out of model text.

    Search grounding cannot be combined with JSON response mode, so the
    structured part arrives embedded in prose / code fences.
    """
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidates = [fenced.group(1)] if fenced else []
    start = text.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(text[start:i + 1])
                    break
    for c in candidates:
        try:
            obj = json.loads(c)
            if isinstance(obj, dict):
                return obj
        except (json.JSONDecodeError, ValueError):
            continue
    return None


def grounded_research(prompt: str, cache_key: str, ttl: int = 3600) -> dict | None:
    """One Google-Search-grounded Gemini call expected to yield a JSON object.

    Returns the parsed dict, or None when grounding is unavailable or the
    output is unusable. Results (including failures) are cached for `ttl`
    seconds so a flaky fixture doesn't hammer the quota.
    """
    now = time.time()
    hit = _cache.get(cache_key)
    if hit and now - hit[0] < (ttl if hit[1] is not None else _FAIL_TTL):
        return hit[1]

    result: dict | None = None
    client = _get_client()
    if client is not None:
        from google.genai import types
        for attempt in range(2):
            try:
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        tools=[types.Tool(google_search=types.GoogleSearch())],
                    ),
                )
                result = extract_json(response.text or "")
                break
            except Exception as e:
                print(f"[grounded_research] attempt {attempt + 1} failed ({cache_key}): {e}")
                if attempt == 0 and "503" in str(e):
                    time.sleep(3)
                else:
                    break

    _cache[cache_key] = (now, result)
    return result


def clamp(value, lo: float, hi: float, default: float):
    """Coerce an LLM-supplied number into [lo, hi]; default on junk."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))
