import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Gateway configuration
const GATEWAY = process.env.VOID_GATEWAY || "openai";

const GATEWAYS: Record<string, { baseUrl: string; apiKey: string; defaultModel: string }> = {
  openai: {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    defaultModel: "gpt-4o",
  },
  anthropic: {
    baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    defaultModel: "claude-sonnet-4-6",
  },
  byok: {
    baseUrl: process.env.BYOK_BASE_URL || "https://integrate.api.nvidia.com/v1",
    apiKey: process.env.BYOK_API_KEY || "",
    defaultModel: "stepfun-ai/step-3.5-flash",
  },
};

const gateway = GATEWAYS[GATEWAY] || GATEWAYS.openai;
const BASE_URL = gateway.baseUrl;
const API_KEY = gateway.apiKey;
const MODEL = process.env.VOID_MODEL || gateway.defaultModel;
const SKILL_NAME = process.env.SKILL_NAME;
const SKILL_VAR = process.env.SKILL_VAR || "";

if (!API_KEY || !SKILL_NAME) {
  console.error(`Error: API key and SKILL_NAME must be set. Gateway: ${GATEWAY}`);
  process.exit(1);
}

async function callOpenAICompatible(messages: any[], tools?: any[]): Promise<any> {
  const body: any = {
    model: MODEL,
    messages,
    stream: false,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API Error (${response.status}): ${err}`);
  }

  return response.json();
}

async function callAnthropic(messages: any[], tools?: any[]): Promise<any> {
  const systemMsg = messages.find(m => m.role === "system");
  const otherMsgs = messages.filter(m => m.role !== "system");

  const body: any = {
    model: MODEL,
    max_tokens: 4096,
    messages: otherMsgs,
  };
  if (systemMsg) {
    body.system = systemMsg.content;
  }
  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  const response = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API Error (${response.status}): ${err}`);
  }

  const data = await response.json();
  // Convert Anthropic response to OpenAI-compatible format
  const choice = data.content[0];
  if (choice.type === "tool_use") {
    return {
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: choice.id,
            type: "function",
            function: {
              name: choice.name,
              arguments: JSON.stringify(choice.input),
            },
          }],
        },
      }],
    };
  }
  return {
    choices: [{
      message: {
        role: "assistant",
        content: choice.text,
      },
    }],
  };
}

async function callLLM(messages: any[], tools?: any[]): Promise<any> {
  if (GATEWAY === "anthropic") {
    return callAnthropic(messages, tools);
  }
  return callOpenAICompatible(messages, tools);
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "execute_bash",
      description: "Execute a bash command in the local environment",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command to run" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_action",
      description: "Execute a Python script in a remote browser to interact with the web",
      parameters: {
        type: "object",
        properties: {
          script: { type: "string", description: "The Python script to execute in the browser" },
        },
        required: ["script"],
      },
    },
  },
];

