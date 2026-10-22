import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const required = ["LICENSE", "tsconfig.json", ".oxlintrc.json", ".oxfmtrc.json"];

const missing = required.filter((file) => !existsSync(join(root, file)));

if (missing.length > 0) {
  for (const file of missing) {
    console.error(`Missing: ${file}`);
  }
  process.exit(1);
}

console.log("All required files present");
