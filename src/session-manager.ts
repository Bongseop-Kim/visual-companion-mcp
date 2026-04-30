import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { appendEvent, readEvents } from "./events";
import { isFullHtmlDocument, renderScreenHtml } from "./frame";
import { analyzeProject } from "./project-analyzer";
import { renderReferenceImageRequestTemplate, renderReviewBoardTemplate } from "./templates";
import { validateImages } from "./visual-validator";
import {
  reviewBoardSchema,
  analysisReportSchema,
  eventSchema,
  visualValidationReportSchema,
  wireframeSummarySchema,
  startSessionInputSchema,
  requestReferenceImageInputSchema,
  type AcceptReviewItemInput,
  type AddDraftForReferenceInput,
  type AddReviewItemsInput,
  type AnalyzeProjectContextInput,
  type AnalyzeProjectContextOutput,
  type ArchiveReviewItemInput,
  type AttachProjectContextInput,
  type AttachReferenceContextInput,
  type CompanionEvent,
  type ImportReferenceImageInput,
  type ProjectContext,
  type RequestReferenceImageInput,
  type RequestReferenceImageOutput,
  type ReadProjectContextInput,
  type ReadProjectContextOutput,
  type ReadReferenceContextInput,
  type ReadReferenceContextOutput,
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
  type UpdateDraftForReferenceInput,
  type ValidateDraftAgainstReferenceInput,
  type ValidateDraftAgainstReferenceOutput,
  type WaitForSelectionInput,
  type WaitForSelectionOutput,
  type WireframeSummary,
} from "./schemas";

type Client = Bun.ServerWebSocket<unknown>;
type ShowScreenWithSummaryInput = ShowScreenInput & {
  wireframeSummary?: WireframeSummary | undefined;
};
type ReferenceImageUploadResult =
  | { ok: true; board: ReviewBoardOutput }
  | { ok: false; error: Error };
type ReferenceImageUploadWaiter = (result: ReferenceImageUploadResult) => void;

interface Session {
  id: string;
  port: number;
  url: string;
  workDir: string;
  screenDir: string;
  assetsDir: string;
  eventsPath: string;
  server: Bun.Server<unknown>;
  clients: Set<Client>;
  currentHtml: string;
  screenVersion: number;
  currentWireframeSummaryPath: string | null;
  recentEvents: CompanionEvent[];
  waiters: Set<(event: CompanionEvent) => void>;
  referenceImageWaiters: Map<string, Set<ReferenceImageUploadWaiter>>;
  idleTimer: ReturnType<typeof setTimeout> | null;
  maxLifetimeTimer: ReturnType<typeof setTimeout> | null;
}

