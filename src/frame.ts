export interface RenderScreenOptions {
  sessionId: string;
  content: string;
}

export function isFullHtmlDocument(content: string): boolean {
  const trimmed = content.trimStart().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

export function renderScreenHtml(options: RenderScreenOptions): string {
  const helper = helperScript(options.sessionId);

  if (isFullHtmlDocument(options.content)) {
    return injectHelper(options.content, helper);
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Visual Companion</title>
  <style>
${frameCss()}
  </style>
</head>
<body data-session-id="${escapeHtmlAttribute(options.sessionId)}">
  <main class="vc-frame">
    ${options.content}
  </main>
  <div id="vc-indicator" class="vc-indicator" hidden></div>
  <script>
${helper}
  </script>
</body>
</html>`;
}

function injectHelper(content: string, helper: string): string {
  const script = `<script>\n${helper}\n</script>`;
  if (/<\/body\s*>/i.test(content)) {
    return content.replace(/<\/body\s*>/i, `${script}\n</body>`);
  }
  return `${content}\n${script}`;
}

function helperScript(sessionId: string): string {
  return `
(() => {
  const sessionId = ${JSON.stringify(sessionId)};
  const startedAt = Date.now();
  let socket;
  let selected = new Set();
  let handledElement = null;

  function connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(protocol + "//" + location.host + "/ws");
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "reload") location.reload();
      } catch {
        // Ignore non-JSON messages from experimental clients.
      }
    });
    socket.addEventListener("close", () => setTimeout(connect, 500));
  }

  function eventText(element) {
    return (element.dataset.text || element.innerText || element.textContent || "").trim();
  }

  function recordInteraction(element) {
    if (!element || !element.dataset.choice) return;
    const payload = {
      type: element.dataset.type || "click",
      choice: element.dataset.choice,
      text: eventText(element),
      timestamp: Date.now(),
      dwellMs: Date.now() - startedAt,
    };
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function updateIndicator() {
    const indicator = document.getElementById("vc-indicator");
    if (!indicator) return;
    if (selected.size === 0) {
      indicator.hidden = true;
      indicator.textContent = "";
      return;
    }
    indicator.hidden = false;
    indicator.textContent = selected.size === 1
      ? "Selected " + Array.from(selected)[0]
      : "Selected " + selected.size + " options";
  }

  window.toggleSelect = function toggleSelect(element) {
    if (!element) return;
    const choice = element.dataset.choice;
    if (!choice) return;
    const container = element.closest("[data-multiselect]");
    if (!container) {
      document.querySelectorAll(".selected").forEach((node) => node.classList.remove("selected"));
      selected = new Set([choice]);
      element.classList.add("selected");
    } else if (selected.has(choice)) {
      selected.delete(choice);
      element.classList.remove("selected");
    } else {
      selected.add(choice);
      element.classList.add("selected");
    }
    updateIndicator();
    handledElement = element;
    recordInteraction(element);
    setTimeout(() => { if (handledElement === element) handledElement = null; }, 0);
  };

  document.addEventListener("click", (event) => {
    const element = event.target.closest("[data-choice]");
    if (!element || element === handledElement) return;
    recordInteraction(element);
  });

  connect();
})();
`.trim();
}

function frameCss(): string {
  return `
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #172033;
  background: #f6f7fb;
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; }
.vc-frame { width: min(1120px, calc(100vw - 48px)); margin: 0 auto; padding: 40px 0 56px; }
h2 { margin: 0 0 8px; font-size: 30px; line-height: 1.2; letter-spacing: 0; }
h3 { margin: 0 0 8px; font-size: 18px; letter-spacing: 0; }
p { line-height: 1.55; }
.subtitle { margin: 0 0 24px; color: #667085; }
.section { margin: 28px 0; }
.label { margin-bottom: 8px; color: #667085; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.options { display: grid; gap: 12px; }
.option {
  display: grid; grid-template-columns: 42px 1fr; gap: 14px; align-items: start;
  padding: 16px; border: 1px solid #d7dce8; border-radius: 8px; background: #fff; cursor: pointer;
}
.option:hover, .card:hover { border-color: #6a8dff; box-shadow: 0 8px 24px rgba(27, 39, 74, .08); }
.selected { border-color: #315cff !important; box-shadow: 0 0 0 3px rgba(49, 92, 255, .14) !important; }
.letter {
  display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px;
  background: #eef2ff; color: #315cff; font-weight: 800;
}
.content > :last-child, .card-body > :last-child { margin-bottom: 0; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.card { overflow: hidden; border: 1px solid #d7dce8; border-radius: 8px; background: #fff; cursor: pointer; }
.card-image { min-height: 150px; background: #eef1f7; }
.card-body { padding: 16px; }
.mockup { overflow: hidden; border: 1px solid #d7dce8; border-radius: 8px; background: #fff; }
.mockup-header { padding: 10px 14px; border-bottom: 1px solid #e6e9f1; background: #fbfcff; color: #667085; font-size: 13px; font-weight: 700; }
.mockup-body { padding: 16px; }
.split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.pros-cons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.pros, .cons { padding: 16px; border-radius: 8px; background: #fff; border: 1px solid #d7dce8; }
.mock-nav, .mock-sidebar, .mock-content, .placeholder {
  border: 1px dashed #b8c0d6; border-radius: 6px; background: #f7f8fc; color: #667085;
}
.mock-nav { padding: 12px; margin-bottom: 12px; }
.mock-sidebar { width: 180px; padding: 14px; min-height: 180px; }
.mock-content { flex: 1; padding: 14px; min-height: 180px; }
.mock-button { border: 0; border-radius: 6px; background: #315cff; color: #fff; padding: 9px 14px; font-weight: 700; }
.mock-input { width: 100%; border: 1px solid #cfd5e4; border-radius: 6px; padding: 10px 12px; }
.placeholder { display: grid; place-items: center; min-height: 120px; }
.vc-indicator {
  position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
  padding: 10px 14px; border-radius: 999px; background: #172033; color: #fff; font-size: 13px;
  box-shadow: 0 10px 30px rgba(23, 32, 51, .22);
}
@media (max-width: 760px) {
  .vc-frame { width: min(100vw - 28px, 1120px); padding-top: 24px; }
  .split, .pros-cons { grid-template-columns: 1fr; }
}
`.trim();
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
