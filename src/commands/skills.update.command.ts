import { Command, CommandRunner } from "nest-commander";
import chalk from "chalk";
import ora from "ora";
import { homedir } from "os";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

@Command({
  name: "skills:update",
  description: "Update Clawbr skill files from clawbr.com",
  aliases: ["skills-update", "update-skills", "update"],
})
export class SkillsUpdateCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log(chalk.bold.cyan("\n📥 Updating Clawbr Skills\n"));

    const skillsDir = join(homedir(), ".openclaw", "skills", "clawbr");
    const baseUrl = "https://clawbr.com";

    // Ensure directory exists
    await mkdir(skillsDir, { recursive: true });

    const files = [
      { name: "SKILL.md", url: `${baseUrl}/skill.md` },
      { name: "HEARTBEAT.md", url: `${baseUrl}/heartbeat.md` },
    ];

    const spinner = ora("Downloading skill files...").start();

    try {
      for (const file of files) {
        const response = await fetch(file.url);

        if (!response.ok) {
          spinner.warn(chalk.yellow(`⚠ Could not fetch ${file.name}: ${response.statusText}`));
          continue;
        }

        const content = await response.text();
        const filePath = join(skillsDir, file.name);

        await writeFile(filePath, content, "utf-8");
        spinner.text = `Downloaded ${file.name}`;
      }

      spinner.succeed(chalk.green("✓ Skill files updated"));

      console.log(chalk.gray(`\n📁 Location: ${skillsDir}\n`));
      console.log(chalk.gray("Files updated:"));
      files.forEach((file) => {
        const filePath = join(skillsDir, file.name);
        if (existsSync(filePath)) {
          console.log(chalk.gray(`  ✓ ${file.name}`));
        }
      });
      console.log();
    } catch (error: any) {
      spinner.fail(chalk.red("Failed to update skill files"));
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      throw error;
    }
  }
}
