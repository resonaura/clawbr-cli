/* eslint-disable @typescript-eslint/no-explicit-any */
import { Command, CommandRunner, Option } from "nest-commander";
import { writeFileSync, readFileSync, existsSync } from "fs";
import ora from "ora";
import fetch from "node-fetch";
import { resolve, join } from "path";
import { homedir } from "os";
import { generateImage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

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
    primary: "google/gemini-3-pro-image-preview",
    fallbacks: ["google/gemini-2.5-flash-image-preview"],
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
        '--prompt is required. Example: clawbr generate --prompt "a robot building software" --output "./robot.png"'
      );
    }

    if (!output) {
      throw new Error(
        '--output is required. Example: clawbr generate --prompt "..." --output "./image.png"'
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
    const credentialsPath = join(homedir(), ".config", "clawbr", "credentials.json");

    if (!existsSync(credentialsPath)) {
      throw new Error(
        "Credentials not found. Run 'clawbr onboard' first to set up your account.\n" +
          `Expected credentials at: ${credentialsPath}`
      );
    }

    let credentials: Credentials;

    try {
      const credentialsData = readFileSync(credentialsPath, "utf-8");
      credentials = JSON.parse(credentialsData);
    } catch {
      throw new Error(
        "Failed to read credentials file. Run 'clawbr onboard' to reconfigure.\n" +
          `Path: ${credentialsPath}`
      );
    }

    const { aiProvider, apiKeys } = credentials;
    const apiKey = apiKeys[aiProvider as keyof typeof apiKeys];

    if (!apiKey) {
      throw new Error(
        `No API key found for provider '${aiProvider}'. Run 'clawbr onboard' to configure.`
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Generate Image with Smart Fallback
    // ─────────────────────────────────────────────────────────────────────
    const spinner = json ? null : ora("Generating image...").start();

    try {
      let imageBuffer: Buffer;

      if (aiProvider === "openrouter") {
        imageBuffer = await this.generateWithFallback(
          prompt,
          size,
          apiKey,
          "openrouter",
          MODEL_CONFIGS.openrouter,
          spinner
        );
      } else if (aiProvider === "openai") {
        imageBuffer = await this.generateWithFallback(
          prompt,
          size,
          apiKey,
          "openai",
          MODEL_CONFIGS.openai,
          spinner
        );
      } else if (aiProvider === "google") {
        imageBuffer = await this.generateWithFallback(
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
      // Save Image
      // ─────────────────────────────────────────────────────────────────────
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
  ): Promise<Buffer> {
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

        const imageBuffer = await this.generateWithModel(prompt, size, apiKey, provider, model);

        if (spinner && i > 0) {
          // Only show fallback message if we had to fall back
          spinner.info(`Successfully generated with fallback model: ${model}`);
        }

        return imageBuffer;
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
   * get the model configuration for the AI SDK
   */
  private getImageModel(provider: string, apiKey: string, model: string) {
    if (provider === "openai") {
      const openai = createOpenAI({ apiKey });
      return openai.image(model);
    } else if (provider === "google") {
      const google = createGoogleGenerativeAI({ apiKey });
      return google.image(model);
    }
    throw new Error(`Provider ${provider} not supported via AI SDK`);
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
  ): Promise<Buffer> {
    // ─────────────────────────────────────────────────────────────────────
    // OPENROUTER (Via Fetch / Chat Completions)
    // ─────────────────────────────────────────────────────────────────────
    if (provider === "openrouter") {
      // Parse aspect ratio from size
      const [width, height] = size.split("x").map(Number);
      let aspectRatio = "1:1";
      if (width && height) {
        const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
        const divisor = gcd(width, height);
        aspectRatio = `${width / divisor}:${height / divisor}`;
      }

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://clawbr.bricks-studio.ai",
          "X-Title": "clawbr CLI",
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          // Specific to Gemini/OpenRouter multimodal
          modalities: ["image", "text"],
          image_config: {
            aspect_ratio: aspectRatio,
            // image_size: "4K", // Optional based on snippet, but maybe risky for all models
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter API error: ${text}`);
      }

      const result = (await response.json()) as any;

      if (result.choices?.[0]?.message?.images?.[0]?.image_url?.url) {
        const imageUrl = result.choices[0].message.images[0].image_url.url;

        // If it's a URL, fetch it
        if (imageUrl.startsWith("http")) {
          const imgRes = await fetch(imageUrl);
          const arrayBuffer = await imgRes.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }

        // If it's base64 data URI
        if (imageUrl.startsWith("data:image")) {
          const base64Data = imageUrl.split(",")[1];
          return Buffer.from(base64Data, "base64");
        }

        throw new Error("Unknown image URL format");
      }

      throw new Error("No image generated from OpenRouter response");
    }

    // ─────────────────────────────────────────────────────────────────────
    // OPENAI / GOOGLE (Via AI SDK)
    // ─────────────────────────────────────────────────────────────────────
    const imageModel = this.getImageModel(provider, apiKey, model);

    // Pass size as string directly as per SDK requirements.
    // We cast to 'any' to avoid strict template literal validation errors
    // since we know validSizes allows specifically "1024x1024" etc.
    const { image } = await generateImage({
      model: imageModel,
      prompt,
      n: 1,
      size: size as any,
    });

    // The image object from 'ai' SDK contains the base64 string
    return Buffer.from(image.base64, "base64");
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
