import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binaryPath = resolve(repoDir, "visual-companion-mcp");

if (!existsSync(binaryPath)) {
  console.error(`Missing binary: ${binaryPath}`);
  console.error("Run `bun run compile` first.");
  process.exit(1);
}

const client = new Client({ name: "visual-companion-probe", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: binaryPath,
  cwd: repoDir,
  stderr: "inherit",
});

await client.connect(transport);

const [tools, resources, prompts] = await Promise.all([
  client.listTools(),
  client.listResources(),
  client.listPrompts(),
]);

console.log(JSON.stringify({
  tools: tools.tools.map((tool) => tool.name),
  resources: resources.resources.map((resource) => ({
    name: resource.name,
    uri: resource.uri,
  })),
  prompts: prompts.prompts.map((prompt) => prompt.name),
}, null, 2));

await client.close();
