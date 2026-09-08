---
name: Skill Health
description: Audit skill quality metrics, detect API degradation, and report health trends
var: ""
tags: [meta]
---
> **${var}** — Skill name to check. If empty, checks all scheduled skills.

If `${var}` is set, only check that specific skill.

## Data sources

1. **`memory/cron-state.json`** — Per-skill quality metrics:
   ```json
   {
     "skill-name": {
       "last_status": "success|failed|dispatched",
       "last_success": "ISO timestamp",
       "last_failed": "ISO timestamp",
       "total_runs": 10,
       "total_successes": 8,
       "total_failures": 2,
       "consecutive_failures": 0,
       "success_rate": 0.80,
       "last_quality_score": 4,
       "last_error": "error signature text"
     }
   }
   ```

2. **`memory/skill-health/*.json`** — Per-skill quality analysis (written by post-run Haiku analysis):
   ```json
   {
     "skill": "digest",
     "last_analyzed": "ISO timestamp",
     "quality_score": 4,
     "assessment": "one-line quality summary",
     "flags": ["api_error", "stale_data", ...],
     "avg_score": 3.8,
     "history": [{"date": "2026-04-08", "score": 4}, ...]
   }
   ```

3. **`void.yml`** — Enabled skills and their schedules.

## Steps

1. Read `void.yml` for all enabled skills with schedules.
2. Read `memory/cron-state.json` for quality metrics.
3. Read all files in `memory/skill-health/` for quality trends.

4. For each enabled skill, classify its health:

   **CRITICAL** (consecutive_failures >= 3):
   - Likely API degradation or persistent config issue
   - Report the skill, failure count, and `last_error` signature
   - If multiple skills share the same error signature, flag as systemic (e.g. "3 crypto skills failing with rate_limit — CoinGecko API may be down")

   **DEGRADED** (success_rate < 0.6 OR avg quality score < 2.5):
   - Skill runs but produces poor output
   - Report success rate, average quality score, and recent flags

   **WARNING** (success_rate < 0.8 OR consecutive_failures >= 1):
   - Occasional issues worth monitoring
   - Report recent failure and error if available

   **HEALTHY** (success_rate >= 0.8 AND no consecutive failures AND avg score >= 3):
   - Working well

   **NO DATA** (no entry in cron-state.json or total_runs == 0):
   - Never been dispatched by the scheduler

5. Detect API degradation patterns:
   - Group skills by their external API dependencies (crypto skills use CoinGecko/Alchemy, research skills use web APIs, etc.)
   - If 2+ skills in the same group are CRITICAL or DEGRADED, flag the shared dependency
   - Check `last_error` fields for common patterns: "rate limit", "403", "timeout", "connection refused"

6. Check for quality trends:
   - Any skill whose avg_score dropped by > 1 point over the last 10 runs
   - Any skill with recurring flags (same flag in 3+ consecutive analyses)

7. Format the health report:
   ```
   *Skill Health — ${today}*

   🔴 CRITICAL (N):
   skill-a: 5 consecutive failures — "rate limit exceeded" (CoinGecko)
   skill-b: 3 consecutive failures — "timeout"

   ⚠️ API DEGRADATION: CoinGecko skills (token-alert, token-movers) — shared failure pattern

   🟡 DEGRADED (N):
   skill-c: 45% success rate, avg quality 2.1

   🟢 HEALTHY (N): skill-d, skill-e, skill-f, ...
   ⚪ NO DATA (N): skill-g, skill-h
   ```

8. Send via `./notify` if any skills are CRITICAL or DEGRADED.
9. Log to memory/logs/${today}.md.

If all skills healthy, log "SKILL_HEALTH_OK" and end.
