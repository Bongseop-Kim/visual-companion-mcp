import type {
  RequestUserInput,
  ShowCardsInput,
  ShowChoiceGridInput,
  ShowComparisonInput,
  ShowOptionsInput,
  ShowWireframeInput,
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
      (card) => `<article class="card" data-choice="${escapeHtmlAttribute(card.id)}" data-text="${escapeHtmlAttribute(card.title)}" onclick="toggleSelect(this)">
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
      (choice) => `<article class="choice-card" data-choice="${escapeHtmlAttribute(choice.choiceId)}" data-text="${escapeHtmlAttribute(choice.title)}" onclick="toggleSelect(this)">
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
      (item) => `<article class="card" data-choice="${escapeHtmlAttribute(item.id)}" data-text="${escapeHtmlAttribute(item.title)}" onclick="toggleSelect(this)">
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
  const body =
    input.variant === "mobile"
      ? renderMobileWireframe(sections)
      : input.variant === "split"
        ? renderSplitWireframe(sections)
        : renderDesktopWireframe(sections);

  return `${renderHeading(input.title, input.subtitle)}
<div class="mockup" data-choice="${escapeHtmlAttribute(input.choice)}" data-text="${escapeHtmlAttribute(input.title)}" onclick="toggleSelect(this)">
  <div class="mockup-header">${escapeHtml(input.variant)} wireframe</div>
  <div class="mockup-body">${body}</div>
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

function renderOption(
  option: { id: string; title: string; description?: string | undefined; details: string[] },
  letter: string,
): string {
  return `<div class="option" data-choice="${escapeHtmlAttribute(option.id)}" data-text="${escapeHtmlAttribute(option.title)}" onclick="toggleSelect(this)">
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
  default?: string | number | boolean;
}

function normalizeFormSchema(schema: RequestUserInput["requestedSchema"]): FormSchema {
  if (!schema || schema.type !== "object" || typeof schema.properties !== "object") {
    return {
      properties: {
        response: {
          type: "string",
          title: "Response",
        },
      },
      required: ["response"],
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
