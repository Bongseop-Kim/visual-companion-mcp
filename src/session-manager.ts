import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { appendEvent, readEvents } from "./events";
import { isFullHtmlDocument, renderScreenHtml } from "./frame";
import { renderReviewBoardTemplate } from "./templates";
import {
  reviewBoardSchema,
  eventSchema,
  wireframeSummarySchema,
  startSessionInputSchema,
  type AcceptReviewItemInput,
  type AddReviewItemsInput,
  type ArchiveReviewItemInput,
  type CompanionEvent,
  type ReadReviewBoardInput,
  type ReadCurrentWireframeSummaryOutput,
  type ReviewBoard,
  type ReviewBoardOutput,
  type ReviewItem,
  type ReviewItemInput,
  type ShowScreenInput,
  type ShowScreenOutput,
  type ShowReviewBoardInput,
  type StartSessionInput,
  type StartSessionOutput,
  type UpdateReviewItemInput,
  type WaitForSelectionInput,
  type WaitForSelectionOutput,
  type WireframeSummary,
} from "./schemas";

type Client = Bun.ServerWebSocket<unknown>;
type ShowScreenWithSummaryInput = ShowScreenInput & {
  wireframeSummary?: WireframeSummary | undefined;
};

interface Session {
  id: string;
  port: number;
  url: string;
  workDir: string;
  screenDir: string;
  eventsPath: string;
  server: Bun.Server<unknown>;
  clients: Set<Client>;
  currentHtml: string;
  screenVersion: number;
  currentWireframeSummaryPath: string | null;
  recentEvents: CompanionEvent[];
  waiters: Set<(event: CompanionEvent) => void>;
  idleTimer: ReturnType<typeof setTimeout> | null;
  maxLifetimeTimer: ReturnType<typeof setTimeout> | null;
}

