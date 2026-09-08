<h1 align="center">VOID</h1>

<p align="center">
  <strong>The most autonomous agent framework.</strong><br>
  Give it a direction — it'll leverage 30 skills like deep research, PR reviews, market monitoring, and more to get it done. No approval loops. No babysitting. Configure once, forget forever.
</p>

---

## The landscape

The AI agent space is crowded. Claude Code, Cursor, Windsurf, Devin, AutoGPT, CrewAI, LangGraph, OpenClaw, Hermes — everyone's building agents. Most of them are really good at one thing: doing what you ask when you're sitting there watching.

Void is different. It's not a coding assistant. It's not a chatbot. It's an autonomous system you configure once and walk away from. While Claude Code waits for your next prompt, Void is already running your morning brief, scanning your PRs, monitoring token movements, and patching its own broken skills.

The real competition isn't other agent frameworks. It's the manual workflow you're currently doing — the daily check-ins, the routine monitoring, the recurring tasks that eat your time. Void replaces that with a system that never sleeps, never asks for permission, and gets better at its job over time.

---

## Quick start

```bash
git clone https://github.com/emperormk01/void
cd void && ./void
```

Click on `http://localhost:5555` to open the dashboard in your browser. From there:

1. **Authenticate** — add your API key (OpenAI, Anthropic, or BYOK endpoint)
2. **Add a channel** — set up [Telegram, Discord, or Slack](#notifications) so Void can talk to you (and you can talk back)
3. **Pick skills** — toggle on what you want, set a schedule, and optionally set a `var` to focus each skill
4. **Push** — one click commits and pushes your config to GitHub, Actions takes it from there

---

## Skills

| Category | Skills |
|----------|--------|
| **Research & Content** (4) | `deep-research`, `hacker-news-digest`, `last30`, `rss-digest` |
| **Dev & Code** (5) | `pr-review`, `github-monitor`, `github-trending`, `vuln-scanner`, `skill-security-scan` |
| **Crypto & Markets** (4) | `token-alert`, `token-movers`, `on-chain-monitor`, `monitor-polymarket` |
| **Social & Writing** (3) | `write-tweet`, `fetch-tweets`, `farcaster-digest` |
| **Productivity** (3) | `security-digest`, `weekly-shiplog`, `reg-monitor` |
| **Meta / Agent** (7) | `heartbeat`, `self-improve`, `skill-repair`, `skill-health`, `skill-evals`, `create-skill`, `cost-report` |
| **Fleet** (3) | `spawn-instance`, `fleet-control`, `fork-fleet` |
| **Other** (1) | `autoresearch` |

Full descriptions: [`skills.json`](skills.json) — or run `./add-skill emperormk01/void --list`

**Dependency graph:** see the skill categories in the table above — grouped by domain with the self-healing loop and content pipeline highlighted

---

### Instance Fleet

Void can spawn and manage copies of itself via `spawn-instance`, `fleet-control`, and `fork-fleet`. Use this to run specialized instances — one for crypto monitoring, another for research, etc.

Spawn with `var: "crypto-tracker: monitor DeFi protocols and token movements"`. The skill forks the repo, selects relevant skills, and registers it in `memory/instances.json`. No secrets are propagated — the new owner adds their own keys.

---

## Authentication

Set **one** of these — not both:

| Secret | What it is | Billing |
|--------|-----------|---------|
| `OPENAI_API_KEY` | OpenAI API key from platform.openai.com | Pay per token |
| `ANTHROPIC_API_KEY` | Anthropic API key from console.anthropic.com | Pay per token |

**OpenAI (recommended):**
```bash
# Add as a GitHub Actions secret
gh secret set OPENAI_API_KEY
```

**Anthropic:**
```bash
gh secret set ANTHROPIC_API_KEY
```

### Other gateways

| Gateway | Secret | What it is |
|---------|--------|-----------|
| BYOK | `BYOK_API_KEY` + `BYOK_BASE_URL` | Any OpenAI-compatible endpoint (NVIDIA NIM, Together, Groq, etc.) |

Set `gateway.provider` in `void.yml` to switch between providers.

---

## Soul (optional)

By default Void has no personality. To make it write and respond like you, add a soul:

1. Fork [soul.md](https://github.com/emperormk01/soul.md) and fill in your files:
   - `SOUL.md` — identity, worldview, opinions, interests
   - `STYLE.md` — voice, sentence patterns, vocabulary, tone
   - `examples/good-outputs.md` — 10–20 calibration samples
2. Copy into your Void repo under `soul/`
3. Add to the top of `CLAUDE.md`:

```markdown
## Identity

Read and internalize before every task:
- `soul/SOUL.md` — identity and worldview
- `soul/STYLE.md` — voice and communication patterns
- `soul/examples.md` — calibration examples

Embody this identity in all output. Never hedge with "as an AI."
```

Every skill reads `CLAUDE.md`, so identity propagates automatically.

**Quality check:** soul files work when they're specific enough to be wrong. *"I think most AI safety discourse is galaxy-brained cope"* is useful. *"I have nuanced views on AI safety"* is not.

---

## Quality scoring & self-healing

Every skill output is automatically scored 1–5 by Haiku after each run (failed/empty → 1, excellent → 5). Scores and flags (`api_error`, `stale_data`, `rate_limited`) are tracked per skill in `memory/skill-health/` with a rolling 30-run history.

**Heartbeat** is the only skill enabled by default. Runs 3x daily, checks `memory/cron-state.json` for failed, stuck, or chronically broken skills, stalled PRs, and missed schedules. Nothing to report → logs `HEARTBEAT_OK`. Something needs attention → sends one notification. Listed last in `void.yml` so it only fires when no other skill claims the slot.

### Self-healing loop

1. **`heartbeat`** (3x daily) — detects failed, stuck, or chronically broken skills
2. **`skill-health`** — audits quality scores and flags API degradation patterns
3. **`skill-evals`** — assertion-based output quality tests to catch regressions
4. **`skill-repair`** — diagnoses and patches failing skills automatically
5. **`self-improve`** — evolves prompts, config, and workflows based on performance

### Reactive triggers

Skills with `schedule: "reactive"` fire on conditions, not cron. If any skill fails 3x in a row, `skill-repair` auto-fires. The scheduler evaluates triggers after processing cron skills.

```yaml
reactive:
  skill-repair:
    trigger:
      - { on: "*", when: "consecutive_failures >= 3" }
```

### Cost tracking

Every run logs token usage to `memory/token-usage.csv`. The `cost-report` skill generates a weekly breakdown by skill and model.

---

## Configuration

All scheduling lives in `void.yml`:

```yaml
skills:
  article:
    enabled: true               # flip to activate
    schedule: "0 8 * * *"       # daily at 8am UTC
  digest:
    enabled: true
    schedule: "0 14 * * *"
    var: "solana"               # topic for this skill
```

Standard cron format. All times UTC. Supports `*`, `*/N`, exact values, comma lists.

**Order matters** — the scheduler picks the first matching skill. Put day-specific skills (e.g. Monday-only) before daily ones. Heartbeat goes last.

### The `var` field

Every skill accepts a single `var` — a universal input that each skill interprets in its own way:

| Skill type | What `var` does | Example |
|-----------|----------------|---------|
| Research & content | Sets the topic | `var: "rust"` → digest about Rust |
| Dev & code | Narrows to a repo | `var: "owner/repo"` → only review that repo's PRs |
| Crypto | Focuses on a token/wallet | `var: "solana"` → only check SOL price |
| Productivity | Sets the focus area | `var: "shipping v2"` → morning brief emphasizes v2 |

If `var` is empty, each skill falls back to its default behavior (scan everything, auto-pick topics, etc.). Set it from the dashboard or pass it when triggering manually.

### Model selection

The default model for all skills is set in `void.yml`:

```yaml
model: gpt-4o
```

You can change it from the dashboard header dropdown. Options: `gpt-4o`, `gpt-4o-mini`, `gpt-5.2`, `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. Per-run overrides are also available via workflow dispatch.

Individual skills can override the default model to optimize cost:

```yaml
skills:
  token-movers: { enabled: true, schedule: "0 12 * * *", model: "gpt-4o-mini" }
  skill-evals: { enabled: true, schedule: "0 6 * * 0", model: "gpt-4o-mini" }
```

### Skill Chaining

Skills can be chained together so outputs flow between them. Chains run as separate GitHub Actions workflow steps via `chain-runner.yml`.

```yaml
chains:
  morning-pipeline:
    schedule: "0 7 * * *"
    on_error: fail-fast       # or: continue
    steps:
      - parallel: [token-movers, hacker-news-digest]  # run concurrently
      - skill: morning-brief                         # runs after parallel group
        consume: [token-movers, hacker-news-digest]  # gets their outputs injected
```

How it works:
1. Each step runs as a separate workflow dispatch
2. After each skill completes, its output is saved to `.outputs/{skill}.md`
3. Downstream steps with `consume:` get prior outputs injected into context
4. Steps can run in parallel or sequentially
5. `on_error: fail-fast` aborts the chain on any failure; `continue` keeps going

Define chains in `void.yml` alongside your skills. The scheduler dispatches them on their own cron schedule.

---

### Changing check frequency

Edit `.github/workflows/messages.yml`:

```yaml
schedule:
  - cron: '*/5 * * * *'    # every 5 min (default)
  - cron: '*/15 * * * *'   # every 15 min (saves Actions minutes)
  - cron: '0 * * * *'      # hourly (most conservative)
```

Claude only installs and runs when a skill actually matches.

---

## Project structure

```
CLAUDE.md                ← agent identity (auto-loaded by Claude Code)
void.yml                 ← skill schedules, chains, reactive triggers, and enabled flags
skills.json              ← machine-readable skill catalog (30 skills)
./void                   ← launch the local dashboard (Next.js on port 5555)
./notify                 ← multi-channel notifications (Telegram, Discord, Slack, Email, json-render)
./notify-jsonrender      ← convert skill output to dashboard feed cards via Haiku
./add-skill              ← import skills from GitHub repos (with security scanning)
./add-mcp                ← register Void as an MCP server for any MCP client
./generate-skills-json   ← regenerate skills.json from SKILL.md files
soul/                    ← optional identity files (SOUL.md, STYLE.md, examples/, data/)
skills/                  ← each skill is a SKILL.md prompt file
  autoresearch/
  cost-report/
  create-skill/
  deep-research/
  ...                    ← 30 skills total
workflows/               ← GitHub Agentic Workflow templates (.md)
mcp-server/              ← MCP server — exposes skills as tools for any MCP client
dashboard/               ← local web UI (Next.js + json-render feed)
memory/
  MEMORY.md              ← goals, active topics, pointers
  cron-state.json        ← per-skill execution metrics (status, success rate, quality)
  skill-health/          ← rolling quality scores per skill (last 30 runs)
  token-usage.csv        ← token cost tracking per run
  issues/                ← structured issue tracker for skill failures
  topics/                ← detailed notes by topic
  logs/                  ← daily activity logs (YYYY-MM-DD.md)
scripts/
  runner.ts              ← multi-gateway LLM runner (OpenAI, Anthropic, BYOK)
  eval-audit             ← audit eval coverage across skills
  skill-runs             ← audit recent GitHub Actions skill runs
  postprocess-farcaster.sh ← Farcaster cast publishing
  heartbeat-dispatcher.py ← heartbeat signal dispatch
.github/workflows/
  void.yml               ← skill runner (workflow_dispatch, issues, quality scoring)
  chain-runner.yml       ← skill chain executor (parallel + sequential pipelines)
  messages.yml           ← cron scheduler + message polling (Telegram/Discord/Slack)
```

---

## GitHub Actions cost

| Scenario | Cost |
|----------|------|
| No skill matched (most ticks) | ~10s — checkout + bash + exit |
| Skill runs | 2–10 min depending on complexity |
| Heartbeat (nothing found) | ~2 min |
| **Public repo** | **Unlimited free minutes** |

To reduce usage: switch to `*/15` or hourly cron, disable unused skills, keep the repo public.

| Plan | Free minutes/mo | Overage |
|------|----------------|---------|
| Free | 2,000 | N/A (private only) |
| Pro / Team | 3,000 | $0.008/min |

---

## Notifications

Set the secret → channel activates. No code changes needed.

| Channel | Outbound | Inbound |
|---------|---------|---------|
| Telegram | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Same |
| Discord | `DISCORD_WEBHOOK_URL` | `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` |
| Slack | `SLACK_WEBHOOK_URL` | `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID` |
| Email | `SENDGRID_API_KEY` + `NOTIFY_EMAIL_TO` | — |

**Telegram:** Create a bot with @BotFather → get token + chat ID.  
**Discord:** Outbound: Channel → Integrations → Webhooks → Create. Inbound: discord.com/developers → bot → add `channels:history` scope → copy token + channel ID.  
**Slack:** api.slack.com → Create App → Incoming Webhooks → install → copy URL. Inbound: add `channels:history`, `reactions:write` scopes → copy bot token + channel ID.  
**Email:** sendgrid.com/settings/api_keys → Create API Key (Mail Send permission) → add as `SENDGRID_API_KEY`. Set `NOTIFY_EMAIL_TO` to your recipient address. Optional: set repository variable `NOTIFY_EMAIL_FROM` (default: `void@notifications.void.bot`) and `NOTIFY_EMAIL_SUBJECT_PREFIX` (default: `[Void]`).

### Telegram instant mode (optional)

Default polling has up to 5-min delay. Deploy a ~20-line Cloudflare Worker as a webhook for ~1s response time.

---

## Cross-repo access

The built-in `GITHUB_TOKEN` is scoped to this repo only. For `github-monitor`, `pr-review`, `issue-triage`, and `external-feature` to work on your other repos, add a `GH_GLOBAL` personal access token.

| | `GITHUB_TOKEN` | `GH_GLOBAL` |
|--|--------------|------------|
| Scope | This repo | Any repo you grant |
| Created by | GitHub (automatic) | You (manual) |
| Lifetime | Job duration | Up to 1 year |

**Setup:** github.com/settings/tokens → Fine-grained → set repo access → grant Contents, Pull requests, Issues (all read/write) → add as `GH_GLOBAL` secret.

Skills use `GH_GLOBAL` when available, fall back to `GITHUB_TOKEN` automatically.

---

## Adding skills

### Install external skills

```bash
./add-skill emperormk01/void --list          # browse a repo's skills
./add-skill emperormk01/void token-movers   # install a specific skill
./add-skill emperormk01/void --all           # install everything
```

Installed skills land in `skills/` and are added to `void.yml` disabled. Flip `enabled: true` to activate.

### Install from Void's catalog

Every skill is independently installable. Browse the catalog in [`skills.json`](skills.json) or:

```bash
./add-skill emperormk01/void --list                                       # browse
./add-skill emperormk01/void token-alert monitor-polymarket                # install specific
./add-skill emperormk01/void --all                                         # install everything
```

### Trigger feature builds from issues

Label any GitHub issue `ai-build` → workflow fires → Claude reads the issue, implements it, opens a PR.

---

## Publishing

Void can publish content to various channels.

**Notifications:** Telegram, Discord, Slack, Email, or json-render feed cards.

**RSS:** Generate feed from skill outputs via `scripts/generate-feed.sh`.

---

## Integrations (MCP)

Void skills work outside GitHub Actions too — use them from any MCP-compatible client.

**Claude Desktop / Claude Code / Cursor / Copilot** — every skill appears as a `void-<name>` tool:

```bash
./add-mcp                    # build and register with Claude Code
./add-mcp --desktop          # also print Claude Desktop config
./add-mcp --uninstall        # remove
```

Configure your LLM gateway via env vars (same as GitHub Actions):

```bash
export VOID_GATEWAY=openai       # or anthropic, byok
export OPENAI_API_KEY=sk-...
```

Skills run via the configured gateway, identical to Actions.

---

## Two-repo strategy

This repo is a public template. Run your own instance as a **private fork** so memory and API keys stay private.

```bash
# Pull template updates into your private fork
git remote add upstream https://github.com/emperormk01/void.git
git fetch upstream
git merge upstream/main --no-edit
```

Your `memory/` and personal config won't conflict — they're in files that don't exist in the template.

---

Support the project : 0xbf8e8f0e8866a7052f948c16508644347c57aba3
