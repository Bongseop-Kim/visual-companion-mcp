import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binaryPath = resolve(repoDir, "visual-companion-mcp");
const scope = process.argv.includes("--project") ? "project" : "user";

if (!existsSync(binaryPath)) {
  console.error(`Missing binary: ${binaryPath}`);
  console.error("Run `bun install` and `bun run compile` first.");
  process.exit(1);
}

const result = spawnSync(
  "claude",
  ["mcp", "add", "visual-companion", "--scope", scope, "--", binaryPath],
  {
    cwd: repoDir,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Installed visual-companion MCP for Claude Code with ${scope} scope.`);
console.log("Restart Claude Code so the session reloads MCP tools.");
console.log("Then verify with: claude mcp list");