export interface SessionManagerOptions {
  idleTimeoutMs?: number | null;
  maxLifetimeMs?: number | null;
}

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_MAX_LIFETIME_MS = 2 * 60 * 60 * 1000;

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly idleTimeoutMs: number | null;
  private readonly maxLifetimeMs: number | null;

  constructor(options: SessionManagerOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs === undefined ? DEFAULT_IDLE_TIMEOUT_MS : options.idleTimeoutMs;
    this.maxLifetimeMs = options.maxLifetimeMs === undefined ? DEFAULT_MAX_LIFETIME_MS : options.maxLifetimeMs;
  }

  async startSession(input: StartSessionInput = {}): Promise<StartSessionOutput> {
    const options = startSessionInputSchema.parse(input);
    const sessionId = createSessionId();
    const baseDir = await resolveSessionBaseDir(options.baseDir);
    const workDir = join(baseDir, sessionId);
    const screenDir = join(workDir, "screens");
    const eventsPath = join(workDir, "events.jsonl");
    const initialHtml = readyScreenHtml(sessionId);
    await mkdir(workDir, { recursive: true });
    await Promise.all([
      mkdir(screenDir, { recursive: true }),
      writeFile(eventsPath, "", { flag: "a" }),
    ]);

    const clients = new Set<Client>();
    const waiters = new Set<(event: CompanionEvent) => void>();
    let session!: Session;

    const requestedPort = options.port ?? (await getAvailablePort(options.host));
    const manager = this;
    const server = Bun.serve({
      hostname: options.host,
      port: requestedPort,
      fetch: async (request, bunServer) => {
        const url = new URL(request.url);
        if (url.pathname === "/ws") {
          if (bunServer.upgrade(request)) {
            return undefined;
          }
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        if (url.pathname === "/healthz") {
          this.markActivity(session);
          return Response.json({ ok: true, sessionId });
        }

        this.markActivity(session);
        return new Response(session.currentHtml, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
      websocket: {
        open(ws) {
          clients.add(ws);
          session.idleTimer = clearIdleTimer(session.idleTimer);
        },
        close(ws) {
          clients.delete(ws);
          if (clients.size === 0) {
            manager.scheduleIdleStop(session);
          }
        },
        async message(_ws, message) {
          manager.markActivity(session);
          const event = parseClientEvent(message);
          if (!event) return;
          const versionedEvent =
            event.screenVersion === undefined ? { ...event, screenVersion: session.screenVersion } : event;
          await appendEvent(eventsPath, versionedEvent);
          session.recentEvents.push(versionedEvent);
          for (const waiter of waiters) waiter(versionedEvent);
        },
        perMessageDeflate: true,
        maxPayloadLength: 1024 * 1024,
        idleTimeout: 120,
        backpressureLimit: 1024 * 1024,
        closeOnBackpressureLimit: false,
      },
    });

    const port = server.port;
    if (port === undefined) {
      server.stop(true);
      throw new Error("Bun server did not expose a listening port");
    }
    session = {
      id: sessionId,
      port,
      url: `http://${options.urlHost}:${port}`,
      workDir,
      screenDir,
      eventsPath,
      server,
      clients,
      currentHtml: initialHtml,
      screenVersion: 0,
      currentWireframeSummaryPath: null,
      recentEvents: [],
      waiters,
      idleTimer: null,
      maxLifetimeTimer: null,
    };
    this.sessions.set(sessionId, session);
    this.scheduleIdleStop(session);
    this.scheduleMaxLifetimeStop(session);

    await writeFile(
      join(workDir, "session.json"),
      JSON.stringify(
        {
          sessionId,
          url: session.url,
          host: options.host,
          port: session.port,
          workDir,
          eventsPath,
        },
        null,
        2,
      ),
      "utf8",
    );

    return {
      sessionId,
      url: session.url,
      host: options.host,
      port: session.port,
      workDir,
      eventsPath,
    };
  }

  async showScreen(input: ShowScreenWithSummaryInput): Promise<ShowScreenOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const options = {
      delivery: input.delivery ?? "auto",
      patchSelector: input.patchSelector ?? ".vc-frame",
      clearEvents: input.clearEvents ?? false,
    };
    if (options.clearEvents) {
      await readEvents(session.eventsPath, { clear: true });
      session.recentEvents = [];
    }
    const filename = sanitizeFilename(input.filename);
    const filePath = join(session.screenDir, filename);
    const screenVersion = session.screenVersion + 1;
    const rendered = renderScreenHtml({
      sessionId: session.id,
      content: input.html,
      screenVersion,
    });
    await writeFile(filePath, rendered, "utf8");
    await writeFile(join(session.workDir, "current-screen"), filename, "utf8");
    session.currentHtml = rendered;
    session.screenVersion = screenVersion;
    const wireframeSummaryPath = input.wireframeSummary
      ? await this.writeWireframeSummary(session, filename, screenVersion, input.wireframeSummary)
      : undefined;

    const delivery = resolveDelivery(options.delivery, input.html);
    const message = buildDeliveryMessage(delivery, session.id, screenVersion, input.html, options.patchSelector);
    const payload = JSON.stringify(message);
    for (const client of session.clients) client.send(payload);
    const updatedClients = session.clients.size;
    const reloadedClients = delivery === "reload" ? updatedClients : 0;

    return { sessionId: session.id, filePath, reloadedClients, updatedClients, screenVersion, wireframeSummaryPath };
  }

  async showReviewBoard(input: ShowReviewBoardInput): Promise<ReviewBoardOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const now = new Date().toISOString();
    const board: ReviewBoard = reviewBoardSchema.parse({
      sessionId: session.id,
      boardId: input.boardId,
      title: input.title,
      currentReferenceId: input.currentReferenceId,
      acceptedItemIds: [],
      items: input.items.map((item) => normalizeReviewItem(item, now)),
      screenVersion: session.screenVersion,
      updatedAt: now,
    });
    assertUniqueReviewItems(board.items);
    board.acceptedItemIds = acceptedReviewItemIds(board);
    return this.renderAndSaveReviewBoard(session, board, input.filename);
  }

  async updateReviewItem(input: UpdateReviewItemInput): Promise<ReviewBoardOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const board = await this.loadReviewBoard(session, input.boardId);
    const item = findReviewItem(board, input.itemId);
    assertMutableReviewItem(item, "update");
    const now = new Date().toISOString();
    item.html = input.html;
    item.title = input.title ?? item.title;
    item.changeSummary = input.changeSummary ?? item.changeSummary;
    item.version += 1;
    item.updatedAt = now;
    board.updatedAt = now;
    return this.renderAndSaveReviewBoard(session, board, input.filename);
  }

  async addReviewItems(input: AddReviewItemsInput): Promise<ReviewBoardOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const board = await this.loadReviewBoard(session, input.boardId);
    const existingIds = new Set(board.items.map((item) => item.id));
    const now = new Date().toISOString();
    const additions = input.items.map((item) => normalizeReviewItem(item, now));
    for (const item of additions) {
      if (existingIds.has(item.id)) {
        throw new Error(`Review item already exists: ${item.id}`);
      }
      existingIds.add(item.id);
    }
    board.items.push(...additions);
    board.acceptedItemIds = acceptedReviewItemIds(board);
    board.updatedAt = now;
    return this.renderAndSaveReviewBoard(session, board, input.filename);
  }

  async acceptReviewItem(input: AcceptReviewItemInput): Promise<ReviewBoardOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const board = await this.loadReviewBoard(session, input.boardId);
    const item = findReviewItem(board, input.itemId);
    const now = new Date().toISOString();
    item.role = "reference";
    item.referenceType = "accepted";
    item.locked = true;
    item.archived = false;
    item.temporary = false;
    item.version += 1;
    item.updatedAt = now;
    board.acceptedItemIds = acceptedReviewItemIds(board);
    board.updatedAt = now;
    return this.renderAndSaveReviewBoard(session, board, input.filename);
  }

  async archiveReviewItem(input: ArchiveReviewItemInput): Promise<ReviewBoardOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const board = await this.loadReviewBoard(session, input.boardId);
    const item = findReviewItem(board, input.itemId);
    assertMutableReviewItem(item, "archive");
    const now = new Date().toISOString();
    item.archived = true;
    item.version += 1;
    item.updatedAt = now;
    board.acceptedItemIds = acceptedReviewItemIds(board);
    board.updatedAt = now;
    return this.renderAndSaveReviewBoard(session, board, input.filename);
  }

  async readReviewBoard(input: ReadReviewBoardInput): Promise<ReviewBoardOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    return this.loadReviewBoard(session, input.boardId);
  }

  async readEvents(input: { sessionId: string; clear?: boolean }): Promise<CompanionEvent[]> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const events = await readEvents(session.eventsPath, { clear: input.clear ?? false });
    if (input.clear) {
      session.recentEvents = [];
    }
    return events;
  }

  async waitForSelection(input: WaitForSelectionInput): Promise<WaitForSelectionOutput> {
    const parsed = {
      sessionId: input.sessionId,
      timeoutMs: input.timeoutMs ?? 60_000,
      sinceScreenVersion: input.sinceScreenVersion,
    };
    const session = this.getSession(parsed.sessionId);
    this.markActivity(session);
    const existing = filterEvents(session.recentEvents, parsed.sinceScreenVersion);
    if (existing.length > 0) {
      return { events: existing, timedOut: false };
    }

    return new Promise((resolve) => {
      const onEvent = (event: CompanionEvent) => {
        if (
          parsed.sinceScreenVersion !== undefined &&
          (event.screenVersion ?? 0) < parsed.sinceScreenVersion
        ) {
          return;
        }
        clearTimeout(timeout);
        session.waiters.delete(onEvent);
        resolve({ events: [event], timedOut: false });
      };
      const timeout = setTimeout(() => {
        session.waiters.delete(onEvent);
        resolve({ events: [], timedOut: true });
      }, parsed.timeoutMs);
      session.waiters.add(onEvent);
    });
  }

  async readCurrentWireframeSummary(sessionId: string): Promise<ReadCurrentWireframeSummaryOutput> {
    const session = this.getSession(sessionId);
    this.markActivity(session);
    if (!session.currentWireframeSummaryPath) {
      return { sessionId: session.id, events: [] };
    }

    const content = await readFile(session.currentWireframeSummaryPath, "utf8");
    const parsed = JSON.parse(content) as {
      screenVersion?: number;
      filename?: string;
      wireframeSummary?: unknown;
    };
    const events = filterEventsForScreenVersion(await readEvents(session.eventsPath), parsed.screenVersion);

    return {
      sessionId: session.id,
      screenVersion: parsed.screenVersion,
      filename: parsed.filename,
      wireframeSummary: wireframeSummarySchema.parse(parsed.wireframeSummary),
      wireframeSummaryPath: session.currentWireframeSummaryPath,
      events,
    };
  }

  async stopSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    session.idleTimer = clearIdleTimer(session.idleTimer);
    session.maxLifetimeTimer = clearIdleTimer(session.maxLifetimeTimer);
    session.waiters.clear();
    for (const client of session.clients) client.close();
    session.server.stop(true);
    return true;
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((sessionId) => this.stopSession(sessionId)));
  }

  private getSession(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return session;
  }

  private markActivity(session: Session): void {
    if (session.clients.size > 0) {
      session.idleTimer = clearIdleTimer(session.idleTimer);
      return;
    }
    this.scheduleIdleStop(session);
  }

  private scheduleIdleStop(session: Session): void {
    session.idleTimer = clearIdleTimer(session.idleTimer);
    if (this.idleTimeoutMs === null) return;
    session.idleTimer = setTimeout(() => {
      void this.stopSession(session.id);
    }, this.idleTimeoutMs);
    session.idleTimer.unref?.();
  }

  private scheduleMaxLifetimeStop(session: Session): void {
    session.maxLifetimeTimer = clearIdleTimer(session.maxLifetimeTimer);
    if (this.maxLifetimeMs === null) return;
    session.maxLifetimeTimer = setTimeout(() => {
      void this.stopSession(session.id);
    }, this.maxLifetimeMs);
    session.maxLifetimeTimer.unref?.();
  }

  private async writeWireframeSummary(
    session: Session,
    filename: string,
    screenVersion: number,
    summary: WireframeSummary,
  ): Promise<string> {
    const parsedSummary = wireframeSummarySchema.parse(summary);
    const summaryFilename = wireframeSummaryFilename(filename);
    const summaryPath = join(session.screenDir, summaryFilename);
    await writeFile(
      summaryPath,
      `${JSON.stringify(
        {
          sessionId: session.id,
          screenVersion,
          filename,
          wireframeSummary: parsedSummary,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(join(session.workDir, "current-wireframe-summary"), summaryFilename, "utf8");
    session.currentWireframeSummaryPath = summaryPath;
    return summaryPath;
  }

  private async loadReviewBoard(session: Session, boardId: string): Promise<ReviewBoard> {
    const boardPath = reviewBoardPath(session, boardId);
    const content = await readFile(boardPath, "utf8");
    return reviewBoardSchema.parse(JSON.parse(content));
  }

  private async renderAndSaveReviewBoard(
    session: Session,
    board: ReviewBoard,
    filename: string | undefined,
  ): Promise<ReviewBoardOutput> {
    const html = renderReviewBoardTemplate(board);
    const shown = await this.showScreen({
      sessionId: session.id,
      filename: filename ?? "review-board.html",
      html,
      clearEvents: false,
    });
    const updatedBoard = reviewBoardSchema.parse({
      ...board,
      screenVersion: shown.screenVersion,
      updatedAt: new Date().toISOString(),
    });
    await writeFile(reviewBoardPath(session, board.boardId), `${JSON.stringify(updatedBoard, null, 2)}\n`, "utf8");
    return {
      ...updatedBoard,
      filePath: shown.filePath,
      reloadedClients: shown.reloadedClients,
      updatedClients: shown.updatedClients,
    };
  }
}

function buildDeliveryMessage(
  delivery: "reload" | "patch-html" | "replace-body",
  sessionId: string,
  screenVersion: number,
  html: string,
  patchSelector: string,
) {
  switch (delivery) {
    case "patch-html":
      return { type: "patch-html" as const, sessionId, screenVersion, selector: patchSelector, html };
    case "replace-body":
      return { type: "replace-body" as const, sessionId, screenVersion, html: bodyHtml(html) };
    case "reload":
      return { type: "reload" as const, sessionId, screenVersion };
  }
}

function readyScreenHtml(sessionId: string): string {
  return renderScreenHtml({
    sessionId,
    content: `<h2>Visual Companion</h2><p class="subtitle">Session ${sessionId} is ready. Use show_screen to render HTML here.</p>`,
    screenVersion: 0,
  });
}

function parseClientEvent(message: string | Buffer): CompanionEvent | null {
  try {
    const data = JSON.parse(typeof message === "string" ? message : message.toString("utf8"));
    const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now();
    return eventSchema.parse({ ...data, timestamp });
  } catch {
    return null;
  }
}

function resolveDelivery(
  delivery: ShowScreenInput["delivery"],
  html: string,
): "reload" | "patch-html" | "replace-body" {
  if (delivery === "reload" || delivery === "patch-html" || delivery === "replace-body") {
    return delivery;
  }
  return isFullHtmlDocument(html) ? "reload" : "patch-html";
}

function bodyHtml(html: string): string {
  if (!isFullHtmlDocument(html)) return html;
  const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  return match?.[1] ?? html;
}

function normalizeReviewItem(item: ReviewItemInput, now: string): ReviewItem {
  return {
    id: item.id,
    role: item.role,
    title: item.title,
    html: item.html,
    version: item.version ?? 1,
    referenceType: item.referenceType,
    locked: item.locked ?? (item.role === "reference" && item.referenceType === "accepted"),
    archived: item.archived ?? false,
    temporary: item.temporary ?? false,
    basedOnId: item.basedOnId,
    changeSummary: item.changeSummary,
    createdAt: now,
    updatedAt: now,
  };
}

function findReviewItem(board: ReviewBoard, itemId: string): ReviewItem {
  const item = board.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`Unknown review item: ${itemId}`);
  return item;
}

function assertUniqueReviewItems(items: ReviewItem[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`Duplicate review item: ${item.id}`);
    seen.add(item.id);
  }
}

function assertMutableReviewItem(item: ReviewItem, action: "update" | "archive"): void {
  if (item.role === "reference" && item.locked) {
    throw new Error(`Locked reference review item cannot be ${action}d: ${item.id}`);
  }
}

function acceptedReviewItemIds(board: ReviewBoard): string[] {
  return board.items
    .filter((item) => item.role === "reference" && item.referenceType === "accepted" && !item.archived)
    .map((item) => item.id);
}

function reviewBoardPath(session: Session, boardId: string): string {
  return join(session.workDir, `${sanitizeStorageName(boardId)}.review-board.json`);
}

function sanitizeStorageName(value: string): string {
  const cleaned = basename(value);
  if (cleaned !== value || cleaned === "." || cleaned === ".." || cleaned.length === 0) {
    throw new Error("boardId must be a simple identifier");
  }
  return cleaned.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function filterEvents(events: CompanionEvent[], sinceScreenVersion: number | undefined): CompanionEvent[] {
  if (sinceScreenVersion === undefined) return events;
  return events.filter((event) => (event.screenVersion ?? 0) >= sinceScreenVersion);
}

function filterEventsForScreenVersion(
  events: CompanionEvent[],
  screenVersion: number | undefined,
): CompanionEvent[] {
  if (screenVersion === undefined) return [];
  return events.filter((event) => event.screenVersion === screenVersion);
}

function sanitizeFilename(filename: string): string {
  const cleaned = basename(filename);
  if (cleaned !== filename || cleaned === "." || cleaned === "..") {
    throw new Error("filename must be a simple file name");
  }
  return cleaned.endsWith(".html") ? cleaned : `${cleaned}.html`;
}

function wireframeSummaryFilename(filename: string): string {
  return filename.endsWith(".html")
    ? `${filename.slice(0, -".html".length)}.wireframe-summary.json`
    : `${filename}.wireframe-summary.json`;
}

function createSessionId(): string {
  const random = crypto.randomUUID().slice(0, 8);
  return `${Date.now().toString(36)}-${random}`;
}

function clearIdleTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer) clearTimeout(timer);
  return null;
}

async function resolveSessionBaseDir(baseDir: string | undefined): Promise<string> {
  if (!baseDir) return join(homedir(), ".visual-companion-mcp");
  const gitDir = await findGitDir(baseDir);
  if (!gitDir) return baseDir;
  await ensureGitExcludesVisualCompanionSessions(gitDir);
  return join(baseDir, ".visual-companion-sessions");
}

async function findGitDir(dir: string): Promise<string | null> {
  const dotGit = join(dir, ".git");
  try {
    const info = await stat(dotGit);
    if (info.isDirectory()) return dotGit;
    if (!info.isFile()) return null;
    const content = await readFile(dotGit, "utf8");
    const match = content.match(/^gitdir:\s*(.+)\s*$/i);
    if (!match) return null;
    const gitDir = match[1]!;
    return isAbsolute(gitDir) ? gitDir : resolve(dirname(dotGit), gitDir);
  } catch {
    return null;
  }
}

async function ensureGitExcludesVisualCompanionSessions(gitDir: string): Promise<void> {
  const infoDir = join(gitDir, "info");
  const excludePath = join(infoDir, "exclude");
  const pattern = ".visual-companion-sessions/";
  await mkdir(infoDir, { recursive: true });
  let current = "";
  try {
    current = await readFile(excludePath, "utf8");
  } catch {
    // Missing exclude files are fine; Git treats them as empty.
  }
  if (current.split(/\r?\n/).includes(pattern)) return;
  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  await writeFile(excludePath, `${current}${prefix}${pattern}\n`, "utf8");
}

async function getAvailablePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (typeof address === "object" && address?.port) {
          resolve(address.port);
          return;
        }
        reject(new Error("Unable to allocate an available port"));
      });
    });
  });
}
