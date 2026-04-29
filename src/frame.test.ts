import { describe, expect, test } from "bun:test";
import { isFullHtmlDocument, renderScreenHtml } from "./frame";

describe("renderScreenHtml", () => {
  test("wraps fragments in the built-in frame", () => {
    const html = renderScreenHtml({
      sessionId: 'session-"<id>',
      content: "<h2>Hello</h2>",
      screenVersion: 4,
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<main class="vc-frame">');
    expect(html).toContain("<h2>Hello</h2>");
    expect(html).toContain('data-session-id="session-&quot;&lt;id&gt;"');
    expect(html).toContain('data-screen-version="4"');
    expect(html).toContain("new WebSocket");
  });

  test("injects helper into full HTML documents", () => {
    const html = renderScreenHtml({
      sessionId: "session-a",
      content: "<!doctype html><html><body><main>Full</main></body></html>",
      screenVersion: 7,
    });

    expect(html).toContain("<main>Full</main>");
    expect(html).toContain("window.recordCompanionEvent");
    expect(html).toContain('document.body.dataset.screenVersion = String(screenVersion)');
    expect(html).toContain('document.body.dataset.screenVersion || 7');
    expect(html).toContain("</script>\n</body>");
  });

  test("detects full HTML documents", () => {
    expect(isFullHtmlDocument(" <!doctype html>")).toBe(true);
    expect(isFullHtmlDocument("\n<html>")).toBe(true);
    expect(isFullHtmlDocument("<section>Fragment</section>")).toBe(false);
  });
});
