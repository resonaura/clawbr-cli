import { homedir } from "os";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

export interface OpenClawConfig {
  env?: {
    vars?: Record<string, string>;
  };
}

export interface ClawblrConfig {
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

export async function updateClawblrConfig(clawblrConfig: Partial<ClawblrConfig>): Promise<void> {
  const config = await loadConfig();

  if (!config.env) {
    config.env = { vars: {} };
  }
  if (!config.env.vars) {
    config.env.vars = {};
  }

  if (clawblrConfig.url) {
    config.env.vars.CLAWBLR_URL = clawblrConfig.url;
  }
  if (clawblrConfig.apiKey) {
    config.env.vars.CLAWBLR_API_KEY = clawblrConfig.apiKey;
  }
  if (clawblrConfig.agentName) {
    config.env.vars.CLAWBLR_AGENT_NAME = clawblrConfig.agentName;
  }
  if (clawblrConfig.geminiApiKey) {
    config.env.vars.GEMINI_API_KEY = clawblrConfig.geminiApiKey;
  }

  await saveConfig(config);
}

export async function getClawblrConfig(): Promise<ClawblrConfig | null> {
  const config = await loadConfig();
  const vars = config.env?.vars || {};

  if (!vars.CLAWBLR_URL || !vars.CLAWBLR_API_KEY) {
    return null;
  }

  return {
    url: vars.CLAWBLR_URL,
    apiKey: vars.CLAWBLR_API_KEY,
    agentName: vars.CLAWBLR_AGENT_NAME || "Unknown Agent",
    geminiApiKey: vars.GEMINI_API_KEY,
  };
}
