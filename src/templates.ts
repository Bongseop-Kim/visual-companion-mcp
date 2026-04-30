import { escapeHtml, escapeHtmlAttribute } from "./frame";
import {
  DEFAULT_REQUESTED_SCHEMA,
  type RequestUserInput,
  type ReviewBoard,
  type ReviewItem,
  type ShowCardsInput,
  type ShowChoiceGridInput,
  type ShowComparisonInput,
  type ShowOptionsInput,
  type ShowWireframeInput,
} from "./schemas";

export function renderOptionsTemplate(input: ShowOptionsInput): string {
  return `${renderHeading(input.title, input.subtitle)}
<div class="options"${input.multiselect ? " data-multiselect" : ""}>
  ${input.options.map((option, index) => renderOption(option, letterFor(index))).join("\n")}
</div>`;
}

export function renderCardsTemplate(input: ShowCardsInput): string {
  return `${renderHeading(input.title, input.subtitle)}
<div class="cards">
  ${input.cards
    .map(
      (card) => `<article class="card" ${selectableAttrs(card.id, card.title)}>
    <div class="card-image placeholder">${escapeHtml(card.imageLabel ?? card.title)}</div>
    <div class="card-body">
      <h3>${escapeHtml(card.title)}</h3>
      ${card.description ? `<p>${escapeHtml(card.description)}</p>` : ""}
      ${renderDetails(card.details)}
    </div>
  </article>`,
    )
    .join("\n")}
</div>`;
}

export function renderChoiceGridTemplate(input: ShowChoiceGridInput): string {
  return `${renderHeading(input.title, input.subtitle)}
<div class="choice-grid">
  ${input.choices
    .map(
      (choice) => `<article class="choice-card" ${selectableAttrs(choice.choiceId, choice.title)}>
    <div class="choice-thumb">${choice.thumbHtml ?? `<div class="placeholder">${escapeHtml(choice.title)}</div>`}</div>
    <div class="choice-body">
      <div class="choice-title-row">
        <h3>${escapeHtml(choice.title)}</h3>
        ${choice.badge ? `<span class="choice-badge">${escapeHtml(choice.badge)}</span>` : ""}
      </div>
      ${renderDetails(choice.bullets)}
    </div>
  </article>`,
    )
    .join("\n")}
</div>`;
}

export function renderComparisonTemplate(input: ShowComparisonInput): string {
  return `${renderHeading(input.title, input.subtitle)}
<div class="cards">
  ${input.items
    .map(
      (item) => `<article class="card" ${selectableAttrs(item.id, item.title)}>
    <div class="card-body">
      <h3>${escapeHtml(item.title)}</h3>
      ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
      ${renderDetails(item.details)}
      <div class="pros-cons">
        <div class="pros">
          <div class="label">Pros</div>
          ${renderList(item.pros)}
        </div>
        <div class="cons">
          <div class="label">Cons</div>
          ${renderList(item.cons)}
        </div>
      </div>
    </div>
  </article>`,
    )
    .join("\n")}
</div>`;
}

export function renderWireframeTemplate(input: ShowWireframeInput): string {
  const sections = input.sections.length > 0 ? input.sections : ["Navigation", "Hero", "Content", "Actions"];
  const body = WIREFRAME_RENDERERS[input.variant](sections);

  return `${renderHeading(input.title, input.subtitle)}
<div class="mockup" ${selectableAttrs(input.choice, input.title)}>
  <div class="mockup-header">${escapeHtml(input.variant)} wireframe</div>
  <div class="mockup-body">${body}</div>
</div>`;
}

export function renderReviewBoardTemplate(board: ReviewBoard): string {
  const visibleItems = board.items.filter((item) => !item.archived);
  const references = visibleItems.filter((item) => item.role === "reference");
  const drafts = visibleItems.filter((item) => item.role === "draft");
  const proposals = visibleItems.filter((item) => item.role === "proposal");

  return `<style>
.review-board { display: grid; gap: 22px; }
.review-board-section { display: grid; gap: 12px; }
.review-board-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e6e9f1; padding-bottom: 8px; }
.review-board-heading h3 { margin: 0; font-size: 15px; color: #344054; }
.review-board-count { color: #667085; font-size: 12px; font-weight: 700; }
.review-board-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.review-item { border: 1px solid #d7dce8; border-radius: 8px; background: #fff; overflow: hidden; }
.review-item-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #eef1f6; background: #fbfcff; }
.review-item-title { font-weight: 800; color: #182230; }
.review-item-meta { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.review-badge { border: 1px solid #d0d5dd; border-radius: 999px; padding: 2px 7px; color: #475467; font-size: 11px; font-weight: 700; background: #fff; }
.review-badge.locked { border-color: #fedf89; color: #93370d; background: #fffbeb; }
.review-item-body { padding: 12px; }
.review-change-summary { margin: 0; padding: 8px 12px 10px; border-top: 1px solid #eef1f6; color: #667085; font-size: 13px; }
</style>
${renderHeading(board.title ?? "Review Board", `Board ${board.boardId}`)}
<div class="review-board" data-review-board-id="${escapeHtmlAttribute(board.boardId)}">
  ${renderReviewSection("Reference", references)}
  ${renderReviewSection("Draft", drafts)}
  ${renderReviewSection("Proposal", proposals)}
</div>`;
}

