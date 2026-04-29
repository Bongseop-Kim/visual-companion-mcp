import { describe, expect, test } from "bun:test";
import { showChoiceGridInputSchema, showOptionsInputSchema } from "./schemas";
import { renderChoiceGridTemplate, renderOptionsTemplate } from "./templates";

describe("templates", () => {
  test("escapes option text and attributes", () => {
    const html = renderOptionsTemplate(
      showOptionsInputSchema.parse({
        sessionId: "session-a",
        filename: "options",
        title: "<Pick>",
        options: [
          {
            id: 'a"<script>',
            title: "<Title>",
            description: "Use <b>bold</b>",
            details: ['One & "two"'],
          },
        ],
      }),
    );

    expect(html).toContain("&lt;Pick&gt;");
    expect(html).toContain('data-choice="a&quot;&lt;script&gt;"');
    expect(html).toContain("&lt;Title&gt;");
    expect(html).toContain("Use &lt;b&gt;bold&lt;/b&gt;");
    expect(html).toContain("One &amp; &quot;two&quot;");
    expect(html).not.toContain("<script>");
  });

  test("escapes choice grid labels while preserving thumbHtml slot", () => {
    const html = renderChoiceGridTemplate(
      showChoiceGridInputSchema.parse({
        sessionId: "session-a",
        filename: "choices",
        title: "Directions",
        choices: [
          {
            choiceId: "hero",
            title: "<Hero>",
            thumbHtml: '<div class="thumb"><strong>Preview</strong></div>',
            bullets: ["Fast <scan>", "Low & dense"],
            badge: "<Best>",
          },
        ],
      }),
    );

    expect(html).toContain('<div class="thumb"><strong>Preview</strong></div>');
    expect(html).toContain("&lt;Hero&gt;");
    expect(html).toContain("Fast &lt;scan&gt;");
    expect(html).toContain("Low &amp; dense");
    expect(html).toContain("&lt;Best&gt;");
    expect(html).not.toContain("<h3><Hero></h3>");
  });
});
