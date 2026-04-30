import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ElicitRequestFormParams, ElicitRequestURLParams, PrimitiveSchemaDefinition } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SessionManager } from "./session-manager";
import {
  DEFAULT_REQUESTED_SCHEMA,
  acceptReviewItemInputSchema,
  addDraftForReferenceInputSchema,
  addReviewItemsInputSchema,
  archiveReviewItemInputSchema,
  importReferenceImageInputSchema,
  readEventsInputSchema,
  readEventsOutputSchema,
  readCurrentWireframeSummaryInputSchema,
  readCurrentWireframeSummaryOutputSchema,
  readReviewBoardInputSchema,
  requestReferenceImageInputSchema,
  requestReferenceImageOutputSchema,
  requestUserInputOutputSchema,
  requestUserInputSchema,
  reviewBoardOutputSchema,
  showScreenInputSchema,
  showScreenOutputSchema,
  showCardsInputSchema,
  showChoiceGridInputSchema,
  showComparisonInputSchema,
  showOptionsInputSchema,
  showReviewBoardInputSchema,
  showWireframeInputSchema,
  startSessionInputSchema,
  startSessionOutputSchema,
  stopSessionInputSchema,
  stopSessionOutputSchema,
  type RequestUserInput,
  type RequestUserInputOutput,
  updateReviewItemInputSchema,
  updateDraftForReferenceInputSchema,
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
    "show_review_board",
    {
      title: "Show review board",
      description:
        "Create or replace a Review Board for multi-draft visual review. Reference items are rendered first and are preserved by later item updates.",
      inputSchema: showReviewBoardInputSchema,
      outputSchema: reviewBoardOutputSchema,
    },
    async (args) => toToolResult(await manager.showReviewBoard(args)),
  );

  server.registerTool(
    "update_review_item",
    {
      title: "Update review item",
      description:
        "Update one Review Board item by id while preserving all other reference, draft, and proposal items. Locked reference items cannot be updated.",
      inputSchema: updateReviewItemInputSchema,
      outputSchema: reviewBoardOutputSchema,
    },
    async (args) => toToolResult(await manager.updateReviewItem(args)),
  );

  server.registerTool(
    "add_draft_for_reference",
    {
      title: "Add draft for reference",
      description:
        "Add one HTML draft linked to an existing Review Board reference item while preserving all references, accepted items, proposals, and other drafts.",
      inputSchema: addDraftForReferenceInputSchema,
      outputSchema: reviewBoardOutputSchema,
    },
    async (args) => toToolResult(await manager.addDraftForReference(args)),
  );

  server.registerTool(
    "update_draft_for_reference",
    {
      title: "Update draft for reference",
      description:
        "Update one existing HTML draft item only. This tool refuses to update references, proposals, and image items.",
      inputSchema: updateDraftForReferenceInputSchema,
      outputSchema: reviewBoardOutputSchema,
    },
    async (args) => toToolResult(await manager.updateDraftForReference(args)),
  );

  server.registerTool(
    "add_review_items",
    {
      title: "Add review items",
      description:
        "Add draft or proposal items to an existing Review Board without replacing existing references or drafts.",
      inputSchema: addReviewItemsInputSchema,
      outputSchema: reviewBoardOutputSchema,
    },
    async (args) => toToolResult(await manager.addReviewItems(args)),
  );

  server.registerTool(
    "accept_review_item",
    {
      title: "Accept review item",
      description:
        "Mark a Review Board item as an accepted locked reference while keeping existing accepted references unless explicitly archived later.",
      inputSchema: acceptReviewItemInputSchema,
      outputSchema: reviewBoardOutputSchema,
    },
    async (args) => toToolResult(await manager.acceptReviewItem(args)),
  );

  server.registerTool(
    "archive_review_item",
    {
      title: "Archive review item",
      description:
        "Hide a mutable Review Board item from the default board render without deleting it. Locked references cannot be archived.",
      inputSchema: archiveReviewItemInputSchema,
      outputSchema: reviewBoardOutputSchema,
    },
    async (args) => toToolResult(await manager.archiveReviewItem(args)),
  );

  server.registerTool(
    "import_reference_image",
    {
      title: "Import reference image",
      description:
        "Import a local PNG, JPEG, or WebP screenshot as a locked current reference item on a Review Board without replacing existing drafts or references.",
      inputSchema: importReferenceImageInputSchema,
      outputSchema: reviewBoardOutputSchema,
    },
    async (args) => toToolResult(await manager.importReferenceImage(args)),
  );

  server.registerTool(
    "request_reference_image",
    {
      title: "Request reference image",
      description:
        "Show a paste/drop upload screen so the user can add any screenshot as a locked Review Board reference, regardless of whether it came from web, mobile, Expo, or a design tool.",
      inputSchema: requestReferenceImageInputSchema,
      outputSchema: requestReferenceImageOutputSchema,
    },
    async (args) => toToolResult(await manager.requestReferenceImage(args)),
  );

  server.registerTool(
    "read_review_board",
    {
      title: "Read review board",
      description: "Read the persisted Review Board state for a session and board id.",
      inputSchema: readReviewBoardInputSchema,
      outputSchema: reviewBoardOutputSchema,
    },
    async (args) => toToolResult(await manager.readReviewBoard(args)),
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
        "Request structured user input through MCP Elicitation when supported, with browser fallback for non-sensitive form input. URL mode accept means the user agreed to open the URL, not that the external flow completed.",
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
      const requestedSchema = normalizeRequestedSchema(input.requestedSchema);
      const result = await server.server.elicitInput({
        mode: "form",
        message: input.message,
        requestedSchema,
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
  const requestedSchema = normalizeRequestedSchema(input.requestedSchema);
  await manager.readEvents({ sessionId: input.sessionId, clear: true });
  const screen = await manager.showScreen({
    sessionId: input.sessionId,
    filename: input.filename,
    html: renderInputRequestTemplate({ ...input, requestedSchema }),
  });
  const result = await manager.waitForSelection({
    sessionId: input.sessionId,
    timeoutMs: input.timeoutMs,
    sinceScreenVersion: screen.screenVersion,
  });
  const event = result.events[0];
  const content = event ? (event.content ?? parseEventContent(event.text)) : undefined;
  if (event) validateFormContent(requestedSchema, content);
  return {
    action: event ? "accept" : "cancel",
    content,
    mode: "browser",
    sessionId: input.sessionId,
    timedOut: result.timedOut,
  };
}

function normalizeRequestedSchema(schema: RequestUserInput["requestedSchema"]): ElicitRequestFormParams["requestedSchema"] {
  if (!schema) {
    return DEFAULT_REQUESTED_SCHEMA as ElicitRequestFormParams["requestedSchema"];
  }
  if (!isRecord(schema) || schema.type !== "object" || !isRecord(schema.properties)) {
    throw new Error("requestedSchema must be a flat object schema with primitive properties.");
  }

  const properties: Record<string, PrimitiveSchemaDefinition> = {};
  for (const [name, field] of Object.entries(schema.properties)) {
    if (!isRecord(field)) {
      throw new Error(`requestedSchema.properties.${name} must be an object.`);
    }
    properties[name] = normalizePrimitiveSchema(name, field);
  }

  const requestedSchema: ElicitRequestFormParams["requestedSchema"] = {
    type: "object",
    properties,
  };
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || !schema.required.every((item) => typeof item === "string")) {
      throw new Error("requestedSchema.required must be an array of strings.");
    }
    for (const name of schema.required) {
      if (!(name in properties)) throw new Error(`requestedSchema.required references unknown property: ${name}`);
    }
    requestedSchema.required = schema.required;
  }
  return requestedSchema;
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

function normalizePrimitiveSchema(name: string, field: Record<string, unknown>): PrimitiveSchemaDefinition {
  const common = normalizeCommonField(name, field);
  if (field.type === "string") {
    if (Array.isArray(field.enum)) {
      const enumValues = readStringArray(`requestedSchema.properties.${name}.enum`, field.enum);
      const normalized = { ...common, type: "string" as const, enum: enumValues };
      if (field.enumNames !== undefined) {
        if (!Array.isArray(field.enumNames)) {
          throw new Error(`requestedSchema.properties.${name}.enumNames must be an array of strings.`);
        }
        const enumNames = readStringArray(`requestedSchema.properties.${name}.enumNames`, field.enumNames);
        if (enumNames.length !== enumValues.length) {
          throw new Error(`requestedSchema.properties.${name}.enumNames must match enum length.`);
        }
        return withStringDefault(name, field, { ...normalized, enumNames });
      }
      return withStringDefault(name, field, normalized);
    }
    if (Array.isArray(field.oneOf)) {
      const oneOf = readConstTitleOptions(`requestedSchema.properties.${name}.oneOf`, field.oneOf);
      return withStringDefault(name, field, { ...common, type: "string", oneOf });
    }
    const normalized: PrimitiveSchemaDefinition = {
      ...common,
      type: "string",
      ...optionalNumberField(name, field, "minLength"),
      ...optionalNumberField(name, field, "maxLength"),
      ...optionalStringFormat(name, field),
    };
    return withStringDefault(name, field, normalized);
  }
  if (field.type === "number" || field.type === "integer") {
    const normalized: PrimitiveSchemaDefinition = {
      ...common,
      type: field.type,
      ...optionalNumberField(name, field, "minimum"),
      ...optionalNumberField(name, field, "maximum"),
    };
    if (field.default !== undefined) {
      if (typeof field.default !== "number") throw new Error(`requestedSchema.properties.${name}.default must be a number.`);
      normalized.default = field.default;
    }
    return normalized;
  }
  if (field.type === "boolean") {
    const normalized: PrimitiveSchemaDefinition = { ...common, type: "boolean" };
    if (field.default !== undefined) {
      if (typeof field.default !== "boolean") {
        throw new Error(`requestedSchema.properties.${name}.default must be a boolean.`);
      }
      normalized.default = field.default;
    }
    return normalized;
  }
  if (field.type === "array") {
    if (!isRecord(field.items)) throw new Error(`requestedSchema.properties.${name}.items must be an object.`);
    const normalized = {
      ...common,
      type: "array" as const,
      ...optionalNumberField(name, field, "minItems"),
      ...optionalNumberField(name, field, "maxItems"),
    };
    const items = field.items;
    if (items.type === "string" && Array.isArray(items.enum)) {
      const arraySchema = {
        ...normalized,
        items: { type: "string" as const, enum: readStringArray(`requestedSchema.properties.${name}.items.enum`, items.enum) },
      };
      return withStringArrayDefault(name, field, arraySchema);
    }
    if (Array.isArray(items.anyOf)) {
      const arraySchema = {
        ...normalized,
        items: { anyOf: readConstTitleOptions(`requestedSchema.properties.${name}.items.anyOf`, items.anyOf) },
      };
      return withStringArrayDefault(name, field, arraySchema);
    }
  }
  throw new Error(`requestedSchema.properties.${name} must use a supported primitive MCP elicitation schema.`);
}

function validateFormContent(
  schema: ElicitRequestFormParams["requestedSchema"],
  content: RequestUserInputOutput["content"] | undefined,
): void {
  if (!content) throw new Error("Browser input did not include form content.");
  for (const name of schema.required ?? []) {
    if (content[name] === undefined || content[name] === "") {
      throw new Error(`Browser input is missing required field: ${name}`);
    }
  }
  for (const [name, value] of Object.entries(content)) {
    const field = schema.properties[name];
    if (!field) throw new Error(`Browser input included unknown field: ${name}`);
    validateFieldValue(name, field, value);
  }
}

function validateFieldValue(name: string, field: PrimitiveSchemaDefinition, value: string | number | boolean | string[]): void {
  if (field.type === "string") {
    if (typeof value !== "string") throw new Error(`Browser input field ${name} must be a string.`);
    if ("enum" in field && !field.enum.includes(value)) throw new Error(`Browser input field ${name} must be one of the allowed values.`);
    if ("oneOf" in field && !field.oneOf.some((option) => option.const === value)) {
      throw new Error(`Browser input field ${name} must be one of the allowed values.`);
    }
    if ("minLength" in field && field.minLength !== undefined && value.length < field.minLength) {
      throw new Error(`Browser input field ${name} is shorter than minLength.`);
    }
    if ("maxLength" in field && field.maxLength !== undefined && value.length > field.maxLength) {
      throw new Error(`Browser input field ${name} is longer than maxLength.`);
    }
    if ("format" in field && field.format && !matchesStringFormat(field.format, value)) {
      throw new Error(`Browser input field ${name} does not match format ${field.format}.`);
    }
    return;
  }
  if (field.type === "number" || field.type === "integer") {
    if (typeof value !== "number" || Number.isNaN(value)) throw new Error(`Browser input field ${name} must be a number.`);
    if (field.type === "integer" && !Number.isInteger(value)) throw new Error(`Browser input field ${name} must be an integer.`);
    if (field.minimum !== undefined && value < field.minimum) throw new Error(`Browser input field ${name} is below minimum.`);
    if (field.maximum !== undefined && value > field.maximum) throw new Error(`Browser input field ${name} is above maximum.`);
    return;
  }
  if (field.type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`Browser input field ${name} must be a boolean.`);
    return;
  }
  if (field.type === "array") {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new Error(`Browser input field ${name} must be an array of strings.`);
    }
    const allowedValues = "enum" in field.items ? field.items.enum : field.items.anyOf.map((option) => option.const);
    if (value.some((item) => !allowedValues.includes(item))) {
      throw new Error(`Browser input field ${name} includes a disallowed value.`);
    }
    if (field.minItems !== undefined && value.length < field.minItems) {
      throw new Error(`Browser input field ${name} has fewer items than minItems.`);
    }
    if (field.maxItems !== undefined && value.length > field.maxItems) {
      throw new Error(`Browser input field ${name} has more items than maxItems.`);
    }
  }
}

