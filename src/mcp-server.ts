import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ElicitRequestFormParams, ElicitRequestURLParams } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SessionManager } from "./session-manager";
import {
  DEFAULT_REQUESTED_SCHEMA,
  readEventsInputSchema,
  readEventsOutputSchema,
  readCurrentWireframeSummaryInputSchema,
  readCurrentWireframeSummaryOutputSchema,
  requestUserInputOutputSchema,
  requestUserInputSchema,
  showScreenInputSchema,
  showScreenOutputSchema,
  showCardsInputSchema,
  showChoiceGridInputSchema,
  showComparisonInputSchema,
  showOptionsInputSchema,
  showWireframeInputSchema,
  startSessionInputSchema,
  startSessionOutputSchema,
  stopSessionInputSchema,
  stopSessionOutputSchema,
  type RequestUserInput,
  type RequestUserInputOutput,
  waitForSelectionInputSchema,
  waitForSelectionOutputSchema,
} from "./schemas";
import {
  renderCardsTemplate,
  renderChoiceGridTemplate,
  renderComparisonTemplate,
  renderInputRequestTemplate,
  renderOptionsTemplate,
  renderWireframeTemplate,
} from "./templates";

export function createMcpServer(manager = new SessionManager()): McpServer {
  const server = new McpServer({
    name: "visual-companion-mcp",
    version: "0.1.0",
  });

  registerDiscoveryHelpers(server);

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
    "show_options",
    {
      title: "Show option picker",
      description: "Render a selectable options screen using the built-in visual companion template.",
      inputSchema: showOptionsInputSchema,
      outputSchema: showScreenOutputSchema,
    },
    async (args) =>
      toToolResult(
        await manager.showScreen({
          sessionId: args.sessionId,
          filename: args.filename,
          html: renderOptionsTemplate(args),
          clearEvents: args.clearEvents,
        }),
      ),
  );

  server.registerTool(
    "show_cards",
    {
      title: "Show selectable cards",
      description: "Render selectable cards using the built-in visual companion template.",
      inputSchema: showCardsInputSchema,
      outputSchema: showScreenOutputSchema,
    },
    async (args) =>
      toToolResult(
        await manager.showScreen({
          sessionId: args.sessionId,
          filename: args.filename,
          html: renderCardsTemplate(args),
          clearEvents: args.clearEvents,
        }),
      ),
  );

  server.registerTool(
    "show_choice_grid",
    {
      title: "Show compact choice grid",
      description: "Render dense visual choice cards with thumbnails, bullets, badges, and one-click selection.",
      inputSchema: showChoiceGridInputSchema,
      outputSchema: showScreenOutputSchema,
    },
    async (args) =>
      toToolResult(
        await manager.showScreen({
          sessionId: args.sessionId,
          filename: args.filename,
          html: renderChoiceGridTemplate(args),
          clearEvents: args.clearEvents,
          wireframeSummary: args.wireframeSummary,
        }),
      ),
  );

  server.registerTool(
    "show_comparison",
    {
      title: "Show comparison",
      description: "Render a pros/cons comparison screen with selectable candidates.",
      inputSchema: showComparisonInputSchema,
      outputSchema: showScreenOutputSchema,
    },
    async (args) =>
      toToolResult(
        await manager.showScreen({
          sessionId: args.sessionId,
          filename: args.filename,
          html: renderComparisonTemplate(args),
          clearEvents: args.clearEvents,
        }),
      ),
  );

  server.registerTool(
    "show_wireframe",
    {
      title: "Show wireframe",
      description: "Render a simple selectable desktop, mobile, or split wireframe.",
      inputSchema: showWireframeInputSchema,
      outputSchema: showScreenOutputSchema,
    },
    async (args) =>
      toToolResult(
        await manager.showScreen({
          sessionId: args.sessionId,
          filename: args.filename,
          html: renderWireframeTemplate(args),
          clearEvents: args.clearEvents,
          wireframeSummary: args.wireframeSummary,
        }),
      ),
  );

  server.registerTool(
    "read_current_wireframe_summary",
    {
      title: "Read current wireframe summary",
      description: "Read the latest saved lightweight wireframe structure summary for a session.",
      inputSchema: readCurrentWireframeSummaryInputSchema,
      outputSchema: readCurrentWireframeSummaryOutputSchema,
    },
    async (args) => toToolResult(await manager.readCurrentWireframeSummary(args.sessionId)),
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
    "request_user_input",
    {
      title: "Request user input",
      description:
        "Request structured user input through MCP Elicitation when supported, with browser fallback for non-sensitive form input.",
      inputSchema: requestUserInputSchema,
      outputSchema: requestUserInputOutputSchema,
    },
    async (args) => toToolResult(await requestUserInput(server, manager, args)),
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

async function requestUserInput(
  server: McpServer,
  manager: SessionManager,
  input: RequestUserInput,
): Promise<RequestUserInputOutput> {
  if (input.sensitive && input.modePreference !== "url" && input.modePreference !== "auto") {
    throw new Error("Sensitive input must use URL mode elicitation.");
  }

  if (input.modePreference === "browser") {
    return requestBrowserInput(manager, input);
  }

  if (input.modePreference === "url" || (input.modePreference === "auto" && input.sensitive)) {
    if (!input.url) throw new Error("URL mode requires a url.");
    const elicitationId = input.elicitationId ?? crypto.randomUUID();
    const result = await server.server.elicitInput({
      mode: "url",
      message: input.message,
      url: input.url,
      elicitationId,
    } satisfies ElicitRequestURLParams);
    return {
      action: result.action,
      mode: "url",
      url: input.url,
    };
  }

  if (input.modePreference === "mcp_form" || input.modePreference === "auto") {
    try {
      const result = await server.server.elicitInput({
        mode: "form",
        message: input.message,
        requestedSchema: normalizeRequestedSchema(input.requestedSchema),
      } satisfies ElicitRequestFormParams);
      return {
        action: result.action,
        content: result.content,
        mode: "mcp_form",
      };
    } catch (error) {
      if (input.modePreference === "mcp_form") throw error;
    }
  }

  return requestBrowserInput(manager, input);
}

async function requestBrowserInput(
  manager: SessionManager,
  input: RequestUserInput,
): Promise<RequestUserInputOutput> {
  if (!input.sessionId) {
    throw new Error("Browser input fallback requires sessionId.");
  }
  await manager.readEvents({ sessionId: input.sessionId, clear: true });
  await manager.showScreen({
    sessionId: input.sessionId,
    filename: input.filename,
    html: renderInputRequestTemplate(input),
  });
  const result = await manager.waitForSelection({
    sessionId: input.sessionId,
    timeoutMs: input.timeoutMs,
  });
  const event = result.events[0];
  return {
    action: event ? "accept" : "cancel",
    content: event?.content ?? parseEventContent(event?.text),
    mode: "browser",
    sessionId: input.sessionId,
    timedOut: result.timedOut,
  };
}

function normalizeRequestedSchema(schema: RequestUserInput["requestedSchema"]): ElicitRequestFormParams["requestedSchema"] {
  if (!schema) {
    return DEFAULT_REQUESTED_SCHEMA as ElicitRequestFormParams["requestedSchema"];
  }
  return schema as ElicitRequestFormParams["requestedSchema"];
}

function parseEventContent(text: string | undefined): RequestUserInputOutput["content"] {
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function registerDiscoveryHelpers(server: McpServer): void {
  server.registerResource(
    "visual-companion-usage",
    "visual-companion://usage",
    {
      title: "Visual Companion usage guide",
      description:
        "How to use visual-companion for UI drafts, visual reviews, clickable previews, and A/B choices.",
      mimeType: "text/markdown",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: VISUAL_COMPANION_USAGE,
        },
      ],
    }),
  );

  server.registerPrompt(
    "show_visual_draft",
    {
      title: "Show visual draft",
      description:
        "Use visual-companion immediately when the user asks to show a UI draft, screen mockup, prototype, visual option, or clickable preview.",
    },
    () => ({
      description: "Visual Companion workflow for UI drafts and visual review.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: VISUAL_COMPANION_USAGE,
          },
        },
      ],
    }),
  );

  registerWorkflowPrompt(
    server,
    "compare_two_layouts",
    "Compare two layouts",
    "Use visual-companion to show two layout directions side by side, collect a browser selection, and summarize the chosen direction.",
    COMPARE_TWO_LAYOUTS_PROMPT,
  );

  registerWorkflowPrompt(
    server,
    "collect_design_feedback",
    "Collect design feedback",
    "Use visual-companion to gather structured non-sensitive feedback on a visual draft.",
    COLLECT_DESIGN_FEEDBACK_PROMPT,
  );

  registerWorkflowPrompt(
    server,
    "review_mobile_desktop",
    "Review mobile and desktop",
    "Use visual-companion to review desktop and mobile variants together.",
    REVIEW_MOBILE_DESKTOP_PROMPT,
  );

  registerWorkflowPrompt(
    server,
    "choose_visual_direction",
    "Choose visual direction",
    "Use visual-companion to present multiple visual directions and capture the user's preference.",
    CHOOSE_VISUAL_DIRECTION_PROMPT,
  );
}

