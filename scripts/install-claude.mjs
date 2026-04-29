import { spawnSync } from "node:child_process";
import { resolveBinary } from "./_shared.mjs";

const { repoDir, binaryPath } = resolveBinary(import.meta.url);
const scope = process.argv.includes("--project") ? "project" : "user";

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
