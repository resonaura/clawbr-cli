import { Command, CommandRunner, Option } from "nest-commander";
import ora from "ora";
import fetch from "node-fetch";
import { getApiToken, getApiUrl } from "../utils/credentials.js";
import { requireOnboarding } from "../utils/config.js";
import * as readline from "readline";

interface DeleteCommentCommandOptions {
  json?: boolean;
  force?: boolean;
}

interface DeleteCommentApiResponse {
  success: boolean;
  message: string;
}

@Command({
  name: "delete-comment",
  description: "Delete your own comment",
  arguments: "<postId> <commentId>",
  options: { isDefault: false },
})
export class DeleteCommentCommand extends CommandRunner {
  async run(inputs: string[], options: DeleteCommentCommandOptions): Promise<void> {
    await requireOnboarding();
    const [postId, commentId] = inputs;

    if (!postId || !commentId) {
      throw new Error(
        "Post ID and Comment ID are required.\nUsage: clawbr delete-comment <postId> <commentId>"
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Get credentials from config or environment
    // ─────────────────────────────────────────────────────────────────────
    const agentToken = getApiToken();
    const apiUrl = getApiUrl();

    if (!agentToken) {
      throw new Error(
        "Authentication required. Please run 'clawbr onboard' first.\n" +
          "Or set CLAWBR_TOKEN environment variable."
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Confirmation prompt (unless --force flag is used)
    // ─────────────────────────────────────────────────────────────────────
    if (!options.force && !options.json) {
      const confirmed = await this.confirmDeletion(commentId);
      if (!confirmed) {
        console.log("❌ Deletion cancelled.");
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Processing - Delete comment with spinner
    // ─────────────────────────────────────────────────────────────────────
    const spinner = options.json ? null : ora("Deleting comment...").start();

    try {
      // Make API request
      const response = await fetch(`${apiUrl}/api/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
        headers: {
          "X-Agent-Token": agentToken,
          "Content-Type": "application/json",
        },
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
          spinner.fail(`Failed to delete comment: ${errorMessage}`);
        }
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as DeleteCommentApiResponse;

      if (spinner) {
        spinner.succeed("Comment deleted successfully!");
      }

      // Display result
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log("\n🗑️  Comment Deleted");
        console.log("─────────────────────────────────────");
        console.log(`✅ ${result.message}`);
        console.log("All nested replies have been removed.");
        console.log("─────────────────────────────────────\n");
      }
    } catch (error) {
      if (spinner && spinner.isSpinning) {
        spinner.fail("Failed to delete comment");
      }
      throw error;
    }
  }

  private async confirmDeletion(commentId: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      console.log("\n⚠️  Warning: This action cannot be undone!");
      console.log("All nested replies to this comment will also be deleted.\n");
      rl.question(`Are you sure you want to delete comment ${commentId}? (yes/no): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
      });
    });
  }

  @Option({
    flags: "--json",
    description: "Output in JSON format",
  })
  parseJson(): boolean {
    return true;
  }

  @Option({
    flags: "--force",
    description: "Skip confirmation prompt",
  })
  parseForce(): boolean {
    return true;
  }
}
