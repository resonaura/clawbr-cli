#!/usr/bin/env node

/**
 * Verification script for clawbr installation logic
 * Tests that all source files exist and can be accessed
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve project root (scripts/ -> project root)
const projectRoot = join(__dirname, "..");
const mdfilesDir = join(projectRoot, "mdfiles");

console.log("🔍 Verifying clawbr installation files...\n");
console.log(`Project root: ${projectRoot}`);
console.log(`Mdfiles directory: ${mdfilesDir}\n`);

// Files that should exist
const rootFiles = ["SKILL.md", "HEARTBEAT.md"];
const referenceFiles = [
  "commands.md",
  "models.md",
  "rate_limits.md",
  "troubleshooting.md",
  "workflows.md",
];

let allPassed = true;

// Check root files
console.log("📄 Checking root files:");
for (const fileName of rootFiles) {
  const filePath = join(mdfilesDir, fileName);
  const exists = existsSync(filePath);

  if (exists) {
    try {
      const content = await readFile(filePath, "utf-8");
      const size = (content.length / 1024).toFixed(2);
      console.log(`  ✅ ${fileName} (${size} KB)`);
    } catch (error) {
      console.log(`  ❌ ${fileName} - Cannot read: ${error.message}`);
      allPassed = false;
    }
  } else {
    console.log(`  ❌ ${fileName} - File not found`);
    allPassed = false;
  }
}

// Check reference files
console.log("\n📚 Checking reference files:");
for (const fileName of referenceFiles) {
  const filePath = join(mdfilesDir, "references", fileName);
  const exists = existsSync(filePath);

  if (exists) {
    try {
      const content = await readFile(filePath, "utf-8");
      const size = (content.length / 1024).toFixed(2);
      console.log(`  ✅ references/${fileName} (${size} KB)`);
    } catch (error) {
      console.log(`  ❌ references/${fileName} - Cannot read: ${error.message}`);
      allPassed = false;
    }
  } else {
    console.log(`  ❌ references/${fileName} - File not found`);
    allPassed = false;
  }
}

// Check compiled installation code
console.log("\n🔨 Checking compiled code:");
const compiledInstallPath = join(projectRoot, "dist", "commands", "install.js");
if (existsSync(compiledInstallPath)) {
  try {
    const content = await readFile(compiledInstallPath, "utf-8");

    // Check for key imports
    const hasFileURLToPath = content.includes("fileURLToPath");
    const hasCopyFile = content.includes("copyFile");
    const hasInstallSkillFiles = content.includes("installSkillFiles");
    const hasInjectIntoOpenClawAgent = content.includes("injectIntoOpenClawAgent");
    const hasInjectIntoOpenClawHeartbeat = content.includes("injectIntoOpenClawHeartbeat");

    console.log(`  ${hasFileURLToPath ? "✅" : "❌"} Contains fileURLToPath import`);
    console.log(`  ${hasCopyFile ? "✅" : "❌"} Contains copyFile import`);
    console.log(`  ${hasInstallSkillFiles ? "✅" : "❌"} Contains installSkillFiles function`);
    console.log(
      `  ${hasInjectIntoOpenClawAgent ? "✅" : "❌"} Contains injectIntoOpenClawAgent function`
    );
    console.log(
      `  ${hasInjectIntoOpenClawHeartbeat ? "✅" : "❌"} Contains injectIntoOpenClawHeartbeat function`
    );

    if (
      !hasFileURLToPath ||
      !hasCopyFile ||
      !hasInstallSkillFiles ||
      !hasInjectIntoOpenClawAgent ||
      !hasInjectIntoOpenClawHeartbeat
    ) {
      allPassed = false;
    }
  } catch (error) {
    console.log(`  ❌ Cannot read compiled install.js: ${error.message}`);
    allPassed = false;
  }
} else {
  console.log("  ⚠️  Compiled install.js not found - run 'npm run build' first");
  allPassed = false;
}

// Check package.json includes mdfiles
console.log("\n📦 Checking package.json:");
const packageJsonPath = join(projectRoot, "package.json");
if (existsSync(packageJsonPath)) {
  try {
    const content = await readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);

    const hasMdfiles = packageJson.files && packageJson.files.includes("mdfiles");
    console.log(`  ${hasMdfiles ? "✅" : "❌"} 'mdfiles' included in files array`);

    if (!hasMdfiles) {
      allPassed = false;
    }
  } catch (error) {
    console.log(`  ❌ Cannot read package.json: ${error.message}`);
    allPassed = false;
  }
} else {
  console.log("  ❌ package.json not found");
  allPassed = false;
}

// Summary
console.log("\n" + "=".repeat(50));
if (allPassed) {
  console.log("✅ All verification checks passed!");
  console.log("\n✨ Ready to publish!");
  process.exit(0);
} else {
  console.log("❌ Some verification checks failed");
  console.log("\n⚠️  Please fix the issues above before publishing");
  process.exit(1);
}
