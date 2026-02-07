import { Command, CommandRunner, Option } from "nest-commander";
import chalk from "chalk";
import { loadCredentials } from "../utils/credentials.js";
import { IMAGE_MODELS, getProviderModels } from "../config/image-models.js";
import { requireOnboarding } from "../utils/config.js";

interface ModelsCommandOptions {
  provider?: string;
  json?: boolean;
}

@Command({
  name: "models",
  description: "List available image generation models",
  aliases: ["list-models"],
  arguments: "",
  options: { isDefault: false },
})
export class ModelsCommand extends CommandRunner {
  async run(inputs: string[], options: ModelsCommandOptions): Promise<void> {
    await requireOnboarding();
    const { provider, json = false } = options;

    // ─────────────────────────────────────────────────────────────────────
    // Load credentials to get current provider
    // ─────────────────────────────────────────────────────────────────────
    const credentials = loadCredentials();
    const currentProvider = credentials?.aiProvider || null;

    // ─────────────────────────────────────────────────────────────────────
    // Determine which providers to show
    // ─────────────────────────────────────────────────────────────────────
    const providersToShow = provider ? [provider] : Object.keys(IMAGE_MODELS);

    // Validate provider if specified
    if (provider && !IMAGE_MODELS[provider]) {
      console.log(
        chalk.red(
          `❌ Unknown provider: ${provider}\n\nAvailable providers: ${Object.keys(IMAGE_MODELS).join(", ")}`
        )
      );
      process.exit(1);
    }

    // ─────────────────────────────────────────────────────────────────────
    // JSON output
    // ─────────────────────────────────────────────────────────────────────
    if (json) {
      const result: Record<string, any> = {};

      for (const prov of providersToShow) {
        const models = getProviderModels(prov);
        const config = IMAGE_MODELS[prov];

        result[prov] = {
          primary: config.primary,
          fallbacks: config.fallbacks,
          models: models.map((m) => ({
            id: m.id,
            name: m.name,
            supportsReferenceImage: m.supportsReferenceImage,
            supportsCustomSize: m.supportsCustomSize,
            description: m.description,
          })),
        };
      }

      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Human-readable output
    // ─────────────────────────────────────────────────────────────────────
    console.log();
    console.log(chalk.bold.cyan("🎨 Image Generation Models"));
    console.log();

    if (currentProvider) {
      console.log(chalk.gray("  Your current provider: ") + chalk.yellow.bold(currentProvider));
      console.log();
    }

    for (const prov of providersToShow) {
      const models = getProviderModels(prov);
      const config = IMAGE_MODELS[prov];
      const isCurrent = prov === currentProvider;

      // Provider header
      console.log(
        chalk.bold(isCurrent ? chalk.green(`📌 ${prov}`) : chalk.white(prov)) +
          (isCurrent ? chalk.gray(" (active)") : "")
      );
      console.log(chalk.gray("─".repeat(50)));
      console.log();

      // Primary model
      console.log(chalk.gray("  Default: ") + chalk.cyan(config.primary));
      console.log();

      // Models list
      models.forEach((model, index) => {
        const isPrimary = model.id === config.primary;
        const isFallback = config.fallbacks.includes(model.id);

        // Model name
        let modelLine = "  ";
        if (isPrimary) {
          modelLine += chalk.green("✓ ");
        } else if (isFallback) {
          modelLine += chalk.yellow("→ ");
        } else {
          modelLine += "  ";
        }
        modelLine += chalk.white.bold(model.id);

        console.log(modelLine);

        // Model info
        console.log(chalk.gray(`    ${model.name}`));
        if (model.description) {
          console.log(chalk.dim(`    ${model.description}`));
        }

        // Capabilities
        const capabilities = [];
        if (model.supportsReferenceImage) {
          capabilities.push(chalk.green("✓ Reference images"));
        } else {
          capabilities.push(chalk.red("✗ No reference images"));
        }
        if (model.supportsCustomSize) {
          capabilities.push(chalk.green("✓ Custom sizes"));
        }

        console.log(`    ${capabilities.join(" • ")}`);

        if (index < models.length - 1) {
          console.log();
        }
      });

      console.log();
      console.log();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Usage tips
    // ─────────────────────────────────────────────────────────────────────
    console.log(chalk.yellow("💡 Usage Tips:"));
    console.log();
    console.log(
      chalk.gray("  • Use ") + chalk.cyan("--model") + chalk.gray(" flag to specify a model:")
    );
    console.log(
      chalk.dim(
        '    npx clawbr@latest generate --prompt "..." --model "model-id" --output "./image.png"'
      )
    );
    console.log();
    console.log(
      chalk.gray("  • Models marked with ") +
        chalk.green("✓ Reference images") +
        chalk.gray(" support ") +
        chalk.cyan("--source-image")
    );
    console.log(
      chalk.dim(
        '    npx clawbr@latest generate --prompt "..." --source-image "./ref.png" --model "..." --output "./out.png"'
      )
    );
    console.log();
    console.log(
      chalk.gray("  • Use ") +
        chalk.cyan("--provider <name>") +
        chalk.gray(" to filter by provider")
    );
    console.log(chalk.dim("    npx clawbr@latest models --provider openrouter"));
    console.log();
    console.log(
      chalk.gray("  • Use ") + chalk.cyan("--json") + chalk.gray(" for machine-readable output")
    );
    console.log(chalk.dim("    npx clawbr@latest models --json"));
    console.log();

    // Legend
    console.log(chalk.bold("Legend:"));
    console.log(chalk.green("  ✓") + chalk.gray(" = Default/primary model for provider"));
    console.log(chalk.yellow("  →") + chalk.gray(" = Fallback model (auto-used if primary fails)"));
    console.log();
  }

  @Option({
    flags: "-p, --provider <name>",
    description: "Filter by provider (openrouter, openai, google)",
  })
  parseProvider(val: string): string {
    return val.toLowerCase();
  }

  @Option({
    flags: "--json",
    description: "Output in JSON format",
  })
  parseJson(): boolean {
    return true;
  }
}
