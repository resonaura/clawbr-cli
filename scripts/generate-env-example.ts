import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { envSchema } from "../src/config.js";

const logger = {
  log: (msg: string) => console.log(`[EnvExampleGenerator] ${msg}`),
  error: (msg: string) => console.error(`[EnvExampleGenerator] ${msg}`),
};

// Type definitions for Zod internals
type ZodDef = {
  type?: string;
  typeName?: string;
  innerType?: z.ZodTypeAny;
  defaultValue?: unknown | (() => unknown);
  values?: string[];
};

type ZodSchemaWithInternals = z.ZodTypeAny & {
  _def: ZodDef;
  options?: string[];
};

type UnwrapResult = {
  optional: boolean;
  defaultValue?: string;
  enumValues?: string[];
};

function unwrapType(schema: z.ZodTypeAny): UnwrapResult {
  let optional = false;
  let defaultValue: string | undefined;
  let enumValues: string[] | undefined;
  let current: z.ZodTypeAny | undefined = schema;

  // Keep unwrapping layers
  while (current) {
    const def: ZodDef = (current as ZodSchemaWithInternals)._def;

    if (def.type === "default") {
      optional = true;

      // Extract default value
      const rawDefault =
        typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;

      if (rawDefault !== undefined && rawDefault !== null) {
        if (typeof rawDefault === "object") {
          defaultValue = JSON.stringify(rawDefault);
        } else {
          defaultValue = String(rawDefault);
        }
      }

      // Continue to inner type
      current = def.innerType;
      continue;
    }

    if (def.type === "optional") {
      optional = true;
      // Continue to inner type
      current = def.innerType;
      continue;
    }

    if (def.type === "enum") {
      // Zod enum values can be in 'options' or 'values' depending on version
      const currentWithOptions = current as ZodSchemaWithInternals;
      if (currentWithOptions.options && Array.isArray(currentWithOptions.options)) {
        enumValues = currentWithOptions.options;
      } else if (def.values && Array.isArray(def.values)) {
        enumValues = def.values;
      }
      break;
    }

    // If we reach a base type or unknown type, stop
    break;
  }

  return { optional, defaultValue, enumValues };
}

export async function generateEnvExample(path = ".env.example") {
  const shape = (envSchema as z.ZodObject<z.ZodRawShape>).shape;

  const required: string[] = [];
  const optional: string[] = [];

  for (const [key, schema] of Object.entries(shape)) {
    const { optional: isOptional, defaultValue, enumValues } = unwrapType(schema as z.ZodTypeAny);

    const lines: string[] = [];

    if (enumValues && enumValues.length > 0) {
      lines.push(`# 🔘 one of: ${enumValues.join(", ")}`);
    }

    const exampleValue = defaultValue ?? "";
    lines.push(`${key}=${exampleValue}`);

    const target = isOptional ? optional : required;
    target.push(lines.join("\n"));
  }

  const sections: string[] = [];

  if (required.length > 0) {
    sections.push("## 📌 Required environment variables", ...required, "");
  }

  if (optional.length > 0) {
    sections.push("## 💡 Optional environment variables", ...optional, "");
  }

  const output = sections.join("\n");

  await writeFile(path, output);
  logger.log(`.env.example generated successfully at ${path}`);
}

// Run if called directly
// This script is always run directly via npm script, so we can just execute
generateEnvExample().catch((error) => {
  logger.error(`Failed to generate .env.example: ${error.message}`);
  process.exit(1);
});
