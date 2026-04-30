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

  test("stops sessions after max lifetime even with an open browser client", async () => {
    const manager = new SessionManager({ idleTimeoutMs: 1_000, maxLifetimeMs: 20 });
    managers.push(manager);
    const baseDir = await mkdtemp(join(tmpdir(), "visual-companion-test-"));
    const session = await manager.startSession({ baseDir });
    const socket = new WebSocket(`${session.url.replace("http://", "ws://")}/ws`);

    await waitForSocketOpen(socket);
    await sleep(80);

    expect(await manager.stopSession(session.sessionId)).toBe(false);
    await expect(fetch(`${session.url}/healthz`)).rejects.toThrow();
    socket.close();
  });
});

describe("SessionManager review boards", () => {
  test("updates one draft while preserving reference and accepted items", async () => {
    const { manager, session } = await startTestSession();
    const shown = await manager.showReviewBoard({
      sessionId: session.sessionId,
      boardId: "checkout",
      title: "Checkout review",
      currentReferenceId: "current",
      items: [
        {
          id: "current",
          role: "reference",
          referenceType: "current",
          locked: true,
          title: "Current screen",
          html: "<p>Current page</p>",
        },
        {
          id: "accepted",
          role: "reference",
          referenceType: "accepted",
          title: "Accepted screen",
          html: "<p>Accepted page</p>",
        },
        {
          id: "draft-a",
          role: "draft",
          title: "Draft A",
          html: "<p>Old draft</p>",
        },
      ],
    });

    expect(shown.acceptedItemIds).toEqual(["accepted"]);
    expect(shown.items.find((item) => item.id === "accepted")?.locked).toBe(true);

    const updated = await manager.updateReviewItem({
      sessionId: session.sessionId,
      boardId: "checkout",
      itemId: "draft-a",
      html: "<p>Updated draft</p>",
      changeSummary: "Updated only Draft A",
    });
    const rendered = await readFile(updated.filePath!, "utf8");

    expect(updated.items.map((item) => item.id)).toEqual(["current", "accepted", "draft-a"]);
    expect(updated.items.find((item) => item.id === "draft-a")?.version).toBe(2);
    expect(rendered).toContain("Current page");
    expect(rendered).toContain("Accepted page");
    expect(rendered).toContain("Updated draft");
    expect(rendered).not.toContain("Old draft");
  });

  test("adds proposals without replacing existing board items", async () => {
    const { manager, session } = await startTestSession();
    await manager.showReviewBoard({
      sessionId: session.sessionId,
      boardId: "product",
      items: [
        { id: "accepted", role: "reference", referenceType: "accepted", title: "Accepted", html: "<p>A</p>" },
        { id: "draft", role: "draft", title: "Draft", html: "<p>D</p>" },
      ],
    });

    const updated = await manager.addReviewItems({
      sessionId: session.sessionId,
      boardId: "product",
      items: [{ id: "proposal", role: "proposal", title: "Proposal", html: "<p>P</p>" }],
    });

    expect(updated.items.map((item) => item.id)).toEqual(["accepted", "draft", "proposal"]);
    expect(updated.acceptedItemIds).toEqual(["accepted"]);
  });

  test("accepts a draft as a locked reference while keeping existing accepted items", async () => {
    const { manager, session } = await startTestSession();
    await manager.showReviewBoard({
      sessionId: session.sessionId,
      boardId: "accept",
      items: [
        { id: "accepted", role: "reference", referenceType: "accepted", title: "Accepted", html: "<p>A</p>" },
        { id: "draft", role: "draft", title: "Draft", html: "<p>D</p>" },
      ],
    });

    const updated = await manager.acceptReviewItem({
      sessionId: session.sessionId,
      boardId: "accept",
      itemId: "draft",
    });
    const read = await manager.readReviewBoard({ sessionId: session.sessionId, boardId: "accept" });
    const acceptedDraft = read.items.find((item) => item.id === "draft");

    expect(updated.acceptedItemIds).toEqual(["accepted", "draft"]);
    expect(acceptedDraft?.role).toBe("reference");
    expect(acceptedDraft?.referenceType).toBe("accepted");
    expect(acceptedDraft?.locked).toBe(true);
  });

  test("blocks updates and archives for locked references", async () => {
    const { manager, session } = await startTestSession();
    await manager.showReviewBoard({
      sessionId: session.sessionId,
      boardId: "locked",
      items: [
        {
          id: "accepted",
          role: "reference",
          referenceType: "accepted",
          title: "Accepted",
          html: "<p>A</p>",
        },
      ],
    });

    await expect(
      manager.updateReviewItem({
        sessionId: session.sessionId,
        boardId: "locked",
        itemId: "accepted",
        html: "<p>Changed</p>",
      }),
    ).rejects.toThrow("Locked reference review item cannot be updated");

    await expect(
      manager.archiveReviewItem({
        sessionId: session.sessionId,
        boardId: "locked",
        itemId: "accepted",
      }),
    ).rejects.toThrow("Locked reference review item cannot be archived");
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

function waitForSocketOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket failed to open")), { once: true });
  });
}
