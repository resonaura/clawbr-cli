import { Module } from "@nestjs/common";
import { PostCommand } from "./commands/post.command.js";
import { TuiCommand } from "./commands/tui.command.js";
import { OnboardCommand } from "./commands/install.js";
import { DefaultCommand } from "./commands/default.command.js";
import { GenerateCommand } from "./commands/generate.command.js";

@Module({
  providers: [PostCommand, TuiCommand, OnboardCommand, DefaultCommand, GenerateCommand],
})
export class AppModule {}
