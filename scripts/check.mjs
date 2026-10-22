import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

const required = [
  "extensions/tidewatch/index.ts",
  "extensions/tidewatch/lib/calls.ts",
  "extensions/tidewatch/lib/dock.ts",
  "extensions/tidewatch/lib/format.ts",
  "extensions/tidewatch/lib/history.ts",
  "extensions/tidewatch/lib/render.ts",
  "extensions/tidewatch/lib/widget.ts",
  "test/calls.test.ts",
  "test/dock.test.ts",
  "test/format.test.ts",
  "test/history.test.ts",
  "test/render.test.ts",
  "README.md",
  "LICENSE",
  "tsconfig.json",
  ".oxlintrc.json",
  ".oxfmtrc.json",
];

const missing = required.filter((file) => !existsSync(join(root, file)));

if (missing.length > 0) {
  for (const file of missing) {
    console.error(`Missing: ${file}`);
  }
  process.exit(1);
}

console.log("All required files present");
