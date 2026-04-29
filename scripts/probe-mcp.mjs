import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolveBinary } from "./_shared.mjs";

const { repoDir, binaryPath } = resolveBinary(import.meta.url, {
  hint: "Run `bun run compile` first.",
});

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
