import { escapeHtml, escapeHtmlAttribute } from "./frame";
import {
  DEFAULT_REQUESTED_SCHEMA,
  type AnalysisReport,
  type ProjectContextRecord,
  type RequestUserInput,
  type RequestReferenceImageInput,
  type ReviewBoard,
  type ReviewItem,
  type VisualValidationReport,
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
  const projectContexts = board.projectContexts ?? [];
  const references = visibleItems.filter((item) => item.role === "reference");
  const referenceIds = new Set(references.map((item) => item.id));
  const linkedDrafts = visibleItems.filter((item) => item.role === "draft" && item.basedOnId && referenceIds.has(item.basedOnId));
  const linkedDraftIds = new Set(linkedDrafts.map((item) => item.id));
  const drafts = visibleItems.filter((item) => item.role === "draft" && !linkedDraftIds.has(item.id));
  const proposals = visibleItems.filter((item) => item.role === "proposal");

  return `<style>
.review-board { display: grid; gap: 22px; }
.review-board-section { display: grid; gap: 12px; }
.review-board-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e6e9f1; padding-bottom: 8px; }
.review-board-heading h3 { margin: 0; font-size: 15px; color: #344054; }
.review-board-count { color: #667085; font-size: 12px; font-weight: 700; }
.review-board-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.review-reference-group { display: grid; gap: 10px; }
.review-linked-drafts { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; padding-left: 12px; border-left: 3px solid #e6e9f1; }
.review-item { border: 1px solid #d7dce8; border-radius: 8px; background: #fff; overflow: hidden; }
.review-item-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #eef1f6; background: #fbfcff; }
.review-item-title { font-weight: 800; color: #182230; }
.review-item-meta { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.review-badge { border: 1px solid #d0d5dd; border-radius: 999px; padding: 2px 7px; color: #475467; font-size: 11px; font-weight: 700; background: #fff; }
.review-badge.locked { border-color: #fedf89; color: #93370d; background: #fffbeb; }
.review-badge.passed { border-color: #abefc6; color: #067647; background: #ecfdf3; }
.review-badge.warning { border-color: #fedf89; color: #93370d; background: #fffaeb; }
.review-badge.failed { border-color: #fecdca; color: #b42318; background: #fef3f2; }
.review-item-body { padding: 12px; }
.review-reference-image {
  display: block; width: 100%; max-width: 100%; height: auto;
  border: 1px solid #e6e9f1; border-radius: 6px; background: #f8fafc;
}
.review-context { display: grid; gap: 8px; margin-top: 12px; padding-top: 10px; border-top: 1px solid #eef1f6; }
.review-context-row { display: grid; gap: 4px; }
.review-context-label { color: #667085; font-size: 11px; font-weight: 800; text-transform: uppercase; }
.review-context-list { display: flex; flex-wrap: wrap; gap: 5px; }
.review-context-chip { border: 1px solid #d0d5dd; border-radius: 999px; padding: 2px 7px; color: #344054; background: #fff; font-size: 11px; font-weight: 700; }
.review-context-note { margin: 0; color: #475467; font-size: 12px; line-height: 1.45; }
.review-validation-image { display: block; width: 100%; max-width: 260px; height: auto; border: 1px solid #e6e9f1; border-radius: 6px; background: #f8fafc; }
.review-change-summary { margin: 0; padding: 8px 12px 10px; border-top: 1px solid #eef1f6; color: #667085; font-size: 13px; }
</style>
${renderHeading(board.title ?? "Review Board", `Board ${board.boardId}`)}
<div class="review-board" data-review-board-id="${escapeHtmlAttribute(board.boardId)}">
  ${renderProjectContextSection(projectContexts)}
  ${renderReferenceSection(references, linkedDrafts)}
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

export function renderReferenceImageRequestTemplate(input: RequestReferenceImageInput): string {
  return `${renderHeading(input.title, "Paste, drop, or choose a screenshot to preserve it as the locked reference.")}
<style>
.reference-upload {
  display: grid; gap: 16px; min-height: 420px;
}
.reference-dropzone {
  display: grid; place-items: center; gap: 12px; min-height: 300px;
  border: 2px dashed #98a2b3; border-radius: 8px; background: #fff; padding: 28px;
  text-align: center; cursor: pointer;
}
.reference-dropzone.dragging { border-color: #315cff; background: #f5f7ff; }
.reference-dropzone strong { color: #172033; font-size: 18px; }
.reference-dropzone span { color: #667085; }
.reference-preview { display: none; max-width: min(100%, 520px); max-height: 420px; border: 1px solid #d7dce8; border-radius: 8px; background: #f8fafc; }
.reference-preview.visible { display: block; }
.reference-status { min-height: 22px; color: #475467; font-weight: 700; }
.reference-status.error { color: #b42318; }
.reference-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
</style>
<section class="reference-upload">
  <div id="reference-dropzone" class="reference-dropzone" tabindex="0" role="button">
    <strong>Drop or paste a screenshot</strong>
    <span>PNG, JPEG, or WebP. Click to choose a file.</span>
    <img id="reference-preview" class="reference-preview" alt="">
  </div>
  <div class="reference-actions">
    <button id="reference-choose" class="mock-button" type="button">Choose image</button>
    <input id="reference-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
    <span id="reference-status" class="reference-status">Waiting for an image.</span>
  </div>
</section>
<script>
(() => {
  const dropzone = document.getElementById("reference-dropzone");
  const choose = document.getElementById("reference-choose");
  const fileInput = document.getElementById("reference-file");
  const status = document.getElementById("reference-status");
  const preview = document.getElementById("reference-preview");
  const query = new URLSearchParams({
    boardId: ${JSON.stringify(input.boardId)},
    itemId: ${JSON.stringify(input.itemId)},
    title: ${JSON.stringify(input.title)},
    imageAlt: ${JSON.stringify(input.imageAlt ?? input.title)},
    filename: ${JSON.stringify(input.filename ?? "review-board.html")},
  });

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function pickImageFromItems(items) {
    for (const item of items || []) {
      if (item.kind === "file" && item.type && item.type.startsWith("image/")) return item.getAsFile();
    }
    return null;
  }

  async function upload(file) {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      setStatus("Choose a PNG, JPEG, or WebP image.", true);
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.classList.add("visible");
    setStatus("Uploading reference image...");
    try {
      const response = await fetch("/reference-image-upload?" + query.toString(), {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Upload failed.");
      }
      setStatus("Reference saved. The review board will open automatically.");
      window.recordCompanionEvent({
        type: "reference-image-upload",
        choice: ${JSON.stringify(input.itemId)},
        text: file.name || "uploaded image",
        content: { boardId: ${JSON.stringify(input.boardId)}, itemId: ${JSON.stringify(input.itemId)} },
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.", true);
    }
  }

  document.addEventListener("paste", (event) => {
    const file = pickImageFromItems(event.clipboardData?.items);
    if (file) {
      event.preventDefault();
      void upload(file);
    }
  });
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
    const file = Array.from(event.dataTransfer?.files || []).find((candidate) => candidate.type.startsWith("image/"));
    void upload(file);
  });
  dropzone.addEventListener("click", () => fileInput.click());
  choose.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => void upload(fileInput.files?.[0]));
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

function renderReferenceSection(references: ReviewItem[], linkedDrafts: ReviewItem[]): string {
  const count = references.length + linkedDrafts.length;
  return `<section class="review-board-section" data-review-section="reference">
    <div class="review-board-heading">
      <h3>Reference</h3>
      <span class="review-board-count">${count}</span>
    </div>
    <div class="review-board-grid">
      ${references.length > 0 ? references.map((item) => renderReferenceGroup(item, linkedDrafts)).join("\n") : `<div class="placeholder">No reference items.</div>`}
    </div>
  </section>`;
}

function renderProjectContextSection(projectContexts: ProjectContextRecord[]): string {
  if (projectContexts.length === 0) return "";
  return `<section class="review-board-section" data-review-section="project-context">
    <div class="review-board-heading">
      <h3>Project Context</h3>
      <span class="review-board-count">${projectContexts.length}</span>
    </div>
    <div class="review-board-grid">
      ${projectContexts.map(renderProjectContext).join("\n")}
    </div>
  </section>`;
}

function renderProjectContext(record: ProjectContextRecord): string {
  return `<article class="review-item" data-project-context-id="${escapeHtmlAttribute(record.id)}">
    <div class="review-item-header">
      <div class="review-item-title">${escapeHtml(record.title)}</div>
      <div class="review-item-meta"><span class="review-badge">v${record.version}</span></div>
    </div>
    <div class="review-item-body">
      <div class="review-context">
        ${renderContextRow("Files", record.projectContext.sourceFiles)}
        ${renderContextRow("Components", record.projectContext.components)}
        ${renderContextRow("Routes", record.projectContext.routes)}
        ${renderContextRow("Styles", record.projectContext.styleSources)}
        ${renderContextRow("Data", record.projectContext.dataShapes)}
        ${renderContextRow("States", record.projectContext.states)}
        ${renderContextRow("Functions", record.projectContext.reusableFunctions)}
        ${renderContextNotes(record.projectContext.notes)}
      </div>
    </div>
  </article>`;
}

function renderReferenceGroup(reference: ReviewItem, linkedDrafts: ReviewItem[]): string {
  const drafts = linkedDrafts.filter((item) => item.basedOnId === reference.id);
  return `<div class="review-reference-group" data-review-reference-group="${escapeHtmlAttribute(reference.id)}">
    ${renderReviewItem(reference)}
    ${drafts.length > 0 ? `<div class="review-linked-drafts">${drafts.map(renderReviewItem).join("\n")}</div>` : ""}
  </div>`;
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
    <div class="review-item-body">${renderReviewItemBody(item)}${renderReviewItemContext(item)}</div>
    ${item.changeSummary ? `<p class="review-change-summary">${escapeHtml(item.changeSummary)}</p>` : ""}
  </article>`;
}

function renderReviewItemBody(item: ReviewItem): string {
  if (item.kind === "image") {
    if (!item.imagePath) return `<div class="placeholder">Missing image reference.</div>`;
    const alt = item.imageAlt ?? item.title;
    return `<img class="review-reference-image" src="${escapeHtmlAttribute(item.imagePath)}" alt="${escapeHtmlAttribute(alt)}">`;
  }
  return item.html ?? "";
}

function renderReviewItemContext(item: ReviewItem): string {
  const analysis = item.analysisReport ? renderAnalysisReport(item.analysisReport) : "";
  const validations = item.validationReports?.length ? renderValidationReports(item.validationReports) : "";
  if (item.role === "reference" && item.referenceContext) {
    return `<div class="review-context">
      ${renderContextRow("Files", item.referenceContext.sourceFiles)}
      ${renderContextRow("Components", item.referenceContext.components)}
      ${renderContextRow("Routes", item.referenceContext.routes)}
      ${renderContextRow("Styles", item.referenceContext.styleSources)}
      ${renderContextRow("Data", item.referenceContext.dataShapes)}
      ${renderContextRow("States", item.referenceContext.states)}
      ${renderContextNotes(item.referenceContext.notes)}
      ${analysis}
      ${validations}
    </div>`;
  }
  if (item.role === "draft" && (item.reusedComponents?.length || item.sourceContextSummary || validations)) {
    return `<div class="review-context">
      ${renderContextRow("Reused", item.reusedComponents ?? [])}
      ${item.sourceContextSummary ? `<p class="review-context-note">${escapeHtml(item.sourceContextSummary)}</p>` : ""}
      ${analysis}
      ${validations}
    </div>`;
  }
  return analysis || validations ? `<div class="review-context">${analysis}${validations}</div>` : "";
}

function renderAnalysisReport(report: AnalysisReport): string {
  return `<div class="review-context-row">
    <div class="review-context-label">Analyzed From</div>
    <div class="review-context-list">
      <span class="review-context-chip">${escapeHtml(report.framework)}</span>
      <span class="review-context-chip">confidence ${escapeHtml(String(report.confidence))}</span>
    </div>
    ${renderContextRow("Targets", report.targetFiles)}
    ${renderContextRow("Tree", report.componentTree.slice(0, 16))}
    ${renderContextNotes(report.warnings)}
  </div>`;
}

function renderValidationReports(reports: VisualValidationReport[]): string {
  return reports.map((report) => `<div class="review-context-row">
    <div class="review-context-label">Validation</div>
    <div class="review-context-list">
      <span class="review-badge ${escapeHtmlAttribute(report.status)}">${escapeHtml(report.status)}</span>
      <span class="review-context-chip">diff ${(report.diffRatio * 100).toFixed(2)}%</span>
      <span class="review-context-chip">${report.diffPixels}/${report.totalPixels} px</span>
    </div>
    ${report.dimensionMismatch ? `<p class="review-context-note">Dimension mismatch.</p>` : ""}
    ${report.diffImagePath ? `<img class="review-validation-image" src="${escapeHtmlAttribute(report.diffImagePath)}" alt="Visual diff">` : ""}
    ${renderContextNotes(report.warnings)}
  </div>`).join("");
}

function renderContextRow(label: string, values: string[]): string {
  if (values.length === 0) return "";
  return `<div class="review-context-row">
    <div class="review-context-label">${escapeHtml(label)}</div>
    <div class="review-context-list">${values.map((value) => `<span class="review-context-chip">${escapeHtml(value)}</span>`).join("")}</div>
  </div>`;
}

function renderContextNotes(notes: string[]): string {
  if (notes.length === 0) return "";
  return notes.map((note) => `<p class="review-context-note">${escapeHtml(note)}</p>`).join("");
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
