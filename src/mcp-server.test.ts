import { describe, expect, test } from "bun:test";
import type { SessionManager } from "./session-manager";
import { __mcpServerTestUtils } from "./mcp-server";
import type { RequestUserInput } from "./schemas";

const { normalizeRequestedSchema, requestBrowserInput, validateFormContent } = __mcpServerTestUtils;

describe("mcp server request_user_input", () => {
  test("browser fallback waits for events from the rendered screen version", async () => {
    let sinceScreenVersion: number | undefined;
    const manager = {
      async readEvents() {
        return [];
      },
      async showScreen() {
        return {
          sessionId: "session-a",
          filePath: "/tmp/input-request.html",
          reloadedClients: 0,
          updatedClients: 0,
          screenVersion: 4,
        };
      },
      async waitForSelection(input: { sinceScreenVersion?: number }) {
        sinceScreenVersion = input.sinceScreenVersion;
        return {
          events: [
            {
              type: "form",
              choice: "accept",
              text: JSON.stringify({ response: "ok" }),
              content: { response: "ok" },
              timestamp: 1,
              screenVersion: 4,
            },
          ],
          timedOut: false,
        };
      },
    } as unknown as SessionManager;

    const result = await requestBrowserInput(manager, requestInput());

    expect(sinceScreenVersion).toBe(4);
    expect(result.action).toBe("accept");
    expect(result.content).toEqual({ response: "ok" });
  });

  test("rejects unsupported requested schemas", () => {
    expect(() =>
      normalizeRequestedSchema({
        type: "object",
        properties: {
          nested: {
            type: "object",
            properties: {
              value: { type: "string" },
            },
          },
        },
      }),
    ).toThrow("supported primitive MCP elicitation schema");
  });

  test("validates browser fallback content against requested schema", () => {
    const schema = normalizeRequestedSchema({
      type: "object",
      properties: {
        color: {
          type: "string",
          enum: ["red", "green"],
        },
        email: {
          type: "string",
          format: "email",
        },
        count: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["color", "email", "count"],
    });

    expect(() => validateFormContent(schema, { color: "red", email: "user@example.com", count: 2 })).not.toThrow();
    expect(() => validateFormContent(schema, { color: "blue", email: "user@example.com", count: 2 })).toThrow(
      "allowed values",
    );
    expect(() => validateFormContent(schema, { color: "red", email: "bad-email", count: 2 })).toThrow(
      "format email",
    );
    expect(() => validateFormContent(schema, { color: "red", email: "user@example.com", count: 0 })).toThrow(
      "below minimum",
    );
  });

  test("uses the default requested schema when no schema is provided", () => {
    const schema = normalizeRequestedSchema(undefined);

    expect(schema).toEqual({
      type: "object",
      properties: {
        response: {
          type: "string",
          title: "Response",
        },
      },
      required: ["response"],
    });
  });

  test("supports MCP string and multi-select enum schemas", () => {
    const schema = normalizeRequestedSchema({
      type: "object",
      properties: {
        direction: {
          type: "string",
          oneOf: [
            { const: "compact", title: "Compact" },
            { const: "spacious", title: "Spacious" },
          ],
        },
        tags: {
          type: "array",
          items: {
            anyOf: [
              { const: "fast", title: "Fast" },
              { const: "clear", title: "Clear" },
            ],
          },
          minItems: 1,
        },
      },
    });

    expect(() => validateFormContent(schema, { direction: "compact", tags: ["fast"] })).not.toThrow();
    expect(() => validateFormContent(schema, { direction: "compact", tags: [] })).toThrow("fewer items");
  });
});

function requestInput(input: Partial<RequestUserInput> = {}): RequestUserInput {
  return {
    modePreference: "browser",
    message: "Share a response",
    sensitive: false,
    sessionId: "session-a",
    filename: "input-request.html",
    timeoutMs: 120_000,
    ...input,
  };
}
