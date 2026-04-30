import { describe, expect, test } from "bun:test";
import { requestReferenceImageInputSchema, showChoiceGridInputSchema, showOptionsInputSchema } from "./schemas";
import {
  renderChoiceGridTemplate,
  renderOptionsTemplate,
  renderReferenceImageRequestTemplate,
  renderReviewBoardTemplate,
} from "./templates";

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

  test("renders reference image paste and drop upload UI", () => {
    const html = renderReferenceImageRequestTemplate(
      requestReferenceImageInputSchema.parse({
        sessionId: "session-a",
        boardId: "board",
        itemId: "current",
        title: "<Current>",
      }),
    );

    expect(html).toContain("Drop or paste a screenshot");
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(html).toContain('fetch("/reference-image-upload?"');
    expect(html).toContain("&lt;Current&gt;");
    expect(html).not.toContain("<h2><Current></h2>");
  });

  test("renders drafts linked under their reference", () => {
    const html = renderReviewBoardTemplate({
      sessionId: "session-a",
      boardId: "board",
      acceptedItemIds: [],
      projectContexts: [
        {
          id: "orders-context",
          title: "Orders implementation context",
          projectContext: {
            sourceFiles: ["src/app/orders/page.tsx"],
            components: ["OrderCard"],
            routes: ["/orders"],
            styleSources: ["src/theme.ts"],
            dataShapes: ["Order"],
            states: ["empty"],
            reusableFunctions: ["formatOrderStatus"],
            notes: ["Use existing filters."],
          },
          version: 1,
          createdAt: "2026-04-30T00:00:00.000Z",
          updatedAt: "2026-04-30T00:00:00.000Z",
        },
      ],
      screenVersion: 1,
      updatedAt: "2026-04-30T00:00:00.000Z",
      items: [
        {
          id: "current",
          role: "reference",
          referenceType: "current",
          title: "Current",
          kind: "html",
          html: "<p>Current</p>",
          referenceContext: {
            sourceFiles: ["src/app/orders/page.tsx"],
            components: ["OrderCard"],
            routes: ["/orders"],
            styleSources: ["src/theme.ts"],
            dataShapes: ["Order"],
            states: ["empty"],
            notes: ["Reuse list spacing."],
          },
          version: 1,
          locked: true,
          archived: false,
          temporary: false,
          createdAt: "2026-04-30T00:00:00.000Z",
          updatedAt: "2026-04-30T00:00:00.000Z",
        },
        {
          id: "draft-a",
          role: "draft",
          title: "Draft A",
          kind: "html",
          html: "<p>Draft A</p>",
          basedOnId: "current",
          reusedComponents: ["OrderCard"],
          sourceContextSummary: "Keeps the existing card structure.",
          version: 1,
          locked: false,
          archived: false,
          temporary: false,
          createdAt: "2026-04-30T00:00:00.000Z",
          updatedAt: "2026-04-30T00:00:00.000Z",
        },
      ],
    });

    expect(html).toContain('data-review-reference-group="current"');
    expect(html).toContain("review-linked-drafts");
    expect(html).toContain("Project Context");
    expect(html).toContain("formatOrderStatus");
    expect(html).toContain('data-review-item-id="draft-a"');
    expect(html).toContain("src/app/orders/page.tsx");
    expect(html).toContain("OrderCard");
    expect(html).toContain("Keeps the existing card structure.");
  });
});