async function run() {
  try {
    const skillPath = join(process.cwd(), "skills", SKILL_NAME, "SKILL.md");
    const soulPath = join(process.cwd(), "soul", "SOUL.md");

    let skillDef = "";
    try {
      skillDef = readFileSync(skillPath, "utf-8");
    } catch (e) {
      console.error(`Error reading skill file: ${e.message}`);
      process.exit(1);
    }

    let soulDef = "";
    try {
      soulDef = readFileSync(soulPath, "utf-8");
    } catch (e) {
      console.log(`Warning: SOUL.md not found, using default persona.`);
    }

    let globalMemory = "";
    try {
      globalMemory = readFileSync(join(process.cwd(), "memory/MEMORY.md"), "utf-8");
    } catch (e) {
      console.log(`Warning: MEMORY.md not found.`);
    }

    const systemOverride = process.env.VOID_SYSTEM_OVERRIDE;

    console.log(`Void Runner: Executing ${SKILL_NAME} (gateway: ${GATEWAY}, model: ${MODEL})...`);

    const messages = [
      {
        role: "system",
        content: systemOverride || `You are Void, an autonomous agent.
You have access to a bash shell. Use tool calls to execute commands.

Skill Definition:
${skillDef}

Soul/Identity:
${soulDef}

Global Memory:
${globalMemory}

Current Date: ${new Date().toISOString().split("T")[0]}
Variable: ${SKILL_VAR}

Guidelines:
1. Be precise. No fluff.
2. Execute commands to gather info, then analyze.
3. If the skill requires a report or PR, create the files and use 'gh' CLI.
4. MANDATORY FINISH: When you have completed your audit or hit a dead end, you MUST provide a final summary of your findings. To finish, send a response WITHOUT any tool calls. This final response will be saved as the official report.
5. If you are unsure if you are done, summarize what you have found so far and state your conclusion.`,
      },
    ];

    let turn = 0;
    const MAX_TURNS = 40;

    while (turn < MAX_TURNS) {
      turn++;
      console.log(`[Turn ${turn}] Requesting next action...`);

      const data = await callLLM(messages, TOOLS);
      const message = data.choices[0].message;
      messages.push(message);

      if (message.tool_calls) {
        for (const tool of message.tool_calls) {
          const toolName = tool.function.name;
          const args = JSON.parse(tool.function.arguments);

          if (toolName === "execute_bash") {
            const cmd = args.command;
            console.log(`[Tool] Executing Bash: ${cmd}`);
            const result = spawnSync("bash", ["-c", cmd], { encoding: "utf-8" });
            const output = result.stdout || result.stderr || "No output";
            messages.push({ role: "tool", tool_call_id: tool.id, content: output });
          } else if (toolName === "web_action") {
            const script = args.script;
            console.log(`[Tool] Executing Web Action...`);

            try {
              const webResponse = await fetch("https://api.browser-use.com/api/v3/execute_python", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Browser-Use-API-Key": process.env.BROWSER_USE_API_KEY || "",
                },
                body: JSON.stringify({ script }),
              });

              if (!webResponse.ok) {
                const err = await webResponse.text();
                messages.push({ role: "tool", tool_call_id: tool.id, content: `Web Error: ${err}` });
              } else {
                const webData = await webResponse.json();
                messages.push({ role: "tool", tool_call_id: tool.id, content: JSON.stringify(webData.result || webData) });
              }
            } catch (e) {
              messages.push({ role: "tool", tool_call_id: tool.id, content: `Web Error: ${e.message}` });
            }
          }
        }
      } else {
        const finalContent = message.content;
        console.log(`[Final] ${finalContent}`);

        mkdirSync(".outputs", { recursive: true });
        writeFileSync(`.outputs/${SKILL_NAME}.md`, finalContent);

        // Mirror most recent log
        try {
          const logDir = join(process.cwd(), "memory/logs");
          if (existsSync(logDir)) {
            const files = readdirSync(logDir).filter(f => f.endsWith(".md"));
            if (files.length > 0) {
              const latestLog = files.sort((a, b) => statSync(join(logDir, b)).mtimeMs - statSync(join(logDir, a)).mtimeMs)[0];
              const logContent = readFileSync(join(logDir, latestLog), "utf-8");
              writeFileSync(`.outputs/${SKILL_NAME}-log.md`, logContent);
              console.log(`[Mirror] Mirrored latest log ${latestLog} to .outputs`);
            }
          }
        } catch (e) {
          console.error(`[Mirror] No logs to mirror: ${e instanceof Error ? e.message : e}`);
        }

        break;
      }
    }

    if (turn >= MAX_TURNS) {
      console.log(`[Max Turns Reached] Requesting final summary...`);
      try {
        const summaryData = await callLLM([
          ...messages,
          { role: "user", content: "You have reached the maximum number of turns. Please provide a final summary of your findings and conclusions now." },
        ]);
        const finalContent = summaryData.choices[0]?.message?.content || "Max turns reached with no final summary.";
        console.log(`[Forced Final] ${finalContent}`);
        mkdirSync(".outputs", { recursive: true });
        writeFileSync(`.outputs/${SKILL_NAME}.md`, finalContent);
      } catch (e) {
        console.error(`[Error] Failed to get final summary: ${e.message}`);
      }
    }
  } catch (globalError) {
    console.error(`[FATAL] Global Runner Error: ${globalError instanceof Error ? globalError.stack : globalError}`);
    process.exit(1);
  }
}

run().catch(err => {
  console.error(`[CRITICAL] Unhandled Promise Rejection: ${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