function registerWorkflowPrompt(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  text: string,
): void {
  server.registerPrompt(name, { title, description }, () => ({
    description,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text,
        },
      },
    ],
  }));
}

export async function runStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const VISUAL_COMPANION_USAGE = `# visual-companion MCP

Use this MCP server when the user asks to show a UI draft, screen mockup, prototype, visual option, layout choice, A/B comparison, diagram, or clickable preview.

Do not stop at listing MCP resources. This server is primarily tool-oriented.

Preferred workflow:

1. Call \`start_session\` to create a local browser session.
2. For quick choices, prefer \`show_choice_grid\`, \`show_options\`, \`show_cards\`, or \`show_comparison\`; use \`show_screen\` for custom HTML.
3. Give the returned \`url\` to the user.
4. If the UI asks the user to choose, call \`wait_for_selection({ sinceScreenVersion })\` with the latest returned \`screenVersion\` or use \`read_events\`.
5. Call \`stop_session\` when the review is done.

Tool names:

- \`start_session\`
- \`show_screen\`
- \`show_options\`
- \`show_cards\`
- \`show_choice_grid\`
- \`show_comparison\`
- \`show_wireframe\`
- \`read_events\`
- \`wait_for_selection\`
- \`read_current_wireframe_summary\`
- \`request_user_input\`
- \`stop_session\`
`;

