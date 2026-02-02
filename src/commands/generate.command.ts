import { Command, CommandRunner, Option } from "nest-commander";
import { writeFileSync, readFileSync, existsSync } from "fs";
import ora from "ora";
import fetch from "node-fetch";
import { resolve } from "path";
import { homedir } from "os";
import { join } from "path";

interface GenerateCommandOptions {
  prompt?: string;
  output?: string;
  size?: string;
  json?: boolean;
}

interface Credentials {
  token: string;
  username: string;
  url: string;
  aiProvider: string;
  apiKeys: {
    openrouter?: string;
    google?: string;
    openai?: string;
  };
}

/**
 * Model configurations for each provider with fallback chains
 */
const MODEL_CONFIGS = {
  openrouter: {
    primary: "black-forest-labs/flux-1.1-pro",
    fallbacks: [
      "black-forest-labs/flux-pro",
      "openai/dall-e-3",
      "stability-ai/stable-diffusion-xl",
    ],
  },
  openai: {
    primary: "dall-e-3",
    fallbacks: ["dall-e-2"], // OpenAI only has DALL-E models
  },
  google: {
    primary: "imagen-4.0-generate-001",
    fallbacks: ["imagen-4.0-fast-generate-001"], // Google Imagen models
  },
};

@Command({
  name: "generate",
  description: "Generate an image using AI with smart model fallback",
  arguments: "",
  options: { isDefault: false },
})
export class GenerateCommand extends CommandRunner {
  async run(inputs: string[], options: GenerateCommandOptions): Promise<void> {
    const { prompt, output, size = "1024x1024", json = false } = options;

    // ─────────────────────────────────────────────────────────────────────
    // Validation
    // ─────────────────────────────────────────────────────────────────────
    if (!prompt) {
      throw new Error(
        '--prompt is required. Example: moltbr generate --prompt "a robot building software" --output "./robot.png"'
      );
    }

    if (!output) {
      throw new Error(
        '--output is required. Example: moltbr generate --prompt "..." --output "./image.png"'
      );
    }

    // Validate size
    const validSizes = ["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"];
    if (!validSizes.includes(size)) {
      throw new Error(`Invalid size. Must be one of: ${validSizes.join(", ")}`);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Load Credentials
    // ─────────────────────────────────────────────────────────────────────
    const credentialsPath = join(homedir(), ".config", "moltbr", "credentials.json");

    if (!existsSync(credentialsPath)) {
      throw new Error(
        "Credentials not found. Run 'moltbr onboard' first to set up your account.\n" +
          `Expected credentials at: ${credentialsPath}`
      );
    }

    let credentials: Credentials;

    try {
      const credentialsData = readFileSync(credentialsPath, "utf-8");
      credentials = JSON.parse(credentialsData);
    } catch {
      throw new Error(
        "Failed to read credentials file. Run 'moltbr onboard' to reconfigure.\n" +
          `Path: ${credentialsPath}`
      );
    }

    const { aiProvider, apiKeys } = credentials;
    const apiKey = apiKeys[aiProvider as keyof typeof apiKeys];

    if (!apiKey) {
      throw new Error(
        `No API key found for provider '${aiProvider}'. Run 'moltbr onboard' to configure.`
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Generate Image with Smart Fallback
    // ─────────────────────────────────────────────────────────────────────
    const spinner = json ? null : ora("Generating image...").start();

    try {
      let imageUrl: string;

      if (aiProvider === "openrouter") {
        imageUrl = await this.generateWithFallback(
          prompt,
          size,
          apiKey,
          "openrouter",
          MODEL_CONFIGS.openrouter,
          spinner
        );
      } else if (aiProvider === "openai") {
        imageUrl = await this.generateWithFallback(
          prompt,
          size,
          apiKey,
          "openai",
          MODEL_CONFIGS.openai,
          spinner
        );
      } else if (aiProvider === "google") {
        imageUrl = await this.generateWithFallback(
          prompt,
          size,
          apiKey,
          "google",
          MODEL_CONFIGS.google,
          spinner
        );
      } else {
        if (spinner) spinner.fail();
        throw new Error(`Unsupported AI provider: ${aiProvider}`);
      }

      // ─────────────────────────────────────────────────────────────────────
      // Download and Save Image
      // ─────────────────────────────────────────────────────────────────────
      if (spinner) spinner.text = "Downloading image...";

      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.statusText}`);
      }

      const imageBuffer = await imageResponse.buffer();
      const outputPath = resolve(output);
      writeFileSync(outputPath, imageBuffer);

      if (spinner) {
        spinner.succeed(`Image generated and saved to: ${outputPath}`);
      }

      // ─────────────────────────────────────────────────────────────────────
      // Output
      // ─────────────────────────────────────────────────────────────────────
      if (json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              prompt,
              output: outputPath,
              size,
              provider: aiProvider,
            },
            null,
            2
          )
        );
      } else {
        console.log("\n🎨 Image Generation Complete!");
        console.log("─────────────────────────────────────");
        console.log(`Prompt: ${prompt}`);
        console.log(`Size: ${size}`);
        console.log(`Output: ${outputPath}`);
        console.log(`Provider: ${aiProvider}`);
        console.log("─────────────────────────────────────\n");
      }
    } catch (error) {
      if (spinner && spinner.isSpinning) {
        spinner.fail("Image generation failed");
      }
      throw error;
    }
  }

  /**
   * Generate image with smart fallback chain
   * Tries primary model first, then falls back to alternatives if it fails
   */
  private async generateWithFallback(
    prompt: string,
    size: string,
    apiKey: string,
    provider: "openrouter" | "openai" | "google",
    config: { primary: string | null; fallbacks: string[] },
    spinner: {
      text: string;
      info: (msg: string) => void;
      warn: (msg: string) => void;
      isSpinning?: boolean;
    } | null
  ): Promise<string> {
    const modelsToTry = [config.primary, ...config.fallbacks].filter(
      (model): model is string => model !== null
    );

    let lastError: Error | null = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];

      try {
        if (spinner) {
          const modelName = model.split("/").pop() || model;
          spinner.text = `Generating image with ${modelName}... (attempt ${i + 1}/${modelsToTry.length})`;
        }

        const imageUrl = await this.generateWithModel(prompt, size, apiKey, provider, model);

        if (spinner && i > 0) {
          // Only show fallback message if we had to fall back
          spinner.info(`Successfully generated with fallback model: ${model}`);
        }

        return imageUrl;
      } catch (error) {
        lastError = error as Error;

        // If this wasn't the last model, log the failure and try the next one
        if (i < modelsToTry.length - 1) {
          if (spinner) {
            spinner.warn(`Model ${model} failed, trying fallback...`);
          } else {
            console.warn(`Model ${model} failed: ${lastError.message}`);
          }
          continue;
        }
      }
    }

    // If we get here, all models failed
    throw new Error(
      `All models failed to generate image. Last error: ${lastError?.message || "Unknown error"}`
    );
  }

  /**
   * Generate image using a specific model
   */
  private async generateWithModel(
    prompt: string,
    size: string,
    apiKey: string,
    provider: "openrouter" | "openai" | "google",
    model: string
  ): Promise<string> {
    let apiUrl: string;
    let headers: Record<string, string>;
    let body: Record<string, unknown>;

    if (provider === "google") {
      // Google Imagen image generation
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;
      headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      };

      // Parse aspect ratio from size (e.g., "1024x1024" -> "1:1")
      const [width, height] = size.split("x").map(Number);
      let aspectRatio = "1:1";
      if (width && height) {
        const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
        const divisor = gcd(width, height);
        aspectRatio = `${width / divisor}:${height / divisor}`;
      }

      body = {
        instances: [
          {
            prompt,
          },
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio,
        },
      };
    } else if (provider === "openrouter") {
      // OpenRouter supports multiple image generation models
      apiUrl = "https://openrouter.ai/api/v1/images/generations";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://moltbr.bricks-studio.ai",
        "X-Title": "Moltbr CLI",
      };

      // Different models have different request formats
      if (model.includes("flux")) {
        // Flux models use image_size instead of size
        const [width, height] = size.split("x").map(Number);
        body = {
          prompt,
          model,
          n: 1,
          width,
          height,
        };
      } else if (model.includes("dall-e")) {
        // DALL-E models use standard OpenAI format
        body = {
          prompt,
          model,
          n: 1,
          size,
        };
      } else {
        // Default format for other models (Stable Diffusion, etc.)
        const [width, height] = size.split("x").map(Number);
        body = {
          prompt,
          model,
          n: 1,
          width,
          height,
        };
      }
    } else {
      // OpenAI direct format
      apiUrl = "https://api.openai.com/v1/images/generations";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      body = {
        prompt,
        model,
        n: 1,
        size,
      };
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || "Unknown error";
      } catch {
        errorMessage = errorText || `HTTP ${response.status} ${response.statusText}`;
      }

      throw new Error(`Image generation failed with ${model}: ${errorMessage}`);
    }

    if (provider === "google") {
      // Google Imagen response format
      const result = (await response.json()) as {
        predictions?: Array<{
          bytesBase64Encoded?: string;
          mimeType?: string;
        }>;
      };

      if (!result.predictions || !result.predictions[0]) {
        throw new Error("Invalid response from Google Imagen API");
      }

      const prediction = result.predictions[0];
      if (!prediction.bytesBase64Encoded) {
        throw new Error("No image data in Google Imagen response");
      }

      // Return base64 image as data URL
      const mimeType = prediction.mimeType || "image/png";
      return `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;
    } else {
      // OpenRouter/OpenAI response format
      const result = (await response.json()) as {
        data?: Array<{ url?: string; b64_json?: string }>;
      };

      // Extract image URL from response
      if (!result.data || !result.data[0]) {
        throw new Error("Invalid response from image generation API");
      }

      // Some APIs return b64_json instead of url
      if (result.data[0].url) {
        return result.data[0].url;
      } else if (result.data[0].b64_json) {
        // Convert base64 to data URL
        return `data:image/png;base64,${result.data[0].b64_json}`;
      } else {
        throw new Error("No image URL or data in response");
      }
    }
  }

  @Option({
    flags: "-p, --prompt <text>",
    description: "Text description of the image to generate",
  })
  parsePrompt(val: string): string {
    return val;
  }

  @Option({
    flags: "-o, --output <path>",
    description: "Path where the generated image will be saved",
  })
  parseOutput(val: string): string {
    return val;
  }

  @Option({
    flags: "-s, --size <size>",
    description: "Image size (256x256, 512x512, 1024x1024, 1792x1024, 1024x1792)",
  })
  parseSize(val: string): string {
    return val;
  }

  @Option({
    flags: "--json",
    description: "Output in JSON format",
  })
  parseJson(): boolean {
    return true;
  }
}
