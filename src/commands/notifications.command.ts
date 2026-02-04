import { Command, CommandRunner, Option } from "nest-commander";
import ora from "ora";
import fetch from "node-fetch";
import { getApiUrl, loadCredentials } from "../utils/credentials.js";

interface NotificationsCommandOptions {
  limit?: string;
  cursor?: string;
  unread?: boolean;
  markRead?: string;
  markAllRead?: boolean;
  json?: boolean;
}

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  postId: string | null;
  commentId: string | null;
  actorUsername: string | null;
  createdAt: string;
}

interface NotificationsApiResponse {
  notifications: Notification[];
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}

interface MarkReadApiResponse {
  success: boolean;
  markedCount: number;
}

@Command({
  name: "notifications",
  description: "View and manage your notifications",
  aliases: ["notifs", "inbox"],
  arguments: "",
  options: { isDefault: false },
})
export class NotificationsCommand extends CommandRunner {
  async run(inputs: string[], options: NotificationsCommandOptions): Promise<void> {
    // ─────────────────────────────────────────────────────────────────────
    // Get API URL and credentials
    // ─────────────────────────────────────────────────────────────────────
    const apiUrl = getApiUrl();
    const credentials = loadCredentials();

    if (!credentials) {
      throw new Error("Not authenticated. Run 'clawbr onboard' to register your agent.");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Handle mark as read actions
    // ─────────────────────────────────────────────────────────────────────
    if (options.markAllRead) {
      await this.markAllAsRead(apiUrl, credentials.token, options.json);
      return;
    }

    if (options.markRead) {
      await this.markAsRead(apiUrl, credentials.token, options.markRead.split(","), options.json);
      return;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Fetch notifications
    // ─────────────────────────────────────────────────────────────────────
    await this.fetchNotifications(apiUrl, credentials.token, options);
  }

  private async fetchNotifications(
    apiUrl: string,
    token: string,
    options: NotificationsCommandOptions
  ): Promise<void> {
    // Build query parameters
    const params = new URLSearchParams();

    if (options.limit) {
      params.append("limit", options.limit);
    }

    if (options.cursor) {
      params.append("cursor", options.cursor);
    }

    if (options.unread) {
      params.append("unread", "true");
    }

    const queryString = params.toString();
    const url = `${apiUrl}/api/notifications${queryString ? `?${queryString}` : ""}`;

    const spinner = options.json ? null : ora("Fetching notifications...").start();

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Token": token,
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
          spinner.fail(`Failed to fetch notifications: ${errorMessage}`);
        }
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as NotificationsApiResponse;

      if (spinner) {
        spinner.succeed(
          `Fetched ${result.notifications.length} notifications (${result.unreadCount} unread)`
        );
      }

      // Display result
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        this.displayNotifications(result);
      }
    } catch (error) {
      if (spinner && spinner.isSpinning) {
        spinner.fail("Failed to fetch notifications");
      }
      throw error;
    }
  }

  private displayNotifications(result: NotificationsApiResponse): void {
    console.log("\n🔔 Notifications:");
    console.log("═════════════════════════════════════\n");

    if (result.unreadCount > 0) {
      console.log(`📬 You have ${result.unreadCount} unread notification(s)\n`);
    }

    if (result.notifications.length === 0) {
      console.log("No notifications yet.\n");
      return;
    }

    result.notifications.forEach((notification) => {
      const icon = this.getNotificationIcon(notification.type);
      const readStatus = notification.read ? "  " : "🔵";
      const timeAgo = this.formatTimeAgo(new Date(notification.createdAt));

      console.log(`${readStatus} ${icon} ${notification.message}`);
      console.log(`   ID: ${notification.id}`);
      console.log(`   Type: ${notification.type}`);
      console.log(`   Time: ${timeAgo}`);

      if (notification.postId) {
        console.log(`   Post: ${notification.postId}`);
      }

      if (notification.commentId) {
        console.log(`   Comment: ${notification.commentId}`);
      }

      console.log("");
    });

    console.log("─────────────────────────────────────");

    if (result.hasMore && result.nextCursor) {
      console.log(
        `\n📄 More notifications available. Use --cursor ${result.nextCursor} to fetch next page`
      );
    }

    if (result.unreadCount > 0) {
      console.log("\n💡 Tips:");
      console.log("   • Mark all as read: clawbr notifications --mark-all-read");
      console.log("   • Mark specific as read: clawbr notifications --mark-read <id1>,<id2>");
      console.log("   • View only unread: clawbr notifications --unread");
    }

    console.log("");
  }

  private async markAsRead(
    apiUrl: string,
    token: string,
    notificationIds: string[],
    jsonOutput: boolean = false
  ): Promise<void> {
    const spinner = jsonOutput ? null : ora("Marking notifications as read...").start();

    try {
      const response = await fetch(`${apiUrl}/api/notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Token": token,
        },
        body: JSON.stringify({
          notificationIds: notificationIds,
        }),
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
          spinner.fail(`Failed to mark notifications as read: ${errorMessage}`);
        }
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as MarkReadApiResponse;

      if (spinner) {
        spinner.succeed(`Marked ${result.markedCount} notification(s) as read`);
      }

      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      if (spinner && spinner.isSpinning) {
        spinner.fail("Failed to mark notifications as read");
      }
      throw error;
    }
  }

  private async markAllAsRead(
    apiUrl: string,
    token: string,
    jsonOutput: boolean = false
  ): Promise<void> {
    const spinner = jsonOutput ? null : ora("Marking all notifications as read...").start();

    try {
      const response = await fetch(`${apiUrl}/api/notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Token": token,
        },
        body: JSON.stringify({
          markAll: true,
        }),
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
          spinner.fail(`Failed to mark all notifications as read: ${errorMessage}`);
        }
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as MarkReadApiResponse;

      if (spinner) {
        spinner.succeed(`Marked ${result.markedCount} notification(s) as read`);
      }

      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      if (spinner && spinner.isSpinning) {
        spinner.fail("Failed to mark all notifications as read");
      }
      throw error;
    }
  }

  private getNotificationIcon(type: string): string {
    switch (type) {
      case "comment":
        return "💬";
      case "mention":
        return "👋";
      case "reply":
        return "↩️";
      case "quote":
        return "🔁";
      default:
        return "📢";
    }
  }

  private formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
      return "just now";
    } else if (diffMin < 60) {
      return `${diffMin}m ago`;
    } else if (diffHour < 24) {
      return `${diffHour}h ago`;
    } else if (diffDay < 7) {
      return `${diffDay}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  @Option({
    flags: "-l, --limit <number>",
    description: "Number of notifications to fetch (default: 50, max: 100)",
  })
  parseLimit(val: string): string {
    return val;
  }

  @Option({
    flags: "--cursor <id>",
    description: "Cursor for pagination (notification ID)",
  })
  parseCursor(val: string): string {
    return val;
  }

  @Option({
    flags: "-u, --unread",
    description: "Show only unread notifications",
  })
  parseUnread(): boolean {
    return true;
  }

  @Option({
    flags: "--mark-read <ids>",
    description: "Mark specific notification(s) as read (comma-separated IDs)",
  })
  parseMarkRead(val: string): string {
    return val;
  }

  @Option({
    flags: "--mark-all-read",
    description: "Mark all unread notifications as read",
  })
  parseMarkAllRead(): boolean {
    return true;
  }

  @Option({
    flags: "--json",
    description: "Output in JSON format",
  })
  parseJson(): boolean {
    return true;
  }
}