export interface SessionManagerOptions {
  idleTimeoutMs?: number | null;
  maxLifetimeMs?: number | null;
}

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_MAX_LIFETIME_MS = 2 * 60 * 60 * 1000;
const MAX_REFERENCE_IMAGE_BYTES = 15 * 1024 * 1024;

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
    const assetsDir = join(workDir, "assets");
    const eventsPath = join(workDir, "events.jsonl");
    const initialHtml = readyScreenHtml(sessionId);
    await mkdir(workDir, { recursive: true });
    await Promise.all([
      mkdir(screenDir, { recursive: true }),
      mkdir(assetsDir, { recursive: true }),
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

        if (url.pathname.startsWith("/assets/")) {
          this.markActivity(session);
          return serveAsset(session, url.pathname);
        }

        if (url.pathname === "/reference-image-upload" && request.method === "POST") {
          this.markActivity(session);
          return manager.handleReferenceImageUpload(session, request, url);
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
      assetsDir,
      eventsPath,
      server,
      clients,
      currentHtml: initialHtml,
      screenVersion: 0,
      currentWireframeSummaryPath: null,
      recentEvents: [],
      waiters,
      referenceImageWaiters: new Map(),
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
      projectContexts: [],
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
    if (item.kind === "image") {
      throw new Error(`Image review item cannot be updated with HTML: ${item.id}`);
    }
    const now = new Date().toISOString();
    item.html = input.html;
    item.kind = "html";
    item.title = input.title ?? item.title;
    item.changeSummary = input.changeSummary ?? item.changeSummary;
    item.version += 1;
    item.updatedAt = now;
    board.updatedAt = now;
    return this.renderAndSaveReviewBoard(session, board, input.filename);
  }

  async addDraftForReference(input: AddDraftForReferenceInput): Promise<ReviewBoardOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const board = await this.loadReviewBoard(session, input.boardId);
    const reference = findReviewItem(board, input.referenceItemId);
    assertReferenceItem(reference);
    if (board.items.some((item) => item.id === input.draftId)) {
      throw new Error(`Review item already exists: ${input.draftId}`);
    }
    assertReferenceHasImplementationContext(reference, input.allowMissingContext ?? false);
    assertDraftMentionsImplementationContext(
      input.reusedComponents,
      input.sourceContextSummary,
      input.allowMissingContext ?? false,
    );

    const now = new Date().toISOString();
    board.items.push(
      normalizeReviewItem(
        {
          id: input.draftId,
          role: "draft",
          title: input.title,
          kind: "html",
          html: input.html,
          basedOnId: input.referenceItemId,
          changeSummary: input.changeSummary,
          reusedComponents: input.reusedComponents,
          sourceContextSummary: input.sourceContextSummary,
        },
        now,
      ),
    );
    board.updatedAt = now;
    return this.renderAndSaveReviewBoard(session, board, input.filename);
  }

  async updateDraftForReference(input: UpdateDraftForReferenceInput): Promise<ReviewBoardOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const board = await this.loadReviewBoard(session, input.boardId);
    const item = findReviewItem(board, input.draftId);
    assertDraftHtmlItem(item);
    if (!(input.allowMissingContext ?? false)) {
      if (!item.basedOnId) {
        throw new Error(`Draft item is not linked to a reference: ${item.id}`);
      }
      const reference = findReviewItem(board, item.basedOnId);
      assertReferenceItem(reference);
      assertReferenceHasImplementationContext(reference, false);
      assertDraftMentionsImplementationContext(
        input.reusedComponents ?? item.reusedComponents,
        input.sourceContextSummary ?? item.sourceContextSummary,
        false,
      );
    }
    const now = new Date().toISOString();
    item.html = input.html;
    item.title = input.title ?? item.title;
    item.changeSummary = input.changeSummary ?? item.changeSummary;
    if (input.reusedComponents !== undefined) item.reusedComponents = input.reusedComponents;
    if (input.sourceContextSummary !== undefined) item.sourceContextSummary = input.sourceContextSummary;
    item.version += 1;
    item.updatedAt = now;
    board.updatedAt = now;
    return this.renderAndSaveReviewBoard(session, board, input.filename);
  }

  async attachReferenceContext(input: AttachReferenceContextInput): Promise<ReviewBoardOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const board = await this.loadReviewBoard(session, input.boardId);
    const item = findReviewItem(board, input.referenceItemId);
    assertReferenceItem(item);
    const referenceContext = normalizeReferenceContext(input.referenceContext);
    assertUsefulReferenceContext(referenceContext);
    item.referenceContext = referenceContext;
    item.version += 1;
    item.updatedAt = new Date().toISOString();
    board.updatedAt = item.updatedAt;
    return this.renderAndSaveReviewBoard(session, board, input.filename);
  }

  async readReferenceContext(input: ReadReferenceContextInput): Promise<ReadReferenceContextOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const board = await this.loadReviewBoard(session, input.boardId);
    const item = findReviewItem(board, input.referenceItemId);
    assertReferenceItem(item);
    return {
      sessionId: session.id,
      boardId: board.boardId,
      referenceItemId: item.id,
      ...(item.referenceContext ? { referenceContext: item.referenceContext } : {}),
    };
  }

  async attachProjectContext(input: AttachProjectContextInput): Promise<ReviewBoardOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const now = new Date().toISOString();
    const projectContext = normalizeProjectContext(input.projectContext);
    assertUsefulProjectContext(projectContext);
    const board =
      (await this.loadReviewBoardIfExists(session, input.boardId)) ??
      reviewBoardSchema.parse({
        sessionId: session.id,
        boardId: input.boardId,
        acceptedItemIds: [],
        projectContexts: [],
        items: [],
        screenVersion: session.screenVersion,
        updatedAt: now,
      });
    const projectContexts = board.projectContexts ?? [];
    const existing = projectContexts.find((candidate) => candidate.id === input.contextId);
    if (existing) {
      existing.title = input.title;
      existing.projectContext = projectContext;
      existing.version += 1;
      existing.updatedAt = now;
    } else {
      projectContexts.push({
        id: input.contextId,
        title: input.title,
        projectContext,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    board.projectContexts = projectContexts;
    board.updatedAt = now;
    return this.renderAndSaveReviewBoard(session, board, input.filename);
  }

  async readProjectContext(input: ReadProjectContextInput): Promise<ReadProjectContextOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const board = await this.loadReviewBoard(session, input.boardId);
    const projectContext = (board.projectContexts ?? []).find((candidate) => candidate.id === input.contextId);
    if (!projectContext) throw new Error(`Unknown project context: ${input.contextId}`);
    return {
      sessionId: session.id,
      boardId: board.boardId,
      contextId: input.contextId,
      projectContext,
    };
  }

  async analyzeProjectContext(input: AnalyzeProjectContextInput): Promise<AnalyzeProjectContextOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const analysis = await analyzeProject({
      projectRoot: input.projectRoot,
      targetPath: input.targetPath,
      targetRoute: input.targetRoute,
      maxFiles: input.maxFiles,
    });
    const now = new Date().toISOString();
    let board = await this.loadReviewBoardIfExists(session, input.boardId);
    let changed = false;
    let projectContextRecord: AnalyzeProjectContextOutput["projectContext"] | undefined;

    if (input.referenceItemId) {
      if (!board) throw new Error(`Unknown review board: ${input.boardId}`);
      const item = findReviewItem(board, input.referenceItemId);
      assertReferenceItem(item);
      item.referenceContext = analysis.referenceContext;
      item.analysisReport = analysis;
      item.version += 1;
      item.updatedAt = now;
      changed = true;
    }

    if (input.contextId) {
      board =
        board ??
        reviewBoardSchema.parse({
          sessionId: session.id,
          boardId: input.boardId,
          acceptedItemIds: [],
          projectContexts: [],
          items: [],
          screenVersion: session.screenVersion,
          updatedAt: now,
        });
      const projectContexts = board.projectContexts ?? [];
      const existing = projectContexts.find((candidate) => candidate.id === input.contextId);
      if (existing) {
        existing.title = input.title ?? existing.title;
        existing.projectContext = analysis.projectContext;
        existing.version += 1;
        existing.updatedAt = now;
        projectContextRecord = existing;
      } else {
        projectContextRecord = {
          id: input.contextId,
          title: input.title ?? `Project context ${input.contextId}`,
          projectContext: analysis.projectContext,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        projectContexts.push(projectContextRecord);
      }
      board.projectContexts = projectContexts;
      changed = true;
    }

    if (!changed || !board) {
      return {
        sessionId: session.id,
        boardId: input.boardId,
        analysis,
        referenceContext: analysis.referenceContext,
      };
    }

    board.updatedAt = now;
    const rendered = await this.renderAndSaveReviewBoard(session, board, input.filename);
    return {
      sessionId: session.id,
      boardId: rendered.boardId,
      analysis,
      referenceContext: analysis.referenceContext,
      ...(projectContextRecord ? { projectContext: projectContextRecord } : {}),
      filePath: rendered.filePath,
      reloadedClients: rendered.reloadedClients,
      updatedClients: rendered.updatedClients,
      screenVersion: rendered.screenVersion,
    };
  }

  async validateDraftAgainstReference(
    input: ValidateDraftAgainstReferenceInput,
  ): Promise<ValidateDraftAgainstReferenceOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const board = await this.loadReviewBoard(session, input.boardId);
    const reference = findReviewItem(board, input.referenceItemId);
    const draft = findReviewItem(board, input.draftItemId);
    assertReferenceItem(reference);
    assertDraftHtmlItem(draft);
    const referenceImagePath = resolveReviewImagePath(
      session,
      input.referenceImagePath ?? reference.imagePath,
      "referenceImagePath",
    );
    if (!input.draftImagePath) {
      throw new Error("draftImagePath is required because visual-companion does not capture web or mobile screens automatically.");
    }
    const draftImagePath = resolveReviewImagePath(session, input.draftImagePath, "draftImagePath");
    const diffAssetFilename = `${sanitizeStorageName(input.draftItemId)}-${sanitizeStorageName(input.referenceItemId)}-diff-${Date.now()}.png`;
    const report = await validateImages({
      id: `validation-${Date.now()}`,
      referenceItemId: input.referenceItemId,
      draftItemId: input.draftItemId,
      referenceImagePath,
      draftImagePath,
      diffImagePath: join(session.assetsDir, diffAssetFilename),
      diffImageHref: `assets/${diffAssetFilename}`,
      threshold: input.threshold ?? 0.1,
      maxDiffRatio: input.maxDiffRatio ?? 0.08,
    });
    draft.validationReports = [...(draft.validationReports ?? []), report];
    draft.updatedAt = report.createdAt;
    board.updatedAt = report.createdAt;
    const rendered = await this.renderAndSaveReviewBoard(session, board, input.filename);
    return {
      sessionId: session.id,
      boardId: board.boardId,
      report,
      filePath: rendered.filePath,
      reloadedClients: rendered.reloadedClients,
      updatedClients: rendered.updatedClients,
      screenVersion: rendered.screenVersion,
    };
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

  async importReferenceImage(input: ImportReferenceImageInput): Promise<ReviewBoardOutput> {
    const session = this.getSession(input.sessionId);
    this.markActivity(session);
    const sourcePath = resolveLocalFile(input.imagePath);
    const mimeType = imageMimeTypeForPath(sourcePath);
    await assertReadableFile(sourcePath);

    const assetFilename = await this.copyReferenceImageAsset(session, input.itemId, sourcePath);
    return this.addReferenceImageAsset(session, {
      boardId: input.boardId,
      itemId: input.itemId,
      title: input.title,
      imageAlt: input.imageAlt,
      filename: input.filename,
      assetFilename,
      mimeType,
    });
  }

  async requestReferenceImage(input: RequestReferenceImageInput): Promise<RequestReferenceImageOutput> {
    const parsed = requestReferenceImageInputSchema.parse(input);
    const session = this.getSession(parsed.sessionId);
    this.markActivity(session);
    const screen = await this.showScreen({
      sessionId: session.id,
      filename: `reference-image-${sanitizeStorageName(parsed.boardId)}-${sanitizeStorageName(parsed.itemId)}.html`,
      html: renderReferenceImageRequestTemplate(parsed),
      clearEvents: false,
    });
    const key = referenceImageUploadKey(parsed.boardId, parsed.itemId);
    const result = await this.waitForReferenceImageUpload(session, key, parsed.timeoutMs);
    if (result.ok) {
      return {
        ...result.board,
        timedOut: false,
        uploadScreenVersion: screen.screenVersion,
      };
    }
    if (result.error.message === "Timed out waiting for reference image upload") {
      return {
        sessionId: session.id,
        boardId: parsed.boardId,
        timedOut: true,
        uploadScreenVersion: screen.screenVersion,
      };
    }
    throw result.error;
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
    session.referenceImageWaiters.clear();
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

  private async loadReviewBoardIfExists(session: Session, boardId: string): Promise<ReviewBoard | null> {
    try {
      return await this.loadReviewBoard(session, boardId);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    }
  }

  private async copyReferenceImageAsset(session: Session, itemId: string, sourcePath: string): Promise<string> {
    const extension = extname(sourcePath).toLowerCase();
    const filename = `${sanitizeStorageName(itemId)}${extension}`;
    await copyFile(sourcePath, join(session.assetsDir, filename));
    return filename;
  }

  private async writeReferenceImageAsset(
    session: Session,
    itemId: string,
    extension: ".png" | ".jpg" | ".webp",
    bytes: Uint8Array,
  ): Promise<string> {
    const filename = `${sanitizeStorageName(itemId)}${extension}`;
    await writeFile(join(session.assetsDir, filename), bytes);
    return filename;
  }

  private async addReferenceImageAsset(
    session: Session,
    input: {
      boardId: string;
      itemId: string;
      title: string;
      imageAlt?: string | undefined;
      filename?: string | undefined;
      assetFilename: string;
      mimeType: "image/png" | "image/jpeg" | "image/webp";
    },
  ): Promise<ReviewBoardOutput> {
    const now = new Date().toISOString();
    const board = (await this.loadReviewBoardIfExists(session, input.boardId)) ?? reviewBoardSchema.parse({
      sessionId: session.id,
      boardId: input.boardId,
      currentReferenceId: input.itemId,
      acceptedItemIds: [],
      projectContexts: [],
      items: [],
      screenVersion: session.screenVersion,
      updatedAt: now,
    });
    if (board.items.some((item) => item.id === input.itemId)) {
      throw new Error(`Review item already exists: ${input.itemId}`);
    }

    board.items.push(
      normalizeReviewItem(
        {
          id: input.itemId,
          role: "reference",
          referenceType: "current",
          locked: true,
          title: input.title,
          kind: "image",
          imagePath: `assets/${input.assetFilename}`,
          imageMimeType: input.mimeType,
          imageAlt: input.imageAlt ?? input.title,
        },
        now,
      ),
    );
    board.currentReferenceId = board.currentReferenceId ?? input.itemId;
    board.acceptedItemIds = acceptedReviewItemIds(board);
    board.updatedAt = now;
    return this.renderAndSaveReviewBoard(session, board, input.filename);
  }

  private waitForReferenceImageUpload(
    session: Session,
    key: string,
    timeoutMs: number,
  ): Promise<ReferenceImageUploadResult> {
    return new Promise((resolve) => {
      const onUpload: ReferenceImageUploadWaiter = (result) => {
        clearTimeout(timeout);
        const waiters = session.referenceImageWaiters.get(key);
        waiters?.delete(onUpload);
        if (waiters?.size === 0) session.referenceImageWaiters.delete(key);
        resolve(result);
      };
      const timeout = setTimeout(() => {
        const waiters = session.referenceImageWaiters.get(key);
        waiters?.delete(onUpload);
        if (waiters?.size === 0) session.referenceImageWaiters.delete(key);
        resolve({ ok: false, error: new Error("Timed out waiting for reference image upload") });
      }, timeoutMs);
      let waiters = session.referenceImageWaiters.get(key);
      if (!waiters) {
        waiters = new Set();
        session.referenceImageWaiters.set(key, waiters);
      }
      waiters.add(onUpload);
    });
  }

  private notifyReferenceImageUpload(session: Session, key: string, result: ReferenceImageUploadResult): void {
    const waiters = session.referenceImageWaiters.get(key);
    if (!waiters) return;
    for (const waiter of [...waiters]) waiter(result);
  }

  private async handleReferenceImageUpload(session: Session, request: Request, url: URL): Promise<Response> {
      const input = readReferenceImageUploadParams(url);
    const key = referenceImageUploadKey(input.boardId, input.itemId);
    try {
      const contentType = normalizeUploadContentType(request.headers.get("content-type"));
      const bytes = new Uint8Array(await request.arrayBuffer());
      const detected = detectImageBytes(bytes);
      if (!detected || detected.mimeType !== contentType) {
        throw new Error("Uploaded image must be a PNG, JPEG, or WebP file with a matching content type.");
      }
      const assetFilename = await this.writeReferenceImageAsset(session, input.itemId, detected.extension, bytes);
      const board = await this.addReferenceImageAsset(session, {
        ...input,
        assetFilename,
        mimeType: detected.mimeType,
      });
      const result: ReferenceImageUploadResult = { ok: true, board };
      this.notifyReferenceImageUpload(session, key, result);
      return Response.json({ ok: true, board });
    } catch (error) {
      const uploadError = error instanceof Error ? error : new Error("Reference image upload failed");
      this.notifyReferenceImageUpload(session, key, { ok: false, error: uploadError });
      return Response.json({ ok: false, error: uploadError.message }, { status: 400 });
    }
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

async function serveAsset(session: Session, pathname: string): Promise<Response> {
  const assetName = decodeURIComponent(pathname.slice("/assets/".length));
  if (basename(assetName) !== assetName || assetName.length === 0) {
    return new Response("Not found", { status: 404 });
  }
  const assetPath = join(session.assetsDir, assetName);
  try {
    const mimeType = imageMimeTypeForPath(assetPath);
    const file = await readFile(assetPath);
    return new Response(file, {
      headers: {
        "content-type": mimeType,
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
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
  const kind = item.kind ?? (item.imagePath ? "image" : "html");
  if (kind === "html" && item.html === undefined) {
    throw new Error(`HTML review item requires html: ${item.id}`);
  }
  if (kind === "image" && (!item.imagePath || !item.imageMimeType)) {
    throw new Error(`Image review item requires imagePath and imageMimeType: ${item.id}`);
  }
  return {
    id: item.id,
    role: item.role,
    title: item.title,
    kind,
    html: item.html,
    imagePath: item.imagePath,
    imageMimeType: item.imageMimeType,
    imageAlt: item.imageAlt,
    version: item.version ?? 1,
    referenceType: item.referenceType,
    locked: item.locked ?? (item.role === "reference" && item.referenceType === "accepted"),
    archived: item.archived ?? false,
    temporary: item.temporary ?? false,
    basedOnId: item.basedOnId,
    changeSummary: item.changeSummary,
    referenceContext: item.referenceContext ? normalizeReferenceContext(item.referenceContext) : undefined,
    reusedComponents: item.reusedComponents,
    sourceContextSummary: item.sourceContextSummary,
    analysisReport: item.analysisReport ? analysisReportSchema.parse(item.analysisReport) : undefined,
    validationReports: (item.validationReports ?? []).map((report) => visualValidationReportSchema.parse(report)),
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeReferenceContext(context: ReviewItemInput["referenceContext"]): NonNullable<ReviewItem["referenceContext"]> {
  return {
    sourceFiles: context?.sourceFiles ?? [],
    components: context?.components ?? [],
    routes: context?.routes ?? [],
    styleSources: context?.styleSources ?? [],
    dataShapes: context?.dataShapes ?? [],
    states: context?.states ?? [],
    notes: context?.notes ?? [],
  };
}

function normalizeProjectContext(context: ProjectContextInput | undefined): ProjectContext {
  return {
    sourceFiles: context?.sourceFiles ?? [],
    components: context?.components ?? [],
    routes: context?.routes ?? [],
    styleSources: context?.styleSources ?? [],
    dataShapes: context?.dataShapes ?? [],
    states: context?.states ?? [],
    reusableFunctions: context?.reusableFunctions ?? [],
    notes: context?.notes ?? [],
  };
}

type ProjectContextInput = {
  sourceFiles?: string[] | undefined;
  components?: string[] | undefined;
  routes?: string[] | undefined;
  styleSources?: string[] | undefined;
  dataShapes?: string[] | undefined;
  states?: string[] | undefined;
  reusableFunctions?: string[] | undefined;
  notes?: string[] | undefined;
};

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

function assertReferenceItem(item: ReviewItem): void {
  if (item.role !== "reference") {
    throw new Error(`Review item is not a reference: ${item.id}`);
  }
}

function assertReferenceHasImplementationContext(item: ReviewItem, allowMissingContext: boolean): void {
  if (allowMissingContext) return;
  if (!item.referenceContext) {
    throw new Error(`Reference implementation context is required before drafting: ${item.id}`);
  }
  assertUsefulReferenceContext(item.referenceContext);
}

function assertUsefulReferenceContext(context: NonNullable<ReviewItem["referenceContext"]>): void {
  if (hasImplementationAnchor(context)) return;
  throw new Error("Reference context must include at least one source file, component, route, or style source.");
}

function assertUsefulProjectContext(context: ProjectContext): void {
  if (hasImplementationAnchor(context) || context.reusableFunctions.length > 0) return;
  throw new Error("Project context must include at least one source file, component, route, style source, or reusable function.");
}

function assertDraftMentionsImplementationContext(
  reusedComponents: string[] | undefined,
  sourceContextSummary: string | undefined,
  allowMissingContext: boolean,
): void {
  if (allowMissingContext) return;
  if ((reusedComponents?.length ?? 0) > 0 || Boolean(sourceContextSummary?.trim())) return;
  throw new Error("Draft must record reusedComponents or sourceContextSummary when implementation context is required.");
}

function hasImplementationAnchor(context: {
  sourceFiles: string[];
  components: string[];
  routes: string[];
  styleSources: string[];
}): boolean {
  return (
    context.sourceFiles.length > 0 ||
    context.components.length > 0 ||
    context.routes.length > 0 ||
    context.styleSources.length > 0
  );
}

function assertDraftHtmlItem(item: ReviewItem): void {
  if (item.role !== "draft") {
    throw new Error(`Review item is not a draft: ${item.id}`);
  }
  if (item.kind === "image") {
    throw new Error(`Image draft item cannot be updated with HTML: ${item.id}`);
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

function imageMimeTypeForPath(path: string): "image/png" | "image/jpeg" | "image/webp" {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  throw new Error("imagePath must end with .png, .jpg, .jpeg, or .webp");
}

function referenceImageUploadKey(boardId: string, itemId: string): string {
  return `${boardId}\0${itemId}`;
}

function readReferenceImageUploadParams(url: URL): {
  boardId: string;
  itemId: string;
  title: string;
  imageAlt?: string;
  filename: string;
} {
  const boardId = readRequiredQuery(url, "boardId");
  const itemId = readRequiredQuery(url, "itemId");
  const title = readRequiredQuery(url, "title");
  const imageAlt = url.searchParams.get("imageAlt") ?? undefined;
  return {
    boardId,
    itemId,
    title,
    ...(imageAlt === undefined ? {} : { imageAlt }),
    filename: url.searchParams.get("filename") ?? "review-board.html",
  };
}

function readRequiredQuery(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`Missing required upload parameter: ${name}`);
  return value;
}

function normalizeUploadContentType(value: string | null): "image/png" | "image/jpeg" | "image/webp" {
  const contentType = value?.split(";")[0]?.trim().toLowerCase();
  if (contentType === "image/png" || contentType === "image/jpeg" || contentType === "image/webp") {
    return contentType;
  }
  throw new Error("Uploaded image must use image/png, image/jpeg, or image/webp content type.");
}

function detectImageBytes(
  bytes: Uint8Array,
): { mimeType: "image/png"; extension: ".png" } | { mimeType: "image/jpeg"; extension: ".jpg" } | { mimeType: "image/webp"; extension: ".webp" } | null {
  if (bytes.length === 0) throw new Error("Uploaded image is empty.");
  if (bytes.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("Uploaded image is too large. Use an image under 15 MB.");
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: ".png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: ".jpg" };
  }
  if (
    bytes.length >= 12 &&
    asciiBytesEqual(bytes, 0, "RIFF") &&
    asciiBytesEqual(bytes, 8, "WEBP")
  ) {
    return { mimeType: "image/webp", extension: ".webp" };
  }
  return null;
}

function asciiBytesEqual(bytes: Uint8Array, offset: number, value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

async function assertReadableFile(path: string): Promise<void> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`imagePath must point to a file: ${path}`);
}

function resolveLocalFile(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function resolveReviewImagePath(session: Session, path: string | undefined, fieldName: string): string {
  if (!path) throw new Error(`${fieldName} is required.`);
  if (path.startsWith("assets/")) return join(session.workDir, path);
  return resolveLocalFile(path);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
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
