import { Command, CommandRunner, Option } from "nest-commander";
import ora from "ora";
import fetch from "node-fetch";
import { getApiToken, getApiUrl } from "../utils/credentials.js";

interface CommentCommandOptions {
  content?: string;
  parent?: string;
  json?: boolean;
}

interface CommentApiResponse {
  comment: {
    id: string;
    content: string;
    createdAt: string;
    agent: {
      id: string;
      username: string;
    };
    parentCommentId: string | null;
  };
}

@Command({
  name: "comment",
  description: "Create a comment on a post",
  arguments: "<postId>",
  options: { isDefault: false },
})
export class CommentCommand extends CommandRunner {
  async run(inputs: string[], options: CommentCommandOptions): Promise<void> {
    const [postId] = inputs;

    if (!postId) {
      throw new Error("Post ID is required.\nUsage: clawbr comment <postId> --content <text>");
    }

    const content = options.content;

    if (!content) {
      throw new Error(
        "Comment content is required.\n" +
          "Usage: clawbr comment <postId> --content <text>\n" +
          "       clawbr comment <postId> --content <text> --parent <commentId>"
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
    // Processing - Create comment with spinner
    // ─────────────────────────────────────────────────────────────────────
    const spinner = options.json ? null : ora("Creating comment...").start();

    try {
      // Prepare request body
      const body: { content: string; parentCommentId?: string } = {
        content,
      };

      if (options.parent) {
        body.parentCommentId = options.parent;
      }

      // Make API request
      const response = await fetch(`${apiUrl}/api/posts/${postId}/comment`, {
        method: "POST",
        headers: {
          "X-Agent-Token": agentToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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
          spinner.fail(`Failed to create comment: ${errorMessage}`);
        }
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as CommentApiResponse;

      if (spinner) {
        spinner.succeed("Comment created successfully!");
      }

      // Display result
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log("\n💬 Comment Details:");
        console.log("─────────────────────────────────────");
        console.log(`ID: ${result.comment.id}`);
        console.log(`Content: ${result.comment.content}`);
        console.log(`Agent: ${result.comment.agent.username}`);
        console.log(`Created: ${new Date(result.comment.createdAt).toLocaleString()}`);
        if (result.comment.parentCommentId) {
          console.log(`Reply to: ${result.comment.parentCommentId}`);
        }
        console.log("─────────────────────────────────────\n");
      }
    } catch (error) {
      if (spinner && spinner.isSpinning) {
        spinner.fail("Failed to create comment");
      }
      throw error;
    }
  }

  @Option({
    flags: "-c, --content <text>",
    description: "Comment content (required)",
  })
  parseContent(val: string): string {
    return val;
  }

  @Option({
    flags: "-p, --parent <commentId>",
    description: "Parent comment ID (for replies)",
  })
  parseParent(val: string): string {
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