function normalizeCommonField(name: string, field: Record<string, unknown>) {
  return {
    ...optionalStringField(name, field, "title"),
    ...optionalStringField(name, field, "description"),
  };
}

function withStringDefault<T extends PrimitiveSchemaDefinition>(name: string, field: Record<string, unknown>, schema: T): T {
  if (field.default === undefined) return schema;
  if (typeof field.default !== "string") throw new Error(`requestedSchema.properties.${name}.default must be a string.`);
  return { ...schema, default: field.default };
}

function withStringArrayDefault<T extends PrimitiveSchemaDefinition>(name: string, field: Record<string, unknown>, schema: T): T {
  if (field.default === undefined) return schema;
  if (!Array.isArray(field.default) || !field.default.every((item) => typeof item === "string")) {
    throw new Error(`requestedSchema.properties.${name}.default must be an array of strings.`);
  }
  return { ...schema, default: field.default };
}

function optionalStringField(name: string, field: Record<string, unknown>, key: "title" | "description") {
  if (field[key] === undefined) return {};
  if (typeof field[key] !== "string") throw new Error(`requestedSchema.properties.${name}.${key} must be a string.`);
  return { [key]: field[key] };
}

function optionalNumberField(
  name: string,
  field: Record<string, unknown>,
  key: "minLength" | "maxLength" | "minimum" | "maximum" | "minItems" | "maxItems",
) {
  if (field[key] === undefined) return {};
  if (typeof field[key] !== "number") throw new Error(`requestedSchema.properties.${name}.${key} must be a number.`);
  return { [key]: field[key] };
}

