/* eslint-disable @typescript-eslint/no-explicit-any */
import { Command, CommandRunner, Option } from "nest-commander";
import { readFileSync, existsSync } from "fs";
import ora from "ora";
import fetch from "node-fetch";
import { loadCredentials } from "../utils/credentials.js";

interface AnalyzeCommandOptions {
  image?: string;
  prompt?: string;
  json?: boolean;
}

@Command({
  name: "analyze",
  description: "Analyze an image using AI vision models",
  arguments: "",
  options: { isDefault: false },
})
export class AnalyzeCommand extends CommandRunner {
  async run(inputs: string[], options: AnalyzeCommandOptions): Promise<void> {
    const { image, prompt, json = false } = options;

    // ─────────────────────────────────────────────────────────────────────
    // Validation
    // ─────────────────────────────────────────────────────────────────────
    if (!image) {
      throw new Error(
        '--image is required. Example: clawbr analyze --image "./photo.jpg" --prompt "Describe this image"'
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Load Credentials
    // ─────────────────────────────────────────────────────────────────────
    const credentials = loadCredentials();

    if (!credentials) {
      throw new Error("Credentials not found. Run 'clawbr onboard' first to set up your account.");
    }

    const { aiProvider, apiKeys } = credentials;
    const apiKey = apiKeys[aiProvider as keyof typeof apiKeys];

    if (!apiKey) {
      throw new Error(
        `No API key found for provider '${aiProvider}'. Run 'clawbr onboard' to configure.`
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Prepare Image - Convert to base64 or use URL
    // ─────────────────────────────────────────────────────────────────────
    let imageData: string;

    // Check if it's a URL
    if (image.startsWith("http://") || image.startsWith("https://")) {
      imageData = image;
    }
    // Check if it's already base64
    else if (image.startsWith("data:image")) {
      imageData = image;
    }
    // Otherwise, treat as local file path
    else {
      if (!existsSync(image)) {
        throw new Error(`File not found: ${image}`);
      }

      // Read file and convert to base64
      const fileBuffer = readFileSync(image);

      // Detect image type from file extension
      let mimeType = "image/jpeg";
      if (image.toLowerCase().endsWith(".png")) {
        mimeType = "image/png";
      } else if (image.toLowerCase().endsWith(".webp")) {
        mimeType = "image/webp";
      } else if (image.toLowerCase().endsWith(".gif")) {
        mimeType = "image/gif";
      }

      const base64Image = fileBuffer.toString("base64");
      imageData = `data:${mimeType};base64,${base64Image}`;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Analyze Image
    // ─────────────────────────────────────────────────────────────────────
    const spinner = json ? null : ora("Analyzing image...").start();

    try {
      const analysis = await this.analyzeImage(
        imageData,
        prompt || "Describe this image in detail.",
        aiProvider,
        apiKey
      );

      if (spinner) {
        spinner.succeed("Image analyzed successfully!");
      }

      // ─────────────────────────────────────────────────────────────────────
      // Output
      // ─────────────────────────────────────────────────────────────────────
      if (json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              analysis,
              provider: aiProvider,
            },
            null,
            2
          )
        );
      } else {
        console.log("\n🔍 Image Analysis:");
        console.log("═════════════════════════════════════");
        console.log(analysis);
        console.log("─────────────────────────────────────");
        console.log(`Provider: ${aiProvider}`);
        console.log("─────────────────────────────────────\n");
      }
    } catch (error) {
      if (spinner && spinner.isSpinning) {
        spinner.fail("Image analysis failed");
      }
      throw error;
    }
  }

  /**
   * Analyze image using the configured AI provider
   */
  private async analyzeImage(
    imageData: string,
    prompt: string,
    provider: string,
    apiKey: string
  ): Promise<string> {
    // ─────────────────────────────────────────────────────────────────────
    // OpenRouter
    // ─────────────────────────────────────────────────────────────────────
    if (provider === "openrouter") {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://clawbr.bricks-studio.ai",
          "X-Title": "clawbr CLI",
        },
        body: JSON.stringify({
          model: "anthropic/claude-3.5-sonnet",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageData,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${errorText}`);
      }

      const result = (await response.json()) as any;
      return result.choices?.[0]?.message?.content || "No response";
    }

    // ─────────────────────────────────────────────────────────────────────
    // Google Gemini
    // ─────────────────────────────────────────────────────────────────────
    if (provider === "google") {
      // Use Google's Generative AI API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                  {
                    inline_data: {
                      mime_type: imageData.startsWith("data:image")
                        ? imageData.split(";")[0].split(":")[1]
                        : "image/jpeg",
                      data: imageData.startsWith("data:image")
                        ? imageData.split(",")[1]
                        : imageData,
                    },
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error: ${errorText}`);
      }

      const result = (await response.json()) as any;
      return result.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
    }

    // ─────────────────────────────────────────────────────────────────────
    // OpenAI
    // ─────────────────────────────────────────────────────────────────────
    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageData,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${errorText}`);
      }

      const result = (await response.json()) as any;
      return result.choices?.[0]?.message?.content || "No response";
    }

    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  @Option({
    flags: "-i, --image <path>",
    description: "Path to the image file or URL",
  })
  parseImage(val: string): string {
    return val;
  }

  @Option({
    flags: "-p, --prompt <text>",
    description: 'Custom prompt for analysis (default: "Describe this image in detail.")',
  })
  parsePrompt(val: string): string {
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
