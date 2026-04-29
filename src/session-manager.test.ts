import { afterEach, describe, expect, test } from "bun:test";
import { appendFile, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionManager } from "./session-manager";
import type { StartSessionOutput, WireframeSummary } from "./schemas";

const managers: SessionManager[] = [];

afterEach(async () => {
  await Promise.all(managers.map((manager) => manager.stopAll()));
  managers.length = 0;
});

describe("SessionManager wireframe summaries", () => {
  test("stores sessions in a local ignored directory when baseDir is a git worktree root", async () => {
    const manager = new SessionManager();
    managers.push(manager);
    const repoDir = await mkdtemp(join(tmpdir(), "visual-companion-repo-"));
    const gitDir = join(repoDir, ".git");
    await mkdir(gitDir);

    const session = await manager.startSession({ baseDir: repoDir });

    expect(session.workDir).toStartWith(join(repoDir, ".visual-companion-sessions"));
    expect(session.eventsPath).toStartWith(session.workDir);
    expect(await readFile(join(gitDir, "info", "exclude"), "utf8")).toContain(".visual-companion-sessions/");
  });

  test("saves and reads the current wireframe summary", async () => {
    const { manager, session } = await startTestSession();
    const summary = wireframeSummary();

    const shown = await manager.showScreen({
      sessionId: session.sessionId,
      filename: "layout.html",
      html: "<h2>Layout</h2>",
      wireframeSummary: summary,
    });

    expect(shown.wireframeSummaryPath).toEndWith("layout.wireframe-summary.json");

    const raw = JSON.parse(await readFile(shown.wireframeSummaryPath!, "utf8"));
    expect(raw.screenVersion).toBe(shown.screenVersion);
    expect(raw.filename).toBe("layout.html");
    expect(raw.wireframeSummary.screenPurpose).toBe(summary.screenPurpose);

    const current = await manager.readCurrentWireframeSummary(session.sessionId);
    expect(current.screenVersion).toBe(shown.screenVersion);
    expect(current.filename).toBe("layout.html");
    expect(current.wireframeSummaryPath).toBe(shown.wireframeSummaryPath);
    expect(current.wireframeSummary).toEqual(summary);
    expect(current.events).toEqual([]);
  });

  test("returns an empty result when no wireframe summary exists", async () => {
    const { manager, session } = await startTestSession();

    const current = await manager.readCurrentWireframeSummary(session.sessionId);

    expect(current).toEqual({ sessionId: session.sessionId, events: [] });
  });

  test("returns only events for the current summary screen version", async () => {
    const { manager, session } = await startTestSession();
    const shown = await manager.showScreen({
      sessionId: session.sessionId,
      filename: "flow",
      html: "<h2>Flow</h2>",
      wireframeSummary: wireframeSummary(),
    });
    await appendFile(
      session.eventsPath,
      [
        JSON.stringify({ type: "click", choice: "old", text: "Old", timestamp: 1, screenVersion: 0 }),
        JSON.stringify({
          type: "click",
          choice: "current",
          text: "Current",
          timestamp: 2,
          screenVersion: shown.screenVersion,
        }),
        JSON.stringify({
          type: "click",
          choice: "newer",
          text: "Newer",
          timestamp: 3,
          screenVersion: shown.screenVersion + 1,
        }),
        "",
      ].join("\n"),
      "utf8",
    );

    const current = await manager.readCurrentWireframeSummary(session.sessionId);

    expect(current.events.map((event) => event.choice)).toEqual(["current"]);
  });

  test("stops idle sessions automatically", async () => {
    const manager = new SessionManager({ idleTimeoutMs: 20 });
    managers.push(manager);
    const baseDir = await mkdtemp(join(tmpdir(), "visual-companion-test-"));
    const session = await manager.startSession({ baseDir });

    await sleep(80);

    expect(await manager.stopSession(session.sessionId)).toBe(false);
    await expect(fetch(`${session.url}/healthz`)).rejects.toThrow();
  });
});

async function startTestSession(): Promise<{ manager: SessionManager; session: StartSessionOutput }> {
  const manager = new SessionManager();
  managers.push(manager);
  const baseDir = await mkdtemp(join(tmpdir(), "visual-companion-test-"));
  const session = await manager.startSession({ baseDir });
  return { manager, session };
}

function wireframeSummary(): WireframeSummary {
  return {
    screenPurpose: "Choose the order list layout",
    layoutPattern: "top-filter-list-detail",
    viewport: "desktop",
    primaryRegion: "order-list",
    secondaryRegions: ["status-filter", "detail-preview"],
    regions: [
      { id: "status-filter", role: "filter", priority: "secondary", contains: ["status-tabs"] },
      { id: "order-list", role: "list", priority: "primary", contains: ["order-row"] },
    ],
    primaryAction: "create-order",
    choices: [{ id: "compact", label: "Compact list" }],
    notes: ["Keep the structure low fidelity."],
    constraints: ["Do not encode visual design tokens."],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
