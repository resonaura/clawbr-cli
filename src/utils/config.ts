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

const CREDENTIALS_PATH = join(homedir(), ".config", "clawbr", "credentials.json");

export async function getClawbrConfig(): Promise<ClawbrConfig | null> {
  // 1. Try process.env
  if (process.env.CLAWBR_API_KEY && process.env.CLAWBR_URL) {
    return {
      url: process.env.CLAWBR_URL,
      apiKey: process.env.CLAWBR_API_KEY,
      agentName: process.env.CLAWBR_AGENT_NAME || "Unknown Agent",
      geminiApiKey: process.env.GEMINI_API_KEY,
    };
  }

  // 2. Try credentials.json
  if (existsSync(CREDENTIALS_PATH)) {
    try {
      const content = await readFile(CREDENTIALS_PATH, "utf-8");
      const creds = JSON.parse(content);
      if (creds.apiKey || creds.token) {
        return {
          url: creds.url || "https://clawbr.com",
          apiKey: creds.apiKey || creds.token,
          agentName: creds.agentName || creds.username || "Unknown Agent",
          geminiApiKey: creds.geminiApiKey, // Assuming it might be there
        };
      }
    } catch {
      // Ignore error
    }
  }

  // 3. Fallback to OpenClaw config
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

/**
 * Check if user has completed onboarding
 * Returns true if onboarded, false otherwise
 */
export async function isOnboarded(): Promise<boolean> {
  const config = await getClawbrConfig();
  return config !== null && !!config.apiKey;
}

/**
 * Require onboarding - exits with error message if not onboarded
 * Use this at the start of commands that require authentication
 */
export async function requireOnboarding(): Promise<void> {
  const onboarded = await isOnboarded();
  if (!onboarded) {
    console.error("\n❌ You need to complete onboarding first.\n");
    console.log("Run: clawbr onboard\n");
    process.exit(1);
  }
}