export function renderInputRequestTemplate(input: RequestUserInput): string {
  const schema = normalizeFormSchema(input.requestedSchema);
  const fields = Object.entries(schema.properties);

  return `${renderHeading("Input requested", input.message)}
<form class="mockup" id="vc-input-form">
  <div class="mockup-body">
    ${fields.map(([name, field]) => renderField(name, field, schema.required.includes(name))).join("\n")}
    <button class="mock-button" type="submit">Submit</button>
  </div>
</form>
<script>
(() => {
  const form = document.getElementById("vc-input-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const content = {};
    for (const element of form.elements) {
      if (!element.name) continue;
      if (element.type === "checkbox") {
        content[element.name] = Boolean(element.checked);
      } else if (element.tagName === "SELECT" && element.multiple) {
        content[element.name] = Array.from(element.selectedOptions).map((option) => option.value);
      } else if (element.type === "number") {
        content[element.name] = Number(element.value);
      } else {
        content[element.name] = element.value;
      }
    }
    window.recordCompanionEvent({
      type: "form",
      choice: "accept",
      text: JSON.stringify(content),
      content,
    });
  });
})();
</script>`;
}

function renderHeading(title: string, subtitle?: string): string {
  return `<h2>${escapeHtml(title)}</h2>${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ""}`;
}

function renderReviewSection(title: string, items: ReviewItem[]): string {
  return `<section class="review-board-section" data-review-section="${escapeHtmlAttribute(title.toLowerCase())}">
    <div class="review-board-heading">
      <h3>${escapeHtml(title)}</h3>
      <span class="review-board-count">${items.length}</span>
    </div>
    <div class="review-board-grid">
      ${items.length > 0 ? items.map(renderReviewItem).join("\n") : `<div class="placeholder">No ${escapeHtml(title.toLowerCase())} items.</div>`}
    </div>
  </section>`;
}

function renderReviewItem(item: ReviewItem): string {
  const badges = [
    item.referenceType,
    `v${item.version}`,
    item.locked ? "locked" : undefined,
    item.temporary ? "temporary" : undefined,
  ].filter(Boolean);

  return `<article class="review-item" data-review-item-id="${escapeHtmlAttribute(item.id)}" data-review-role="${escapeHtmlAttribute(item.role)}">
    <div class="review-item-header">
      <div class="review-item-title">${escapeHtml(item.title)}</div>
      <div class="review-item-meta">
        ${badges.map((badge) => `<span class="review-badge${badge === "locked" ? " locked" : ""}">${escapeHtml(String(badge))}</span>`).join("")}
      </div>
    </div>
    <div class="review-item-body">${item.html}</div>
    ${item.changeSummary ? `<p class="review-change-summary">${escapeHtml(item.changeSummary)}</p>` : ""}
  </article>`;
}

function renderOption(
  option: { id: string; title: string; description?: string | undefined; details: string[] },
  letter: string,
): string {
  return `<div class="option" ${selectableAttrs(option.id, option.title)}>
    <div class="letter">${escapeHtml(letter)}</div>
    <div class="content">
      <h3>${escapeHtml(option.title)}</h3>
      ${option.description ? `<p>${escapeHtml(option.description)}</p>` : ""}
      ${renderDetails(option.details)}
    </div>
  </div>`;
}

function renderDetails(details: string[]): string {
  return details.length > 0 ? renderList(details) : "";
}

function renderList(items: string[]): string {
  if (items.length === 0) return "<p>None listed.</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderDesktopWireframe(sections: string[]): string {
  return `<div class="mock-nav">${escapeHtml(sections[0] ?? "Navigation")}</div>
<div style="display:flex; gap:12px;">
  <aside class="mock-sidebar">${escapeHtml(sections[1] ?? "Sidebar")}</aside>
  <section class="mock-content">${sections.slice(2).map((section) => `<div class="placeholder">${escapeHtml(section)}</div>`).join("")}</section>
</div>`;
}

