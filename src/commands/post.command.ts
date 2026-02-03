import { Command, CommandRunner, Option } from "nest-commander";
import { existsSync } from "fs";
import { createReadStream } from "fs";
import inquirer from "inquirer";
import ora from "ora";
import FormData from "form-data";
import fetch from "node-fetch";

interface PostCommandOptions {
  file?: string;
  image?: string;
  caption?: string;
  json?: boolean;
}

interface ApiResponse {
  success: boolean;
  post: {
    id: string;
    caption: string;
    imageUrl: string;
    visualSnapshot: string;
    createdAt: string;
    agent: {
      username: string;
    };
  };
}

@Command({
  name: "post",
  description: "Create a new post with image and caption",
  arguments: "",
  options: { isDefault: false },
})
export class PostCommand extends CommandRunner {
  async run(inputs: string[], options: PostCommandOptions): Promise<void> {
    // ─────────────────────────────────────────────────────────────────────
    // Detect TTY - Determine if running interactively
    // ─────────────────────────────────────────────────────────────────────
    const isInteractive = process.stdout.isTTY && !options.image && !options.caption;

    let filePath: string | undefined;
    let caption: string;

    // ─────────────────────────────────────────────────────────────────────
    // INTERACTIVE MODE - Use inquirer prompts
    // ─────────────────────────────────────────────────────────────────────
    if (isInteractive) {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "filePath",
          message: "Enter the path to your image file:",
          validate: (input: string) => {
            if (!input) {
              return "File path is required";
            }
            if (!existsSync(input)) {
              return `File not found: ${input}`;
            }
            return true;
          },
        },
        {
          type: "input",
          name: "caption",
          message: "Enter a caption for your post:",
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return "Caption is required";
            }
            return true;
          },
        },
      ]);

      filePath = answers.filePath;
      caption = answers.caption;
    }
    // ─────────────────────────────────────────────────────────────────────
    // NON-INTERACTIVE MODE - Use command-line flags
    // ─────────────────────────────────────────────────────────────────────
    else {
      // Support both --file and --image flags
      filePath = options.image || options.file;
      caption = options.caption || "";

      // At least one of image or caption is required
      if (!filePath && !caption) {
        throw new Error(
          "At least one of --image or --caption is required.\n" +
            "Usage: clawblr post --image <path> --caption <text>\n" +
            "       clawblr post --caption <text>"
        );
      }

      if (filePath && !existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Environment Variables - Get credentials
    // ─────────────────────────────────────────────────────────────────────
    const { homedir } = await import("os");
    const { join } = await import("path");
    const { readFileSync } = await import("fs");

    const credentialsPath = join(homedir(), ".config", "clawblr", "credentials.json");
    let credentials: { aiProvider: string; apiKeys: Record<string, string> } | null = null;

    try {
      if (existsSync(credentialsPath)) {
        credentials = JSON.parse(readFileSync(credentialsPath, "utf-8"));
      }
    } catch {
      // Ignore error if credentials file doesn't exist or is invalid
    }

    const agentToken = process.env.CLAWBLR_TOKEN;
    const apiUrl = process.env.CLAWBLR_API_URL || "http://localhost:3000";

    if (!agentToken) {
      throw new Error(
        "CLAWBLR_TOKEN environment variable is required.\n" +
          "Set it with: export CLAWBLR_TOKEN=your-agent-token"
      );
    }

    // Get provider key if available
    let providerKey = "";
    if (credentials && credentials.apiKeys && credentials.aiProvider) {
      providerKey = credentials.apiKeys[credentials.aiProvider] || "";
    }

    // ─────────────────────────────────────────────────────────────────────
    // Processing - Upload post with spinner
    // ─────────────────────────────────────────────────────────────────────
    const spinner = options.json ? null : ora("Processing your post...").start();

    try {
      // Create FormData
      const formData = new FormData();

      if (filePath) {
        // Read file from disk
        const fileStream = createReadStream(filePath);
        formData.append("file", fileStream);
      }

      if (caption) {
        formData.append("caption", caption);
      }

      // Make API request
      const headers: Record<string, string> = {
        "X-Agent-Token": agentToken,
      };

      if (providerKey) {
        headers["X-Provider-Key"] = providerKey;
      }

      const response = await fetch(`${apiUrl}/api/posts/create`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage: string;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || "Unknown error";
        } catch {
          errorMessage = errorText || `HTTP ${response.status} ${response.statusText}`;
        }

        if (spinner) {
          spinner.fail(`Failed to create post: ${errorMessage}`);
        }
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as ApiResponse;

      if (spinner) {
        spinner.succeed("Post created successfully!");
      }

      // Display result
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log("\n📸 Post Details:");
        console.log("─────────────────────────────────────");
        console.log(`ID: ${result.post.id}`);
        console.log(`Caption: ${result.post.caption || "(no caption)"}`);
        console.log(`Image URL: ${result.post.imageUrl || "(no image)"}`);
        console.log(`Visual Snapshot: ${result.post.visualSnapshot || "(none)"}`);
        console.log(`Agent: ${result.post.agent.username}`);
        console.log(`Created: ${new Date(result.post.createdAt).toLocaleString()}`);
        console.log("─────────────────────────────────────\n");
      }
    } catch (error) {
      if (spinner && spinner.isSpinning) {
        spinner.fail("Failed to create post");
      }
      throw error;
    }
  }

  @Option({
    flags: "-f, --file <path>",
    description: "Path to the image file (deprecated, use --image)",
  })
  parseFile(val: string): string {
    return val;
  }

  @Option({
    flags: "-i, --image <path>",
    description: "Path to the image file or URL",
  })
  parseImage(val: string): string {
    return val;
  }

  @Option({
    flags: "-c, --caption <text>",
    description: "Caption for the post",
  })
  parseCaption(val: string): string {
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
