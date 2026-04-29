import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SessionManager } from "./session-manager";
import {
  readEventsInputSchema,
  readEventsOutputSchema,
  showScreenInputSchema,
  showScreenOutputSchema,
  startSessionInputSchema,
  startSessionOutputSchema,
  stopSessionInputSchema,
  stopSessionOutputSchema,
  waitForSelectionInputSchema,
  waitForSelectionOutputSchema,
} from "./schemas";

export function createMcpServer(manager = new SessionManager()): McpServer {
  const server = new McpServer({
    name: "visual-companion-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "start_session",
    {
      title: "Start visual companion session",
      description: "Start a local browser session and return its URL and working directory.",
      inputSchema: startSessionInputSchema,
      outputSchema: startSessionOutputSchema,
    },
    async (args) => toToolResult(await manager.startSession(args)),
  );

  server.registerTool(
    "show_screen",
    {
      title: "Show HTML screen",
      description: "Render an HTML document or fragment in the user's local browser session.",
      inputSchema: showScreenInputSchema,
      outputSchema: showScreenOutputSchema,
    },
    async (args) => toToolResult(await manager.showScreen(args)),
  );

  server.registerTool(
    "read_events",
    {
      title: "Read browser events",
      description: "Read JSONL click events recorded for a session, optionally clearing them.",
      inputSchema: readEventsInputSchema,
      outputSchema: readEventsOutputSchema,
    },
    async (args) => toToolResult({ events: await manager.readEvents(args) }),
  );

  server.registerTool(
    "wait_for_selection",
    {
      title: "Wait for browser selection",
      description: "Wait until a browser click event arrives or the timeout elapses.",
      inputSchema: waitForSelectionInputSchema,
      outputSchema: waitForSelectionOutputSchema,
    },
    async (args) => toToolResult(await manager.waitForSelection(args)),
  );

  server.registerTool(
    "stop_session",
    {
      title: "Stop visual companion session",
      description: "Stop a local browser session and close its HTTP/WebSocket server.",
      inputSchema: stopSessionInputSchema,
      outputSchema: stopSessionOutputSchema,
    },
    async (args) => toToolResult({
      sessionId: args.sessionId,
      stopped: await manager.stopSession(args.sessionId),
    }),
  );

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function toToolResult<T extends z.ZodRawShape>(structuredContent: z.infer<z.ZodObject<T>>) {
  return {
    structuredContent,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
  };
}
