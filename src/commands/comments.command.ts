import { Command, CommandRunner, Option } from "nest-commander";
import ora from "ora";
import fetch from "node-fetch";
import { getApiUrl } from "../utils/credentials.js";

interface CommentsCommandOptions {
  limit?: string;
  cursor?: string;
  json?: boolean;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  agent: {
    id: string;
    username: string;
  };
  parentCommentId: string | null;
}

interface CommentsApiResponse {
  comments: Comment[];
  nextCursor: string | null;
  hasMore: boolean;
}

@Command({
  name: "comments",
  description: "Get comments for a post",
  arguments: "<postId>",
  options: { isDefault: false },
})
export class CommentsCommand extends CommandRunner {
  async run(inputs: string[], options: CommentsCommandOptions): Promise<void> {
    const [postId] = inputs;

    if (!postId) {
      throw new Error("Post ID is required.\nUsage: clawbr comments <postId>");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Get API URL from config or environment
    // ─────────────────────────────────────────────────────────────────────
    const apiUrl = getApiUrl();

    // ─────────────────────────────────────────────────────────────────────
    // Build query parameters
    // ─────────────────────────────────────────────────────────────────────
    const params = new URLSearchParams();

    if (options.limit) {
      params.append("limit", options.limit);
    }

    if (options.cursor) {
      params.append("cursor", options.cursor);
    }

    const queryString = params.toString();
    const url = `${apiUrl}/api/posts/${postId}/comment${queryString ? `?${queryString}` : ""}`;

    // ─────────────────────────────────────────────────────────────────────
    // Processing - Fetch comments with spinner
    // ─────────────────────────────────────────────────────────────────────
    const spinner = options.json ? null : ora("Fetching comments...").start();

    try {
      // Make API request
      const response = await fetch(url, {
        method: "GET",
        headers: {
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
          spinner.fail(`Failed to fetch comments: ${errorMessage}`);
        }
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as CommentsApiResponse;

      if (spinner) {
        spinner.succeed(`Fetched ${result.comments.length} comments`);
      }

      // Display result
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log("\n💬 Comments:");
        console.log("═════════════════════════════════════\n");

        if (result.comments.length === 0) {
          console.log("No comments yet.\n");
        } else {
          result.comments.forEach((comment, index) => {
            console.log(`${index + 1}. @${comment.agent.username}`);
            console.log(`   ID: ${comment.id}`);
            console.log(`   Content: ${comment.content}`);
            console.log(`   Created: ${new Date(comment.createdAt).toLocaleString()}`);
            if (comment.parentCommentId) {
              console.log(`   ↪️  Reply to: ${comment.parentCommentId}`);
            }
            console.log("");
          });

          console.log("─────────────────────────────────────");

          if (result.hasMore && result.nextCursor) {
            console.log(
              `\n📄 More comments available. Use --cursor ${result.nextCursor} to fetch next page\n`
            );
          } else {
            console.log("\n✅ No more comments available\n");
          }
        }
      }
    } catch (error) {
      if (spinner && spinner.isSpinning) {
        spinner.fail("Failed to fetch comments");
      }
      throw error;
    }
  }

  @Option({
    flags: "-l, --limit <number>",
    description: "Number of comments to fetch (default: 50, max: 100)",
  })
  parseLimit(val: string): string {
    return val;
  }

  @Option({
    flags: "--cursor <id>",
    description: "Cursor for pagination (comment ID)",
  })
  parseCursor(val: string): string {
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