function optionalStringFormat(name: string, field: Record<string, unknown>) {
  if (field.format === undefined) return {};
  if (!["email", "uri", "date", "date-time"].includes(String(field.format))) {
    throw new Error(`requestedSchema.properties.${name}.format is not supported.`);
  }
  return { format: field.format as "email" | "uri" | "date" | "date-time" };
}

function matchesStringFormat(format: "email" | "uri" | "date" | "date-time", value: string): boolean {
  if (format === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (format === "uri") {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
  if (format === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }
  return !Number.isNaN(Date.parse(value));
}

function readStringArray(path: string, value: unknown[]): string[] {
  if (!value.every((item) => typeof item === "string")) throw new Error(`${path} must be an array of strings.`);
  return value;
}

function readConstTitleOptions(path: string, value: unknown[]): Array<{ const: string; title: string }> {
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.const !== "string" || typeof item.title !== "string") {
      throw new Error(`${path}[${index}] must include string const and title.`);
    }
    return { const: item.const, title: item.title };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function registerDiscoveryHelpers(server: McpServer): void {
  server.registerResource(
    "visual-companion-usage",
    "visual-companion://usage",
    {
      title: "Visual Companion usage guide",
      description:
        "How to use visual-companion for current-code-first UI drafts, visual reviews, clickable previews, and A/B choices.",
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
        "Use visual-companion immediately when the user asks to show a current page, UI draft, screen mockup, prototype, visual option, or clickable preview.",
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
  const manager = new SessionManager();
  const server = createMcpServer(manager);
  const transport = new StdioServerTransport();
  let shuttingDown = false;

  const shutdown = async (exitCode?: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    await manager.stopAll();
    if (exitCode !== undefined) {
      process.exit(exitCode);
    }
  };

  process.stdin.once("end", () => void shutdown(0));
  process.stdin.once("close", () => void shutdown(0));
  process.once("SIGINT", () => void shutdown(130));
  process.once("SIGTERM", () => void shutdown(143));

  await server.connect(transport);
}

const VISUAL_COMPANION_USAGE = `# visual-companion MCP

Use this MCP server when the user asks to show a UI draft, screen mockup, prototype, visual option, layout choice, A/B comparison, diagram, or clickable preview.

Do not stop at listing MCP resources. This server is primarily tool-oriented.

Default to current-code-first visual review. In product UI work, the normal goal is to show the current page or component as it exists in the codebase, then make targeted visual changes with the user. If the requested page or component does not exist yet, inspect nearby routes, shared components, design tokens, and data patterns, then create a new draft that fits the existing product instead of starting from a generic blank concept.

Before making frontend or screen drafts, check the target project's own \`AGENTS.md\` and follow any project-local frontend or screen guidance first.

Inspect the target route, component tree, styles, fixtures, and existing UI states before rendering. When the target exists, run or inspect the existing app so the first visual draft matches the real current screen. When it does not exist, inspect the closest comparable screens and clearly state that the draft is new but based on those existing patterns.

Render the current screen baseline first when one exists, or make the first draft a small variant of that baseline. Preserve real layout, copy, spacing, navigation, data shape, and interaction states unless the user asked to change them. For a new page, preserve the surrounding product structure and reuse established components and states. When sharing the URL, state what source page/component the draft is based on.

For hidden, blocking, or sequential UI states, separate real behavior from review coverage. Show the real current state first. When the goal is visual review, also expose relevant modals, sheets, popovers, dropdowns, toasts, validation states, empty/loading states, and wizard/form steps as stacked or side-by-side review states so the user can judge them at once. Preserve one-step-at-a-time interaction only when the user is reviewing the actual interaction flow.

When showing many draft variants in the browser, prefer vertical stacking or responsive wrapping by default so the review page scrolls vertically. Use horizontal scrolling only when the draft itself is intentionally demonstrating a horizontal-scroll interaction.

When a review contains multiple screen drafts, accepted drafts, or a current implementation reference, use Review Board tools instead of replacing the browser with a one-off screen. Put current and accepted screens in \`reference\` items, active alternatives in \`draft\` items, and new ideas in \`proposal\` items. Later requests to change one linked draft should call \`update_draft_for_reference\`; use \`update_review_item\` only for advanced board edits.

Preferred workflow:

1. Inspect the current code and existing screen behavior for the requested page or component, or the closest comparable screens when the target does not exist yet.
2. Call \`start_session\` to create a local browser session.
3. Render the current screen baseline first when one exists, or a new draft based on nearby product patterns when it does not.
4. If the screen includes overlays or multi-step flows, include a review view that expands the important states after the baseline unless the user only asked for exact runtime behavior.
5. For multi-draft reviews, use \`show_review_board\`; for any real current screen shown in web, mobile, Expo, native apps, or design tools, prefer \`request_reference_image\` so the user can paste or drop a screenshot as a locked baseline. Use \`import_reference_image\` when a local image path is already available. Add and revise HTML variants with \`add_draft_for_reference\` and \`update_draft_for_reference\`. For advanced edits use \`update_review_item\`, \`add_review_items\`, \`accept_review_item\`, or \`archive_review_item\`. For quick one-off choices, prefer \`show_choice_grid\`, \`show_options\`, \`show_cards\`, or \`show_comparison\`; use \`show_screen\` for custom HTML.
6. Give the returned \`url\` to the user and name the source page/component or comparable patterns used.
7. If the UI asks the user to choose, call \`wait_for_selection({ sinceScreenVersion })\` with the latest returned \`screenVersion\` or use \`read_events\`.
8. Call \`stop_session\` when the review is done.

Tool names:

- \`start_session\`
- \`show_screen\`
- \`show_options\`
- \`show_cards\`
- \`show_choice_grid\`
- \`show_comparison\`
- \`show_wireframe\`
- \`show_review_board\`
- \`update_review_item\`
- \`add_draft_for_reference\`
- \`update_draft_for_reference\`
- \`add_review_items\`
- \`accept_review_item\`
- \`archive_review_item\`
- \`import_reference_image\`
- \`request_reference_image\`
- \`read_review_board\`
- \`read_events\`
- \`wait_for_selection\`
- \`read_current_wireframe_summary\`
- \`request_user_input\`
- \`stop_session\`
`;

const COMPARE_TWO_LAYOUTS_PROMPT = `# Compare two layouts with visual-companion

1. Inspect the existing route/component/styles first and base both candidates on the current screen when it exists; for a new page, base them on the closest comparable product patterns.
2. Start a session if one is not already available.
3. Use \`show_comparison\` for two layout candidates with clear titles, summaries, pros, and cons.
4. Share the returned browser URL with the user and state the source page/component used.
5. Use \`wait_for_selection({ sinceScreenVersion })\` with the returned screen version to capture the selected layout, then \`read_current_wireframe_summary\` when a wireframe summary was saved.
6. Summarize the selected direction and any tradeoffs.`;

const COLLECT_DESIGN_FEEDBACK_PROMPT = `# Collect design feedback with visual-companion

1. Inspect the existing page/component first and show a baseline or targeted variant that matches the current code; for a new page, inspect comparable screens and show a draft that fits those patterns.
2. Include expanded review states for relevant modals, sheets, validation states, and wizard/form steps unless the user only asked to test the actual interaction flow.
3. Start a session if needed and show the draft with \`show_choice_grid\`, \`show_cards\`, \`show_comparison\`, or \`show_wireframe\`.
4. For non-sensitive structured feedback, prefer \`request_user_input\` with \`modePreference: "auto"\`.
5. If MCP Elicitation is unavailable, provide a \`sessionId\` so browser fallback can render the form.
6. Never request secrets, tokens, passwords, or payment credentials with form mode. Use URL mode for sensitive flows.`;

const REVIEW_MOBILE_DESKTOP_PROMPT = `# Review mobile and desktop with visual-companion

1. Inspect the existing responsive implementation first, including the route/component, styles, and breakpoints.
2. Start a session if needed.
3. Use \`show_wireframe\` with \`variant: "split"\`, \`show_choice_grid\`, or \`show_comparison\` to present desktop and mobile versions based on the current screen.
4. Include expanded overlay or step states for both breakpoints when those states affect the visual review.
5. Ask the user to choose or flag issues in the browser.
6. Use \`wait_for_selection({ sinceScreenVersion })\` or \`read_events\` to collect the review result, then \`read_current_wireframe_summary\` when a wireframe summary was saved.`;

const CHOOSE_VISUAL_DIRECTION_PROMPT = `# Choose a visual direction with visual-companion

1. Inspect the current page/component first and make the existing screen the reference point; for a new page, use nearby product patterns as the reference point.
2. Start a session if needed.
3. Use \`show_choice_grid\`, \`show_cards\`, \`show_comparison\`, or \`show_options\` to present direction candidates.
4. Keep candidates grounded in the current code or nearby product patterns unless the user explicitly asked for unrelated new concepts.
5. Enable multiselect only when the user can combine directions.
6. Use \`wait_for_selection({ sinceScreenVersion })\` to capture the choice, then call \`read_current_wireframe_summary\` when a wireframe summary was saved.`;

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

export const __mcpServerTestUtils = {
  normalizeRequestedSchema,
  requestBrowserInput,
  validateFormContent,
};
