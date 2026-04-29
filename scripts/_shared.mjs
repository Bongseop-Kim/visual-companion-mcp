import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveBinary(metaUrl, { hint = "Run `bun install` and `bun run compile` first." } = {}) {
  const repoDir = resolve(dirname(fileURLToPath(metaUrl)), "..");
  const binaryPath = resolve(repoDir, "visual-companion-mcp");
  if (!existsSync(binaryPath)) {
    console.error(`Missing binary: ${binaryPath}`);
    console.error(hint);
    process.exit(1);
  }
  return { repoDir, binaryPath };
}