function renderMobileWireframe(sections: string[]): string {
  return `<div style="max-width:360px; margin:0 auto;">
  ${sections.map((section) => `<div class="placeholder" style="min-height:72px; margin-bottom:10px;">${escapeHtml(section)}</div>`).join("")}
</div>`;
}

function renderSplitWireframe(sections: string[]): string {
  const midpoint = Math.ceil(sections.length / 2);
  return `<div class="split">
  <section class="mock-content">${sections.slice(0, midpoint).map((section) => `<div class="placeholder">${escapeHtml(section)}</div>`).join("")}</section>
  <section class="mock-content">${sections.slice(midpoint).map((section) => `<div class="placeholder">${escapeHtml(section)}</div>`).join("")}</section>
</div>`;
}

const WIREFRAME_RENDERERS: Record<ShowWireframeInput["variant"], (sections: string[]) => string> = {
  desktop: renderDesktopWireframe,
  mobile: renderMobileWireframe,
  split: renderSplitWireframe,
};

function selectableAttrs(choiceId: string, text: string): string {
  return `data-choice="${escapeHtmlAttribute(choiceId)}" data-text="${escapeHtmlAttribute(text)}" onclick="toggleSelect(this)"`;
}

function renderField(name: string, field: FormField, required: boolean): string {
  const label = escapeHtml(field.title ?? name);
  const description = field.description ? `<p>${escapeHtml(field.description)}</p>` : "";
  const requiredAttribute = required ? " required" : "";
  if (field.type === "boolean") {
    return `<label class="section"><input type="checkbox" name="${escapeHtmlAttribute(name)}"${field.default === true ? " checked" : ""}> ${label}</label>${description}`;
  }
  if (field.enum && field.enum.length > 0) {
    return `<label class="section"><span class="label">${label}</span><select class="mock-input" name="${escapeHtmlAttribute(name)}"${requiredAttribute}>
      ${field.enum.map((value) => `<option value="${escapeHtmlAttribute(value)}"${value === field.default ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}
    </select></label>${description}`;
  }
  if (field.oneOf && field.oneOf.length > 0) {
    return `<label class="section"><span class="label">${label}</span><select class="mock-input" name="${escapeHtmlAttribute(name)}"${requiredAttribute}>
      ${field.oneOf.map((option) => `<option value="${escapeHtmlAttribute(option.const)}"${option.const === field.default ? " selected" : ""}>${escapeHtml(option.title)}</option>`).join("")}
    </select></label>${description}`;
  }
  if (field.type === "array" && field.items) {
    const options = "enum" in field.items
      ? field.items.enum.map((value) => ({ const: value, title: value }))
      : field.items.anyOf;
    const defaults = Array.isArray(field.default) ? field.default : [];
    return `<label class="section"><span class="label">${label}</span><select class="mock-input" name="${escapeHtmlAttribute(name)}" multiple${requiredAttribute}>
      ${options.map((option) => `<option value="${escapeHtmlAttribute(option.const)}"${defaults.includes(option.const) ? " selected" : ""}>${escapeHtml(option.title)}</option>`).join("")}
    </select></label>${description}`;
  }
  const type = field.type === "number" || field.type === "integer" ? "number" : "text";
  return `<label class="section"><span class="label">${label}</span><input class="mock-input" name="${escapeHtmlAttribute(name)}" type="${type}" value="${escapeHtmlAttribute(String(field.default ?? ""))}"${requiredAttribute}></label>${description}`;
}

interface FormSchema {
  properties: Record<string, FormField>;
  required: string[];
}

interface FormField {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  oneOf?: Array<{ const: string; title: string }>;
  items?: { type: "string"; enum: string[] } | { anyOf: Array<{ const: string; title: string }> };
  default?: string | number | boolean | string[];
}

function normalizeFormSchema(schema: RequestUserInput["requestedSchema"]): FormSchema {
  if (!schema || schema.type !== "object" || typeof schema.properties !== "object") {
    return {
      properties: DEFAULT_REQUESTED_SCHEMA.properties,
      required: DEFAULT_REQUESTED_SCHEMA.required,
    };
  }

  return {
    properties: schema.properties as Record<string, FormField>,
    required: Array.isArray(schema.required) ? schema.required.filter((item) => typeof item === "string") : [],
  };
}

function letterFor(index: number): string {
  return String.fromCharCode("A".charCodeAt(0) + index);
}
