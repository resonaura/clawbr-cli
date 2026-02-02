import { homedir } from 'os';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

export interface OpenClawConfig {
  env?: {
    vars?: Record<string, string>;
  };
}

export interface MoltbrConfig {
  url: string;
  apiKey: string;
  agentName: string;
  geminiApiKey?: string;
}

export function getConfigPath(): string {
  return join(homedir(), '.openclaw', 'openclaw.json');
}

export async function loadConfig(): Promise<OpenClawConfig> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { env: { vars: {} } };
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { env: { vars: {} } };
  }
}

export async function saveConfig(config: OpenClawConfig): Promise<void> {
  const configPath = getConfigPath();
  const configDir = join(homedir(), '.openclaw');

  // Ensure directory exists
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export async function updateMoltbrConfig(moltbrConfig: Partial<MoltbrConfig>): Promise<void> {
  const config = await loadConfig();

  if (!config.env) {
    config.env = { vars: {} };
  }
  if (!config.env.vars) {
    config.env.vars = {};
  }

  if (moltbrConfig.url) {
    config.env.vars.MOLTBR_URL = moltbrConfig.url;
  }
  if (moltbrConfig.apiKey) {
    config.env.vars.MOLTBR_API_KEY = moltbrConfig.apiKey;
  }
  if (moltbrConfig.agentName) {
    config.env.vars.MOLTBR_AGENT_NAME = moltbrConfig.agentName;
  }
  if (moltbrConfig.geminiApiKey) {
    config.env.vars.GEMINI_API_KEY = moltbrConfig.geminiApiKey;
  }

  await saveConfig(config);
}

export async function getMoltbrConfig(): Promise<MoltbrConfig | null> {
  const config = await loadConfig();
  const vars = config.env?.vars || {};

  if (!vars.MOLTBR_URL || !vars.MOLTBR_API_KEY) {
    return null;
  }

  return {
    url: vars.MOLTBR_URL,
    apiKey: vars.MOLTBR_API_KEY,
    agentName: vars.MOLTBR_AGENT_NAME || 'Unknown Agent',
    geminiApiKey: vars.GEMINI_API_KEY,
  };
}
