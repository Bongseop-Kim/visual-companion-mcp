import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { appendEvent, readEvents } from "./events";
import { isFullHtmlDocument, renderScreenHtml } from "./frame";
import {
  eventSchema,
  wireframeSummarySchema,
  startSessionInputSchema,
  type CompanionEvent,
  type ReadCurrentWireframeSummaryOutput,
  type ShowScreenInput,
  type ShowScreenOutput,
  type StartSessionInput,
  type StartSessionOutput,
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
  host: string;
  urlHost: string;
  port: number;
  url: string;
  workDir: string;
  screenDir: string;
  eventsPath: string;
  server: Bun.Server<unknown>;
  wsTopic: string;
  clients: Set<Client>;
  currentFilename: string | null;
  currentHtml: string;
  screenVersion: number;
  currentWireframeSummaryPath: string | null;
  currentWireframeSummaryFilename: string | null;
  currentWireframeSummaryVersion: number | null;
  waiters: Set<(event: CompanionEvent) => void>;
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  async startSession(input: StartSessionInput = {}): Promise<StartSessionOutput> {
    const options = startSessionInputSchema.parse(input);
    const sessionId = createSessionId();
    const baseDir = options.baseDir ?? join(homedir(), ".visual-companion-mcp");
    const workDir = join(baseDir, sessionId);
    const screenDir = join(workDir, "screens");
    const eventsPath = join(workDir, "events.jsonl");
    const wsTopic = `session:${sessionId}`;
    const initialHtml = readyScreenHtml(sessionId);
    await mkdir(screenDir, { recursive: true });
    await writeFile(eventsPath, "", { flag: "a" });

    const clients = new Set<Client>();
    const waiters = new Set<(event: CompanionEvent) => void>();
    let session!: Session;

    const requestedPort = options.port ?? (await getAvailablePort(options.host));
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
          return Response.json({ ok: true, sessionId });
        }

        return new Response(currentScreenHtml(session), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
      websocket: {
        open(ws) {
          clients.add(ws);
          ws.subscribe(wsTopic);
        },
        close(ws) {
          clients.delete(ws);
        },
        async message(_ws, message) {
          const event = parseClientEvent(message);
          if (!event) return;
          const versionedEvent =
            event.screenVersion === undefined ? { ...event, screenVersion: session.screenVersion } : event;
          await appendEvent(eventsPath, versionedEvent);
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
      host: options.host,
      urlHost: options.urlHost,
      port,
      url: `http://${options.urlHost}:${port}`,
      workDir,
      screenDir,
      eventsPath,
      server,
      wsTopic,
      clients,
      currentFilename: null,
      currentHtml: initialHtml,
      screenVersion: 0,
      currentWireframeSummaryPath: null,
      currentWireframeSummaryFilename: null,
      currentWireframeSummaryVersion: null,
      waiters,
    };
    this.sessions.set(sessionId, session);

    await writeFile(
      join(workDir, "session.json"),
      JSON.stringify(
        {
          sessionId,
          url: session.url,
          host: session.host,
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
      host: session.host,
      port: session.port,
      workDir,
      eventsPath,
    };
  }

  async showScreen(input: ShowScreenWithSummaryInput): Promise<ShowScreenOutput> {
    const session = this.getSession(input.sessionId);
    const options = {
      delivery: input.delivery ?? "auto",
      patchSelector: input.patchSelector ?? ".vc-frame",
      clearEvents: input.clearEvents ?? false,
    };
    if (options.clearEvents) {
      await readEvents(session.eventsPath, { clear: true });
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
    session.currentFilename = filename;
    session.currentHtml = rendered;
    session.screenVersion = screenVersion;
    const wireframeSummaryPath = input.wireframeSummary
      ? await this.writeWireframeSummary(session, filename, screenVersion, input.wireframeSummary)
      : undefined;

    const delivery = resolveDelivery(options.delivery, input.html);
    const message =
      delivery === "patch-html"
        ? {
            type: "patch-html",
            sessionId: session.id,
            screenVersion,
            selector: options.patchSelector,
            html: input.html,
          }
        : delivery === "replace-body"
          ? { type: "replace-body", sessionId: session.id, screenVersion, html: bodyHtml(input.html) }
          : { type: "reload", sessionId: session.id, screenVersion };
    session.server.publish(session.wsTopic, JSON.stringify(message));
    const updatedClients = session.clients.size;
    const reloadedClients = delivery === "reload" ? updatedClients : 0;

    return { sessionId: session.id, filePath, reloadedClients, updatedClients, screenVersion, wireframeSummaryPath };
  }

  async readEvents(input: { sessionId: string; clear?: boolean }): Promise<CompanionEvent[]> {
    const session = this.getSession(input.sessionId);
    return readEvents(session.eventsPath, { clear: input.clear ?? false });
  }

  async waitForSelection(input: WaitForSelectionInput): Promise<WaitForSelectionOutput> {
    const parsed = {
      sessionId: input.sessionId,
      timeoutMs: input.timeoutMs ?? 60_000,
      sinceScreenVersion: input.sinceScreenVersion,
    };
    const session = this.getSession(parsed.sessionId);
    const existing = filterEvents(await readEvents(session.eventsPath), parsed.sinceScreenVersion);
    if (existing.length > 0) {
      return { events: existing, timedOut: false };
    }

    return new Promise((resolve) => {
      const onEvent = async () => {
        const events = filterEvents(await readEvents(session.eventsPath), parsed.sinceScreenVersion);
        if (events.length === 0) return;
        clearTimeout(timeout);
        session.waiters.delete(onEvent);
        resolve({ events, timedOut: false });
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
    if (!session.currentWireframeSummaryPath) {
      return { sessionId: session.id, events: [] };
    }

    const content = await readFile(session.currentWireframeSummaryPath, "utf8");
    const parsed = JSON.parse(content) as {
      screenVersion?: number;
      filename?: string;
      wireframeSummary?: unknown;
    };
    const screenVersion = parsed.screenVersion ?? session.currentWireframeSummaryVersion ?? undefined;
    const events = filterEventsForScreenVersion(await readEvents(session.eventsPath), screenVersion);

    return {
      sessionId: session.id,
      screenVersion,
      filename: parsed.filename ?? session.currentWireframeSummaryFilename ?? undefined,
      wireframeSummary: wireframeSummarySchema.parse(parsed.wireframeSummary),
      wireframeSummaryPath: session.currentWireframeSummaryPath,
      events,
    };
  }

  async stopSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
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
    session.currentWireframeSummaryFilename = filename;
    session.currentWireframeSummaryVersion = screenVersion;
    return summaryPath;
  }
}

function currentScreenHtml(session: Session): string {
  return session.currentHtml;
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
