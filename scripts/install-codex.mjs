import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { resolveBinary } from "./_shared.mjs";

const { repoDir, binaryPath } = resolveBinary(import.meta.url);
const codexHome = process.env.CODEX_HOME || resolve(homedir(), ".codex");
const configPath = resolve(codexHome, "config.toml");

mkdirSync(codexHome, { recursive: true });

const existing = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
const nextBlock = `[mcp_servers.visual-companion]
command = ${tomlString(binaryPath)}
cwd = ${tomlString(repoDir)}
enabled = true
required = true
startup_timeout_sec = 5
tool_timeout_sec = 120
enabled_tools = [
  "start_session",
  "show_screen",
  "show_options",
  "show_cards",
  "show_choice_grid",
  "show_comparison",
  "show_wireframe",
  "read_events",
  "wait_for_selection",
  "read_current_wireframe_summary",
  "request_user_input",
  "stop_session",
]
`;

const nextConfig = replaceTomlSection(existing, "mcp_servers.visual-companion", nextBlock);
if (existing && existing !== nextConfig) {
  writeFileSync(`${configPath}.bak`, existing, "utf8");
}
writeFileSync(configPath, nextConfig, "utf8");

console.log(`Installed visual-companion MCP config: ${configPath}`);
console.log("Restart Codex so the session reloads MCP tools.");
console.log("Then verify with: codex mcp list");

function replaceTomlSection(source, sectionName, block) {
  const lines = source.replace(/\s+$/u, "").split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === `[${sectionName}]`);
  if (start === -1) {
    const prefix = source.trim().length > 0 ? `${source.replace(/\s+$/u, "")}\n\n` : "";
    return `${prefix}${block}`;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+\]\s*$/u.test(lines[index])) {
      end = index;
      break;
    }
  }

  const before = lines.slice(0, start).join("\n").replace(/\s+$/u, "");
  const after = lines.slice(end).join("\n").replace(/^\s+/u, "");
  return [before, block.trimEnd(), after].filter(Boolean).join("\n\n") + "\n";
}

function tomlString(value) {
  return JSON.stringify(value);
}
