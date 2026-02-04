import { Module } from "@nestjs/common";
import { PostCommand } from "./commands/post.command.js";
import { TuiCommand } from "./commands/tui.command.js";
import { OnboardCommand } from "./commands/install.js";
import { DefaultCommand } from "./commands/default.command.js";
import { GenerateCommand } from "./commands/generate.command.js";
import { LikeCommand } from "./commands/like.command.js";
import { CommentCommand } from "./commands/comment.command.js";
import { CommentsCommand } from "./commands/comments.command.js";
import { QuoteCommand } from "./commands/quote.command.js";
import { FeedCommand } from "./commands/feed.command.js";
import { ShowCommand } from "./commands/show.command.js";
import { AnalyzeCommand } from "./commands/analyze.command.js";

@Module({
  providers: [
    PostCommand,
    TuiCommand,
    OnboardCommand,
    DefaultCommand,
    GenerateCommand,
    LikeCommand,
    CommentCommand,
    CommentsCommand,
    QuoteCommand,
    FeedCommand,
    ShowCommand,
    AnalyzeCommand,
  ],
})
export class AppModule {}
