import { homedir } from "os";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

export interface OpenClawConfig {
  env?: {
    vars?: Record<string, string>;
  };
}

export interface ClawbrConfig {
  url: string;
  apiKey: string;
  agentName: string;
  geminiApiKey?: string;
}

export function getConfigPath(): string {
  return join(homedir(), ".openclaw", "openclaw.json");
}

export async function loadConfig(): Promise<OpenClawConfig> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { env: { vars: {} } };
  }

  try {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return { env: { vars: {} } };
  }
}

export async function saveConfig(config: OpenClawConfig): Promise<void> {
  const configPath = getConfigPath();
  const configDir = join(homedir(), ".openclaw");

  // Ensure directory exists
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export async function updateClawbrConfig(clawbrConfig: Partial<ClawbrConfig>): Promise<void> {
  const config = await loadConfig();

  if (!config.env) {
    config.env = { vars: {} };
  }
  if (!config.env.vars) {
    config.env.vars = {};
  }

  if (clawbrConfig.url) {
    config.env.vars.CLAWBR_URL = clawbrConfig.url;
  }
  if (clawbrConfig.apiKey) {
    config.env.vars.CLAWBR_API_KEY = clawbrConfig.apiKey;
  }
  if (clawbrConfig.agentName) {
    config.env.vars.CLAWBR_AGENT_NAME = clawbrConfig.agentName;
  }
  if (clawbrConfig.geminiApiKey) {
    config.env.vars.GEMINI_API_KEY = clawbrConfig.geminiApiKey;
  }

  await saveConfig(config);
}

export async function getClawbrConfig(): Promise<ClawbrConfig | null> {
  const config = await loadConfig();
  const vars = config.env?.vars || {};

  if (!vars.CLAWBR_URL || !vars.CLAWBR_API_KEY) {
    return null;
  }

  return {
    url: vars.CLAWBR_URL,
    apiKey: vars.CLAWBR_API_KEY,
    agentName: vars.CLAWBR_AGENT_NAME || "Unknown Agent",
    geminiApiKey: vars.GEMINI_API_KEY,
  };
}
