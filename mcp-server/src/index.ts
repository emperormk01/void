#!/usr/bin/env node
/**
 * Void MCP Server
 *
 * Exposes all Void skills as MCP tools so any MCP-compatible client
 * (Claude Desktop, Claude Code, Cursor, Copilot, etc.) can invoke them.
 *
 * Tool naming: void-{slug} (e.g. void-deep-research, void-token-movers)
 * Each tool accepts a single optional `var` argument (the skill's variable input).
 *
 * Skill execution: uses the configured LLM gateway (OpenAI, Anthropic, etc.)
 * exactly as GitHub Actions does, so local runs are identical to scheduled runs.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// mcp-server/dist/index.js → mcp-server/ → repo root
const REPO_ROOT = join(__dirname, "..", "..");

interface Skill {
  slug: string;
  name: string;
  description: string;
  category: string;
  schedule: string;
  var: string;
}

interface SkillsManifest {
  version: string;
  repo: string;
  skills: Skill[];
}

function loadSkills(): Skill[] {
  const manifestPath = join(REPO_ROOT, "skills.json");
  if (!existsSync(manifestPath)) {
    process.stderr.write(
      `[void-mcp] skills.json not found at ${manifestPath}\n`
    );
    return [];
  }
  const manifest: SkillsManifest = JSON.parse(
    readFileSync(manifestPath, "utf-8")
  );
  return manifest.skills ?? [];
}

function skillToToolName(slug: string): string {
  return `void-${slug}`;
}

function toolNameToSlug(toolName: string): string {
  return toolName.replace(/^void-/, "");
}

function buildTools(skills: Skill[]) {
  return skills.map((skill) => ({
    name: skillToToolName(skill.slug),
    description: buildDescription(skill),
    inputSchema: {
      type: "object" as const,
      properties: {
        var: {
          type: "string",
          description: buildVarDescription(skill),
        },
      },
      required: [],
    },
  }));
}

function buildDescription(skill: Skill): string {
  const categoryLabel = categoryName(skill.category);
  const scheduleLabel =
    skill.schedule === "on-demand"
      ? "on-demand"
      : `cron: ${skill.schedule}`;
  return `[Void · ${categoryLabel}] ${skill.description} (${scheduleLabel})`;
}

function buildVarDescription(skill: Skill): string {
  if (skill.var) return skill.var;
  const defaults: Record<string, string> = {
    research: "Topic or keyword to focus the skill on (e.g. 'AI agents'). Leave empty for auto-selection.",
    dev: "Repo in owner/repo format to narrow scope. Leave empty to scan all watched repos.",
    crypto: "Token symbol or contract address to focus on. Leave empty for all tracked tokens.",
    social: "Topic, handle, or keyword. Leave empty to use configured defaults.",
    productivity: "Focus area or goal. Leave empty for general operation.",
  };
  return (
    defaults[skill.category] ??
    `Optional variable input for the ${skill.name} skill.`
  );
}

function categoryName(category: string): string {
  const labels: Record<string, string> = {
    research: "Research",
    dev: "Dev",
    crypto: "Crypto",
    social: "Social",
    productivity: "Productivity",
  };
  return labels[category] ?? category;
}

// ── Gateway logic (mirrors runner.ts) ──────────────────────────────────────

type GatewayProvider = "openai" | "anthropic" | "byok";

interface GatewayConfig {
  provider: GatewayProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

function resolveGateway(): GatewayConfig {
  const provider = (process.env.VOID_GATEWAY || "openai") as GatewayProvider;
  const model = process.env.VOID_MODEL || "gpt-4o";

  const configs: Record<GatewayProvider, () => GatewayConfig> = {
    openai: () => ({
      provider: "openai",
      apiKey: requireEnv("OPENAI_API_KEY"),
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model,
    }),
    anthropic: () => ({
      provider: "anthropic",
      apiKey: requireEnv("ANTHROPIC_API_KEY"),
      baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
      model,
    }),
    byok: () => ({
      provider: "byok",
      apiKey: requireEnv("BYOK_API_KEY"),
      baseUrl: process.env.BYOK_BASE_URL || "https://integrate.api.nvidia.com/v1",
      model: process.env.BYOK_MODEL || "stepfun-ai/step-3.5-flash",
    }),
  };

  const configure = configs[provider];
  if (!configure) {
    throw new Error(`Unknown gateway provider: ${provider}. Set VOID_GATEWAY to openai, anthropic, or byok.`);
  }
  return configure();
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Set the ${name} environment variable (and optionally VOID_GATEWAY).`);
  return v;
}

// ── Anthropic API (Claude) ─────────────────────────────────────────────────

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

async function callAnthropic(baseUrl: string, apiKey: string, model: string, prompt: string): Promise<string> {
  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${err}`);
  }

  const data = (await resp.json()) as AnthropicResponse;
  const block = data.content.find((b) => b.type === "text");
  if (!block) throw new Error("No text content in Anthropic response");
  const tokens = data.usage.input_tokens + data.usage.output_tokens;
  process.stderr.write(`[void-mcp] Provider: anthropic · ${tokens} tokens\n`);
  return block.text;
}

// ── OpenAI-compatible API (OpenAI, BYOK) ──────────────────────────────────

interface OpenAIResponse {
  id: string;
  choices: Array<{ message: { role: string; content: string }; finish_reason: string }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, prompt: string): Promise<string> {
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 8192,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`API error ${resp.status}: ${err}`);
  }

  const data = (await resp.json()) as OpenAIResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in API response");
  const tokens = data.usage?.total_tokens ?? 0;
  process.stderr.write(`[void-mcp] Provider: openai-compatible · ${tokens} tokens\n`);
  return content;
}

// ── Unified LLM call ───────────────────────────────────────────────────────

async function callLLM(prompt: string): Promise<string> {
  const gw = resolveGateway();
  if (gw.provider === "anthropic") {
    return callAnthropic(gw.baseUrl, gw.apiKey, gw.model, prompt);
  }
  return callOpenAICompatible(gw.baseUrl, gw.apiKey, gw.model, prompt);
}

// ── Skill execution ────────────────────────────────────────────────────────

async function runSkill(slug: string, varValue: string): Promise<string> {
  const skillFile = join(REPO_ROOT, "skills", slug, "SKILL.md");
  if (!existsSync(skillFile)) {
    return [
      `Error: skill '${slug}' not found.`,
      `Expected SKILL.md at: ${skillFile}`,
      `Make sure you're running the MCP server from inside a Void repo clone.`,
    ].join("\n");
  }

  const today = new Date().toISOString().split("T")[0];
  let prompt = `Today is ${today}. Read and execute the skill defined in skills/${slug}/SKILL.md`;

  if (varValue.trim()) {
    prompt += `\n\nUse this variable (override the default in the skill file):\nvar=${varValue.trim()}`;
  }

  process.stderr.write(`[void-mcp] Running skill: ${slug}${varValue ? ` (var=${varValue})` : ""}\n`);

  try {
    return await callLLM(prompt);
  } catch (err: any) {
    return `Skill '${slug}' failed: ${err.message}`;
  }
}

// ── Server setup ───────────────────────────────────────────────────────────

const server = new Server(
  { name: "void-mcp", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

const skills = loadSkills();
const tools = buildTools(skills);

process.stderr.write(
  `[void-mcp] Loaded ${skills.length} skills from ${REPO_ROOT}\n`
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const slug = toolNameToSlug(toolName);
  const skill = skills.find((s) => s.slug === slug);

  if (!skill) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Unknown Void tool: ${toolName}\nAvailable tools: ${tools.map((t) => t.name).join(", ")}`,
        },
      ],
      isError: true,
    };
  }

  const varValue = (request.params.arguments?.var as string) ?? "";
  const output = await runSkill(slug, varValue);

  return {
    content: [{ type: "text" as const, text: output }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[void-mcp] Server running on stdio\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`[void-mcp] Fatal error: ${err}\n`);
  process.exit(1);
});
