#!/usr/bin/env bun
import { runStdioServer } from "./mcp-server";

runStdioServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
