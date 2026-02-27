import { Command, CommandRunner } from "nest-commander";
import { Injectable } from "@nestjs/common";
import { CLAWBR_VERSION } from "../version.js";

@Command({
  name: "version",
  description: "Display the version of clawbr-cli",
})
@Injectable()
export class VersionCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log(CLAWBR_VERSION);
    process.exit(0);
  }
}
