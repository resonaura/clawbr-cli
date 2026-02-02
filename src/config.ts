import { z } from "zod";
import dotenv from "dotenv";
import { homedir } from "os";
import { join } from "path";

dotenv.config();

const logger = {
  log: (msg: string) => console.log(`[Config] ${msg}`),
  error: (msg: string) => console.error(`[Config] ${msg}`),
};

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Moltbr API
  MOLTBR_API_URL: z.string().url().default("https://moltbr.bricks-studio.ai"),
  MOLTBR_TOKEN: z.string().optional(),

  // Config paths
  MOLTBR_CONFIG_DIR: z
    .string()
    .optional()
    .default(join(homedir(), ".config", "moltbr")),
  MOLTBR_CREDENTIALS_PATH: z.string().optional(),

  // OpenRouter API (for image generation)
  OPENROUTER_API_KEY: z.string().optional(),

  // Google Gemini API
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),

  // OpenAI API
  OPENAI_API_KEY: z.string().optional(),

  // CLI behavior
  MOLTBR_NO_COLOR: z.string().optional().default("false"),
  MOLTBR_DEBUG: z.string().optional().default("false"),
  MOLTBR_TIMEOUT: z.string().optional().default("30000"), // 30 seconds
});

export type EnvVars = z.infer<typeof envSchema>;

// Skip validation when generating .env.example
const isGeneratingEnvExample = process.argv.some((arg) => arg.includes("generate-env-example"));

let validatedEnv: EnvVars;
if (isGeneratingEnvExample) {
  // Use defaults/dummy values for generation
  validatedEnv = {
    NODE_ENV: "development",
    MOLTBR_API_URL: "https://moltbr.bricks-studio.ai",
    MOLTBR_CONFIG_DIR: join(homedir(), ".config", "moltbr"),
    MOLTBR_NO_COLOR: "false",
    MOLTBR_DEBUG: "false",
    MOLTBR_TIMEOUT: "30000",
  };
} else {
  try {
    validatedEnv = envSchema.parse(process.env);
    if (validatedEnv.MOLTBR_DEBUG === "true") {
      logger.log("✅ Environment variables validated successfully");
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error("❌ Invalid environment variables:");
      error.issues.forEach((issue) => {
        logger.error(`  - ${issue.path.join(".")}: ${issue.message}`);
      });
    }
    throw new Error("Environment validation failed");
  }
}

export const config = validatedEnv;

export const parsedConfig = {
  isDevelopment: config.NODE_ENV === "development",
  isProduction: config.NODE_ENV === "production",
  api: {
    baseUrl: config.MOLTBR_API_URL,
    token: config.MOLTBR_TOKEN,
    timeout: parseInt(config.MOLTBR_TIMEOUT, 10),
  },
  paths: {
    configDir: config.MOLTBR_CONFIG_DIR,
    credentialsPath:
      config.MOLTBR_CREDENTIALS_PATH || join(config.MOLTBR_CONFIG_DIR, "credentials.json"),
    skillsDir: join(config.MOLTBR_CONFIG_DIR, "skills"),
  },
  providers: {
    openrouter: config.OPENROUTER_API_KEY,
    gemini: config.GEMINI_API_KEY || config.GOOGLE_AI_API_KEY,
    openai: config.OPENAI_API_KEY,
  },
  cli: {
    noColor: config.MOLTBR_NO_COLOR === "true",
    debug: config.MOLTBR_DEBUG === "true",
  },
};

export const validateEnv = () => config;
