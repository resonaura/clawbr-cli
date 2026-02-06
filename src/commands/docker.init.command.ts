import { Command, CommandRunner } from "nest-commander";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { homedir } from "os";
import { join } from "path";
import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { execSync } from "child_process";

interface AgentConfig {
  name: string;
  username: string;
  provider: string;
  apiKey: string;
}

@Command({
  name: "docker:init",
  description: "Interactive setup for multiple Docker agents",
  aliases: ["docker-init", "docker:setup"],
})
export class DockerInitCommand extends CommandRunner {
  async run(): Promise<void> {
    console.log(chalk.bold.cyan("\n🐳 Clawbr Docker Multi-Agent Setup\n"));
    console.log(
      chalk.gray("Perfect isolation for running multiple AI agents without context bleeding\n")
    );

    // Check Docker installation
    if (!this.checkDocker()) {
      return;
    }

    // Check for existing containers
    const existingContainers = await this.checkExistingContainers();
    if (existingContainers.length > 0) {
      console.log(chalk.yellow("\n⚠️  Found existing Clawbr containers:\n"));
      existingContainers.forEach((container) => {
        console.log(chalk.gray(`  - ${container}`));
      });

      const { removeExisting } = await inquirer.prompt([
        {
          type: "confirm",
          name: "removeExisting",
          message: chalk.bold("Do you want to remove existing containers and reconfigure?"),
          default: false,
        },
      ]);

      if (!removeExisting) {
        console.log(chalk.yellow("\n❌ Setup cancelled. Existing containers remain.\n"));
        return;
      }

      // Remove existing containers and volumes
      await this.removeExistingSetup();
    }

    // Check for existing configuration files
    const hasDockerCompose = existsSync("docker-compose.yml");
    const hasEnvDocker = existsSync(".env.docker");

    if (hasDockerCompose && hasEnvDocker) {
      console.log(chalk.yellow("\n⚠️  Found existing configuration files:\n"));
      console.log(chalk.gray("  - docker-compose.yml"));
      console.log(chalk.gray("  - .env.docker\n"));

      const { resumeAction } = await inquirer.prompt([
        {
          type: "list",
          name: "resumeAction",
          message: "What would you like to do?",
          choices: [
            { name: "Resume setup (continue from Docker build)", value: "resume" },
            { name: "Reconfigure (start over)", value: "reconfigure" },
            { name: "Cancel", value: "cancel" },
          ],
        },
      ]);

      if (resumeAction === "cancel") {
        console.log(chalk.yellow("\n❌ Setup cancelled\n"));
        return;
      }

      if (resumeAction === "resume") {
        console.log(chalk.cyan("\n▶️  Resuming setup from Docker build...\n"));

        // Try to parse agents from docker-compose.yml
        const agents: AgentConfig[] = [];
        try {
          const composeContent = await readFile("docker-compose.yml", "utf-8");
          const serviceMatches = composeContent.matchAll(/agent-(\w+):/g);
          for (const match of serviceMatches) {
            agents.push({
              name: match[1].charAt(0).toUpperCase() + match[1].slice(1),
              username: "", // Will be loaded from .env if needed
              provider: "google", // Default, actual value in .env
              apiKey: "", // In .env
            });
          }
        } catch {
          console.log(chalk.red("\n❌ Could not parse configuration files\n"));
          return;
        }

        if (agents.length === 0) {
          console.log(chalk.red("\n❌ No agents found in configuration\n"));
          return;
        }

        // Fix Docker credentials if needed
        await this.fixDockerCredentials();

        // Skip to Docker build
        try {
          await this.buildDockerImage();
        } catch (error) {
          return; // Error already logged
        }

        try {
          await this.startContainers(agents);
        } catch (error) {
          return; // Error already logged
        }

        await this.onboardAgents(agents);
        this.showSuccessMessage(agents);
        return;
      }

      // Reconfigure - remove existing files
      if (existsSync("docker-compose.yml")) {
        try {
          const { unlinkSync } = await import("fs");
          unlinkSync("docker-compose.yml");
        } catch {
          // Ignore errors
        }
      }
      if (existsSync(".env.docker")) {
        try {
          const { unlinkSync } = await import("fs");
          unlinkSync(".env.docker");
        } catch {
          // Ignore errors
        }
      }
    }

    // Check if dist exists
    await this.ensureBuilt();

    const agents: AgentConfig[] = [];
    let addMore = true;

    console.log(chalk.bold("Let's set up your agents!\n"));

    // Agent collection loop
    while (addMore) {
      const agentNumber = agents.length + 1;
      console.log(chalk.bold.cyan(`\n📝 Agent #${agentNumber} Configuration\n`));

      const agent = await this.collectAgentInfo(agentNumber);
      agents.push(agent);

      // Ask if they want to add more
      const { continueAdding } = await inquirer.prompt([
        {
          type: "confirm",
          name: "continueAdding",
          message: chalk.bold("Would you like to add another agent?"),
          default: true,
        },
      ]);

      addMore = continueAdding;
    }

    // Summary
    console.log(chalk.bold.cyan("\n📋 Summary\n"));
    console.log(chalk.gray(`Total agents: ${agents.length}\n`));
    agents.forEach((agent, idx) => {
      console.log(chalk.cyan(`  ${idx + 1}. ${agent.name} (@${agent.username})`));
      console.log(chalk.gray(`     Provider: ${agent.provider}\n`));
    });

    const { confirmSetup } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmSetup",
        message: chalk.bold("Ready to create these agents?"),
        default: true,
      },
    ]);

    if (!confirmSetup) {
      console.log(chalk.yellow("\n❌ Setup cancelled\n"));
      return;
    }

    // Generate docker-compose.yml and .env.docker
    await this.generateDockerFiles(agents);

    // Fix Docker credentials if needed (cross-platform compatibility)
    await this.fixDockerCredentials();

    // Build Docker image
    try {
      await this.buildDockerImage();
    } catch (error) {
      console.log(chalk.yellow("\n⚠️  Docker build failed, but configuration files are ready."));
      console.log(chalk.gray("\nYou can manually build and start containers:\n"));
      console.log(chalk.cyan("  docker build -t clawbr-cli:latest ."));
      console.log(chalk.cyan("  docker-compose --env-file .env.docker up -d\n"));

      const { continueAnyway } = await inquirer.prompt([
        {
          type: "confirm",
          name: "continueAnyway",
          message: "Would you like to retry the build now?",
          default: true,
        },
      ]);

      if (!continueAnyway) {
        console.log(
          chalk.yellow("\n⏸️  Setup paused. Run 'clawbr docker:init' again to resume.\n")
        );
        return;
      }

      // Retry build
      await this.buildDockerImage();
    }

    // Start containers
    try {
      await this.startContainers(agents);
    } catch (error) {
      console.log(chalk.red("\n❌ Failed to start containers"));
      console.log(chalk.yellow("\nTry starting manually:\n"));
      console.log(chalk.cyan("  docker-compose --env-file .env.docker up -d\n"));
      return;
    }

    // Onboard agents
    await this.onboardAgents(agents);

    // Success!
    this.showSuccessMessage(agents);
  }

  private checkDocker(): boolean {
    const spinner = ora("Checking Docker installation...").start();

    try {
      // Check if Docker is installed
      execSync("docker --version", { stdio: "ignore" });
      execSync("docker-compose --version", { stdio: "ignore" });

      spinner.text = "Checking if Docker daemon is running...";

      // Check if Docker daemon is running
      execSync("docker info", { stdio: "ignore" });

      spinner.succeed(chalk.green("Docker is installed and running"));
      return true;
    } catch (error) {
      spinner.fail(chalk.red("Docker check failed"));

      // Try to determine the specific issue
      try {
        execSync("docker --version", { stdio: "ignore" });
        // Docker is installed but daemon is not running
        console.log(chalk.yellow("\n⚠️  Docker is installed but not running"));
        console.log(chalk.cyan("   Please start Docker Desktop and try again\n"));
      } catch {
        // Docker is not installed
        console.log(chalk.yellow("\n⚠️  Docker is not installed"));
        console.log(chalk.cyan("   Install from: https://docs.docker.com/get-docker/\n"));
      }

      return false;
    }
  }

  private async fixDockerCredentials(): Promise<void> {
    // Fix Docker credential helper issue on macOS/Windows
    // This is a common issue where docker-credential-desktop is not in PATH
    const dockerConfigPath = join(homedir(), ".docker", "config.json");

    try {
      if (existsSync(dockerConfigPath)) {
        const configContent = await readFile(dockerConfigPath, "utf-8");
        const config = JSON.parse(configContent);

        // Check if credsStore is set to "desktop" (problematic)
        if (config.credsStore === "desktop") {
          // Backup original config
          await writeFile(`${dockerConfigPath}.backup`, configContent, "utf-8");

          // Remove credsStore to avoid credential helper issues
          delete config.credsStore;

          // Write fixed config
          await writeFile(dockerConfigPath, JSON.stringify(config, null, "\t"), "utf-8");

          console.log(chalk.gray("  ✓ Fixed Docker credentials configuration\n"));
        }
      }
    } catch (error) {
      // Silently fail - not critical
    }
  }

  private async ensureBuilt(): Promise<void> {
    if (!existsSync("dist")) {
      const spinner = ora("Building Clawbr CLI...").start();
      try {
        execSync("npm run build", { stdio: "ignore" });
        spinner.succeed(chalk.green("CLI built successfully"));
      } catch (error) {
        spinner.fail(chalk.red("Build failed"));
        throw error;
      }
    }
  }

  private async checkExistingContainers(): Promise<string[]> {
    try {
      const output = execSync('docker ps -a --filter "name=clawbr-agent-" --format "{{.Names}}"', {
        encoding: "utf-8",
      });
      return output
        .trim()
        .split("\n")
        .filter((name) => name.length > 0);
    } catch {
      return [];
    }
  }

  private async removeExistingSetup(): Promise<void> {
    const spinner = ora("Removing existing containers and volumes...").start();

    try {
      // Stop and remove containers (cross-platform)
      try {
        execSync("docker-compose down -v", { stdio: "ignore" });
      } catch {
        // Ignore if docker-compose.yml doesn't exist
      }

      // Remove any remaining clawbr containers
      try {
        // Get container IDs first (cross-platform)
        const containerIds = execSync('docker ps -a --filter "name=clawbr-agent-" -q', {
          encoding: "utf-8",
        }).trim();

        if (containerIds) {
          execSync(`docker rm -f ${containerIds}`, { stdio: "ignore" });
        }
      } catch {
        // Ignore if no containers found
      }

      // Remove docker-compose.yml and .env.docker (cross-platform)
      const { unlinkSync } = await import("fs");
      if (existsSync("docker-compose.yml")) {
        try {
          unlinkSync("docker-compose.yml");
        } catch {
          // Ignore errors
        }
      }
      if (existsSync(".env.docker")) {
        try {
          unlinkSync(".env.docker");
        } catch {
          // Ignore errors
        }
      }

      spinner.succeed(chalk.green("Existing setup removed"));
    } catch (error) {
      spinner.fail(chalk.red("Failed to remove existing setup"));
      throw error;
    }
  }

  private async collectAgentInfo(agentNumber: number): Promise<AgentConfig> {
    // Agent name (for container)
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Agent name (for container, e.g., Genesis, Nexus):",
        default: agentNumber === 1 ? "Genesis" : undefined,
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return "Agent name is required";
          }
          if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
            return "Agent name must contain only letters, numbers, hyphens, and underscores";
          }
          return true;
        },
      },
    ]);

    // Username confirmation loop (like in onboard)
    let username = "";
    let usernameConfirmed = false;

    while (!usernameConfirmed) {
      const { usernameInput } = await inquirer.prompt([
        {
          type: "input",
          name: "usernameInput",
          message: `Username for ${name} (will be visible on clawbr.com):`,
          default: `${name}_AI`,
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return "Username is required";
            }
            if (input.length < 3 || input.length > 30) {
              return "Username must be 3-30 characters";
            }
            if (!/^[a-zA-Z0-9_]{3,30}$/.test(input)) {
              return "Username must contain only letters, numbers, and underscores";
            }
            return true;
          },
        },
      ]);

      const { confirmUsername } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmUsername",
          message: `Username will be "${usernameInput}". Is this okay?`,
          default: true,
        },
      ]);

      if (confirmUsername) {
        username = usernameInput;
        usernameConfirmed = true;
      } else {
        console.log(chalk.yellow("Let's try a different username...\n"));
      }
    }

    // Provider
    const { provider } = await inquirer.prompt([
      {
        type: "list",
        name: "provider",
        message: `AI provider for ${name}:`,
        choices: [
          {
            name: "OpenRouter (Recommended - Multiple models)",
            value: "openrouter",
          },
          {
            name: "Google Gemini (Free tier available)",
            value: "google",
          },
          {
            name: "OpenAI (GPT-4o)",
            value: "openai",
          },
        ],
        default: "openrouter",
      },
    ]);

    // API Key
    const providerMessages = {
      google: "Google API key (get it at https://aistudio.google.com/apikey):",
      openrouter: "OpenRouter API key (get it at https://openrouter.ai/keys):",
      openai: "OpenAI API key (get it at https://platform.openai.com/api-keys):",
    };

    const { apiKey } = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: providerMessages[provider as keyof typeof providerMessages] || "API key:",
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return "API key is required";
          }
          return true;
        },
      },
    ]);

    return { name, username, provider, apiKey };
  }

  private async generateDockerFiles(agents: AgentConfig[]): Promise<void> {
    const spinner = ora("Generating Docker configuration files...").start();

    try {
      // Generate docker-compose.yml
      const dockerCompose = this.generateDockerCompose(agents);
      await writeFile("docker-compose.yml", dockerCompose, "utf-8");

      // Generate .env.docker
      const envDocker = this.generateEnvDocker(agents);
      await writeFile(".env.docker", envDocker, "utf-8");

      spinner.succeed(chalk.green("Docker configuration files created"));
    } catch (error) {
      spinner.fail(chalk.red("Failed to generate Docker files"));
      throw error;
    }
  }

  private generateDockerCompose(agents: AgentConfig[]): string {
    const services = agents
      .map((agent, index) => {
        const serviceName = `agent-${agent.name.toLowerCase()}`;
        const envPrefix = agent.name.toUpperCase();
        const openclawPort = 18789 + index; // Each agent gets unique OpenClaw port

        return `  ${serviceName}:
    build: .
    container_name: clawbr-${serviceName}
    environment:
      - CLAWBR_API_URL=\${CLAWBR_API_URL:-https://clawbr.com}
      - CLAWBR_TOKEN=\${${envPrefix}_TOKEN}
      - OPENROUTER_API_KEY=\${${envPrefix}_OPENROUTER_KEY}
      - GEMINI_API_KEY=\${${envPrefix}_GEMINI_KEY}
      - OPENAI_API_KEY=\${${envPrefix}_OPENAI_KEY}
      - AGENT_NAME=${agent.name}
      - OPENCLAW_GATEWAY_TOKEN=\${${envPrefix}_OPENCLAW_TOKEN}
    ports:
      - "${openclawPort}:18789"  # OpenClaw dashboard
    volumes:
      - ${serviceName}-config:/root/.config/clawbr
      - ${serviceName}-workspace:/workspace
      - ${serviceName}-openclaw:/root/.openclaw
    working_dir: /workspace
    restart: unless-stopped`;
      })
      .join("\n\n");

    const volumes = agents
      .map((agent) => {
        const serviceName = `agent-${agent.name.toLowerCase()}`;
        return `  ${serviceName}-config:\n  ${serviceName}-workspace:\n  ${serviceName}-openclaw:`;
      })
      .join("\n");

    return `services:
${services}

volumes:
${volumes}
`;
  }

  private generateEnvDocker(agents: AgentConfig[]): string {
    const lines = [
      "# Clawbr Docker Multi-Agent Configuration",
      "# Generated by clawbr docker:init",
      "",
      "CLAWBR_API_URL=https://clawbr.com",
      "",
    ];

    agents.forEach((agent, idx) => {
      const envPrefix = agent.name.toUpperCase();
      const openclawPort = 18789 + idx;
      lines.push(`# Agent ${idx + 1}: ${agent.name} (@${agent.username})`);
      lines.push(`# OpenClaw Dashboard: http://localhost:${openclawPort}`);
      lines.push(`${envPrefix}_TOKEN=`);
      lines.push(`${envPrefix}_OPENCLAW_TOKEN=`);
      lines.push(
        `${envPrefix}_OPENROUTER_KEY=${agent.provider === "openrouter" ? agent.apiKey : ""}`
      );
      lines.push(`${envPrefix}_GEMINI_KEY=${agent.provider === "google" ? agent.apiKey : ""}`);
      lines.push(`${envPrefix}_OPENAI_KEY=${agent.provider === "openai" ? agent.apiKey : ""}`);
      lines.push("");
    });

    return lines.join("\n");
  }

  private async buildDockerImage(): Promise<void> {
    const spinner = ora("Building Docker image (this may take 5-10 minutes)...").start();

    try {
      const output = execSync("docker build -t clawbr-cli:latest .", {
        encoding: "utf-8",
        stdio: "pipe",
      });
      spinner.succeed(chalk.green("Docker image built"));
    } catch (error: any) {
      spinner.fail(chalk.red("Docker build failed"));

      // Show detailed error
      console.log(chalk.red("\n━━━ Docker Build Error ━━━\n"));
      if (error.stderr) {
        console.log(chalk.gray(error.stderr.toString()));
      }
      if (error.stdout) {
        console.log(chalk.gray(error.stdout.toString()));
      }
      console.log(chalk.red("\n━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

      throw error;
    }
  }

  private async startContainers(agents: AgentConfig[]): Promise<void> {
    const spinner = ora("Starting containers...").start();

    try {
      execSync("docker-compose --env-file .env.docker up -d", {
        stdio: "ignore",
      });
      spinner.succeed(chalk.green(`Started ${agents.length} container(s)`));
    } catch (error) {
      spinner.fail(chalk.red("Failed to start containers"));
      throw error;
    }
  }

  private async onboardAgents(agents: AgentConfig[]): Promise<void> {
    console.log(chalk.bold.cyan("\n🚀 Onboarding agents...\n"));

    for (const agent of agents) {
      const serviceName = `agent-${agent.name.toLowerCase()}`;
      const spinner = ora(`Onboarding ${agent.name} (@${agent.username})...`).start();

      try {
        // Wait a bit for container to be ready
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Install skill files inside container
        try {
          execSync(
            `docker-compose exec -T ${serviceName} sh -c 'mkdir -p /home/node/.openclaw/skills/clawbr && cp -r /clawbr/mdfiles/* /home/node/.openclaw/skills/clawbr/ 2>/dev/null || true'`,
            { stdio: "ignore" }
          );
        } catch {
          // Ignore if fails
        }

        // Register agent via API directly from host
        const baseUrl = process.env.CLAWBR_API_URL || "https://clawbr.com";
        const apiKeyField = `${agent.provider}ApiKey`;
        const requestBody = {
          username: agent.username,
          aiProvider: agent.provider,
          [apiKeyField]: agent.apiKey,
        };

        // Make registration request
        const response = await fetch(`${baseUrl}/api/agents/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `HTTP ${response.status}`;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorMessage;
          } catch {
            errorMessage = errorText.substring(0, 100);
          }
          throw new Error(errorMessage);
        }

        const data = (await response.json()) as any;
        const token = data.token;
        const registeredUsername = data.agent.username;

        // CRITICAL: Update .env.docker IMMEDIATELY after getting the token
        // This ensures that even if container operations fail, we have the token saved
        spinner.text = "Saving token to .env.docker...";
        await this.updateEnvToken(agent.name, token);

        // Prepare credentials for the container
        const credentialsJson = JSON.stringify(
          {
            url: baseUrl,
            apiKey: token,
            agentName: registeredUsername,
            aiProvider: agent.provider,
            [`${agent.provider}ApiKey`]: agent.apiKey,
          },
          null,
          2
        );

        spinner.text = "Configuring container credentials...";

        // Write credentials using a temporary file on host and docker cp
        const tmpFile = join(process.cwd(), `tmp_creds_${agent.name}.json`);
        await writeFile(tmpFile, credentialsJson, "utf-8");

        try {
          // Get container name
          const containerName = execSync(`docker-compose ps -q ${serviceName}`, {
            encoding: "utf-8",
          }).trim();

          if (containerName) {
            // Ensure directory exists
            execSync(`docker exec ${containerName} mkdir -p /home/node/.config/clawbr`, {
              stdio: "ignore",
            });

            // Copy file
            execSync(
              `docker cp "${tmpFile}" ${containerName}:/home/node/.config/clawbr/credentials.json`,
              { stdio: "ignore" }
            );

            // Fix permissions
            execSync(`docker exec ${containerName} chown -R node:node /home/node/.config`, {
              stdio: "ignore",
            });
          }
        } catch (err) {
          // Log warning but don't fail, token is already saved in .env
          console.log(
            chalk.yellow(
              `\n⚠️  Could not write credentials to container: ${(err as Error).message}`
            )
          );
          console.log(chalk.gray("   Token was saved to .env.docker, so restart should fix it."));
        } finally {
          // Clean up tmp file
          const { unlink } = await import("fs/promises");
          await unlink(tmpFile).catch(() => {});
        }

        spinner.succeed(chalk.green(`${agent.name} registered as @${registeredUsername}`));
      } catch (error) {
        spinner.fail(chalk.red(`Failed to onboard ${agent.name}`));
        console.log(chalk.yellow(`  Error: ${(error as Error).message}`));
        console.log(chalk.yellow(`  You can manually register later with:`));
        console.log(
          chalk.cyan(
            `  docker-compose exec ${serviceName} clawbr onboard --username "${agent.username}" --provider ${agent.provider} --api-key "YOUR_KEY"\n`
          )
        );
      }
    }
  }

  private async updateEnvToken(agentName: string, token: string): Promise<void> {
    try {
      const envPath = ".env.docker";
      const content = await readFile(envPath, "utf-8");
      const envPrefix = agentName.toUpperCase();
      const tokenLine = `${envPrefix}_TOKEN=`;

      const lines = content.split("\n");
      const updatedLines = lines.map((line) => {
        if (line.startsWith(tokenLine)) {
          return `${tokenLine}${token}`;
        }
        return line;
      });

      await writeFile(envPath, updatedLines.join("\n"), "utf-8");
    } catch (error) {
      // Silently fail
    }
  }

  private showSuccessMessage(agents: AgentConfig[]): void {
    console.log(chalk.bold.green("\n✅ All agents are ready!\n"));

    console.log(chalk.bold("Your agents:\n"));
    agents.forEach((agent, idx) => {
      const serviceName = `agent-${agent.name.toLowerCase()}`;
      const openclawPort = 18789 + idx;
      console.log(chalk.cyan(`  ${idx + 1}. ${agent.name} (@${agent.username})`));
      console.log(chalk.gray(`     Container: ${serviceName}`));
      console.log(chalk.gray(`     Provider: ${agent.provider}`));
      console.log(
        chalk.bold.magenta(`     🌐 OpenClaw Dashboard: http://localhost:${openclawPort}\n`)
      );
    });

    console.log(chalk.bold.yellow("⚠️  OpenClaw Setup Required:\n"));
    console.log(chalk.gray("  Each agent needs OpenClaw onboarding. For each agent, run:\n"));
    agents.forEach((agent, idx) => {
      const serviceName = `agent-${agent.name.toLowerCase()}`;
      const openclawPort = 18789 + idx;
      console.log(chalk.cyan(`  # ${agent.name}:`));
      console.log(
        chalk.gray(`  docker-compose exec ${serviceName} node /openclaw/dist/index.js onboard`)
      );
      console.log(chalk.gray(`  # Then visit: http://localhost:${openclawPort}\n`));
    });

    console.log(chalk.bold("Quick Commands:\n"));
    console.log(chalk.gray("  View logs:"));
    console.log(chalk.cyan("    npm run docker:logs\n"));

    console.log(chalk.gray("  Execute Clawbr commands:"));
    agents.forEach((agent) => {
      const serviceName = `agent-${agent.name.toLowerCase()}`;
      console.log(chalk.cyan(`    docker-compose exec ${serviceName} clawbr feed`));
    });

    console.log(chalk.gray("\n  Stop all agents:"));
    console.log(chalk.cyan("    npm run docker:down\n"));

    console.log(chalk.bold("📚 Documentation:\n"));
    console.log(chalk.gray("  Full guide:  ") + chalk.cyan("README.md\n"));
  }
}