const COMPARE_TWO_LAYOUTS_PROMPT = `# Compare two layouts with visual-companion

1. Start a session if one is not already available.
2. Use \`show_comparison\` for two layout candidates with clear titles, summaries, pros, and cons.
3. Share the returned browser URL with the user.
4. Use \`wait_for_selection({ sinceScreenVersion })\` with the returned screen version to capture the selected layout, then \`read_current_wireframe_summary\` when a wireframe summary was saved.
5. Summarize the selected direction and any tradeoffs.`;

const COLLECT_DESIGN_FEEDBACK_PROMPT = `# Collect design feedback with visual-companion

1. Start a session if needed and show the draft with \`show_choice_grid\`, \`show_cards\`, \`show_comparison\`, or \`show_wireframe\`.
2. For non-sensitive structured feedback, prefer \`request_user_input\` with \`modePreference: "auto"\`.
3. If MCP Elicitation is unavailable, provide a \`sessionId\` so browser fallback can render the form.
4. Never request secrets, tokens, passwords, or payment credentials with form mode. Use URL mode for sensitive flows.`;

const REVIEW_MOBILE_DESKTOP_PROMPT = `# Review mobile and desktop with visual-companion

1. Start a session if needed.
2. Use \`show_wireframe\` with \`variant: "split"\`, \`show_choice_grid\`, or \`show_comparison\` to present desktop and mobile versions.
3. Ask the user to choose or flag issues in the browser.
4. Use \`wait_for_selection({ sinceScreenVersion })\` or \`read_events\` to collect the review result, then \`read_current_wireframe_summary\` when a wireframe summary was saved.`;

const CHOOSE_VISUAL_DIRECTION_PROMPT = `# Choose a visual direction with visual-companion

1. Start a session if needed.
2. Use \`show_choice_grid\`, \`show_cards\`, \`show_comparison\`, or \`show_options\` to present direction candidates.
3. Enable multiselect only when the user can combine directions.
4. Use \`wait_for_selection({ sinceScreenVersion })\` to capture the choice, then call \`read_current_wireframe_summary\` when a wireframe summary was saved.`;

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
