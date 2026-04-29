import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { appendEvent, readEvents } from "./events";
import { renderScreenHtml } from "./frame";
import {
  eventSchema,
  startSessionInputSchema,
  type CompanionEvent,
  type ShowScreenInput,
  type ShowScreenOutput,
  type StartSessionInput,
  type StartSessionOutput,
  type WaitForSelectionInput,
  type WaitForSelectionOutput,
} from "./schemas";

type Client = Bun.ServerWebSocket<unknown>;

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
  clients: Set<Client>;
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

        return new Response(await currentScreenHtml(session), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
      websocket: {
        open(ws) {
          clients.add(ws);
        },
        close(ws) {
          clients.delete(ws);
        },
        async message(_ws, message) {
          const event = parseClientEvent(message);
          if (!event) return;
          await appendEvent(eventsPath, event);
          for (const waiter of waiters) waiter(event);
        },
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
      clients,
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

  async showScreen(input: ShowScreenInput): Promise<ShowScreenOutput> {
    const session = this.getSession(input.sessionId);
    const filename = sanitizeFilename(input.filename);
    const filePath = join(session.screenDir, filename);
    const rendered = renderScreenHtml({ sessionId: session.id, content: input.html });
    await writeFile(filePath, rendered, "utf8");
    await writeFile(join(session.workDir, "current-screen"), filename, "utf8");

    let reloadedClients = 0;
    for (const client of session.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "reload", sessionId: session.id }));
        reloadedClients += 1;
      }
    }

    return { sessionId: session.id, filePath, reloadedClients };
  }

  async readEvents(input: { sessionId: string; clear?: boolean }): Promise<CompanionEvent[]> {
    const session = this.getSession(input.sessionId);
    return readEvents(session.eventsPath, { clear: input.clear ?? false });
  }

  async waitForSelection(input: WaitForSelectionInput): Promise<WaitForSelectionOutput> {
    const parsed = {
      sessionId: input.sessionId,
      timeoutMs: input.timeoutMs ?? 60_000,
    };
    const session = this.getSession(parsed.sessionId);
    const existing = await readEvents(session.eventsPath);
    if (existing.length > 0) {
      return { events: existing, timedOut: false };
    }

    return new Promise((resolve) => {
      const onEvent = async () => {
        clearTimeout(timeout);
        session.waiters.delete(onEvent);
        resolve({ events: await readEvents(session.eventsPath), timedOut: false });
      };
      const timeout = setTimeout(() => {
        session.waiters.delete(onEvent);
        resolve({ events: [], timedOut: true });
      }, parsed.timeoutMs);
      session.waiters.add(onEvent);
    });
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
}

async function currentScreenHtml(session: Session): Promise<string> {
  try {
    const filename = await Bun.file(join(session.workDir, "current-screen")).text();
    return await Bun.file(join(session.screenDir, filename.trim())).text();
  } catch {
    return renderScreenHtml({
      sessionId: session.id,
      content: `<h2>Visual Companion</h2><p class="subtitle">Session ${session.id} is ready. Use show_screen to render HTML here.</p>`,
    });
  }
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

function sanitizeFilename(filename: string): string {
  const cleaned = basename(filename);
  if (cleaned !== filename || cleaned === "." || cleaned === "..") {
    throw new Error("filename must be a simple file name");
  }
  return cleaned.endsWith(".html") ? cleaned : `${cleaned}.html`;
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
