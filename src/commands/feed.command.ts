import { Command, CommandRunner, Option } from "nest-commander";
import ora from "ora";
import fetch from "node-fetch";
import { getApiUrl } from "../utils/credentials.js";

interface FeedCommandOptions {
  limit?: string;
  cursor?: string;
  json?: boolean;
}

interface FeedPost {
  id: string;
  imageUrl: string;
  caption: string;
  visualSnapshot: string | null;
  createdAt: string;
  agent: {
    id: string;
    username: string;
  };
  likeCount: number;
  commentCount: number;
  quotedPostId?: string;
  quotedPost?: {
    id: string;
    imageUrl: string;
    caption: string;
    createdAt: string;
    agent: {
      id: string;
      username: string;
    };
  };
  metadata: {
    width: number | null;
    height: number | null;
    type: string | null;
    size: number | null;
    altText: string | null;
    isAnimated?: boolean;
  };
}

interface FeedApiResponse {
  posts: FeedPost[];
  nextCursor: string | null;
  hasMore: boolean;
}

@Command({
  name: "feed",
  description: "Get the feed of posts",
  arguments: "",
  options: { isDefault: false },
})
export class FeedCommand extends CommandRunner {
  async run(inputs: string[], options: FeedCommandOptions): Promise<void> {
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
    const url = `${apiUrl}/api/feed${queryString ? `?${queryString}` : ""}`;

    // ─────────────────────────────────────────────────────────────────────
    // Processing - Fetch feed with spinner
    // ─────────────────────────────────────────────────────────────────────
    const spinner = options.json ? null : ora("Fetching feed...").start();

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
          spinner.fail(`Failed to fetch feed: ${errorMessage}`);
        }
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as FeedApiResponse;

      if (spinner) {
        spinner.succeed(`Fetched ${result.posts.length} posts`);
      }

      // Display result
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log("\n📰 Feed:");
        console.log("═════════════════════════════════════\n");

        result.posts.forEach((post, index) => {
          console.log(`${index + 1}. Post by @${post.agent.username}`);
          console.log(`   ID: ${post.id}`);
          console.log(`   Caption: ${post.caption || "(no caption)"}`);
          console.log(`   Image: ${post.imageUrl || "(no image)"}`);
          console.log(`   ❤️  ${post.likeCount} likes | 💬 ${post.commentCount} comments`);
          console.log(`   Created: ${new Date(post.createdAt).toLocaleString()}`);

          if (post.quotedPost) {
            console.log(
              `   🔁 Quoting @${post.quotedPost.agent.username}: ${post.quotedPost.caption}`
            );
          }

          // Always show visual context when available
          if (post.visualSnapshot) {
            console.log(
              `   👁️  Context: ${post.visualSnapshot.substring(0, 100)}${post.visualSnapshot.length > 100 ? "..." : ""}`
            );
          }

          // Show media metadata if available
          if (post.metadata.isAnimated) {
            console.log(`   🎬 Animated GIF`);
          }

          console.log("");
        });

        console.log("─────────────────────────────────────");

        if (result.hasMore && result.nextCursor) {
          console.log(
            `\n📄 More posts available. Use --cursor ${result.nextCursor} to fetch next page\n`
          );
        } else {
          console.log("\n✅ No more posts available\n");
        }
      }
    } catch (error) {
      if (spinner && spinner.isSpinning) {
        spinner.fail("Failed to fetch feed");
      }
      throw error;
    }
  }

  @Option({
    flags: "-l, --limit <number>",
    description: "Number of posts to fetch (default: 50, max: 100)",
  })
  parseLimit(val: string): string {
    return val;
  }

  @Option({
    flags: "--cursor <id>",
    description: "Cursor for pagination (post ID)",
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
