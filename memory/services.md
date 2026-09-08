# Monitored Services & Dependencies

## Runtime Environment
- **GitHub Actions Runner**: Ubuntu Latest
- **Node.js**: v22
- **Python**: System default
- **Shell**: Bash

## External Services & APIs
- **GitHub API**: Repository operations, PR/Issue management
- **Telegram API**: Notifications (if configured)
- **Various MCP/Tool APIs**: Based on enabled skills

## Core Dependencies
- **LLM Gateway**: OpenAI, Anthropic, or BYOK (configurable via VOID_GATEWAY)
- **Git**: Version control
- **GitHub CLI**: Repository management
- **jq**: JSON processing
- **curl**: HTTP requests

## LLM/Gateway Configuration
- **Default Model**: gpt-4o
- **Gateway**: OpenAI (default), Anthropic, or BYOK (Bring Your Own Key)
- **API Keys**: Uses OPENAI_API_KEY, ANTHROPIC_API_KEY, or BYOK_API_KEY

## Monitoring & Observability
- **Cron State Tracking**: memory/cron-state.json
- **Execution Logs**: memory/logs/*.md
- **Health Metrics**: memory/skill-health/

## Security Posture
**Status**: UNKNOWN - No previous security scan performed
**Last Updated**: 2026-04-21 (INITIAL BASELINE)
