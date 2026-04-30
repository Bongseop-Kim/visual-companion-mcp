# visual-companion-mcp

`visual-companion-mcp` is a local MCP server that lets coding agents show interactive HTML screens in a user's browser and read the user's clicks back as structured events.

It is designed for visual collaboration loops such as layout choices, wireframes, diagrams, and UI direction reviews.

## Features

- MCP stdio server with template, input, and session tools:
  - `start_session`
  - `show_screen`
  - `show_options`
  - `show_cards`
  - `show_choice_grid`
  - `show_comparison`
  - `show_wireframe`
  - `show_review_board`
  - `update_review_item`
  - `add_draft_for_reference`
  - `update_draft_for_reference`
  - `add_review_items`
  - `accept_review_item`
  - `archive_review_item`
  - `import_reference_image`
  - `request_reference_image`
  - `read_review_board`
  - `read_events`
  - `wait_for_selection`
  - `read_current_wireframe_summary`
  - `request_user_input`
  - `stop_session`
- Bun HTTP + WebSocket runtime.
- Fragment auto-wrap: HTML fragments are wrapped in a built-in frame template.
- Full HTML documents are served as-is with the helper script injected.
- Click events are stored as JSONL on disk.
- Multiple sessions can run in one MCP process on separate local ports.
- Fast choice templates for common selection loops; use `show_choice_grid`, `show_options`, `show_cards`, or `show_comparison` before falling back to raw `show_screen`.
- Review Board state for multi-draft reviews; reference items such as current and accepted screens are preserved while individual drafts or proposals are updated.
- Universal screenshot reference capture; users can paste or drop web, mobile, Expo, native app, or design-tool screenshots into the browser session as locked references.
- Optional lightweight wireframe summaries can be saved beside wireframe screens and read back as structured MCP output.
- Built-in CSS classes for common visual patterns: `.options`, `.cards`, `.choice-grid`, `.mockup`, `.split`, `.pros-cons`.

## Install

```sh
bun install
bun run compile
```

To register with Codex using the recommended local configuration:

```sh
bun run install:codex
bun run probe:mcp
codex mcp list
```

To register with Claude Code:

```sh
bun run install:claude
bun run probe:mcp
claude mcp list
```

Restart Codex or Claude Code after installation so the current session reloads MCP tools.

## Run

```sh
bun run src/index.ts
```

Configure your MCP client to launch the command above from this project directory.

## Build

```sh
bun run build
bun run compile
```

`bun run compile` produces a single executable at `./visual-companion-mcp`.

## Register With MCP Clients

Use the compiled binary for client registration so the MCP server does not require Bun at runtime:

```sh
bun run compile
./visual-companion-mcp
```

The second command starts the MCP stdio server. Stop it with `Ctrl-C` after confirming it launches.

### Claude Code

Recommended user-scoped install:

```sh
bun run install:claude
claude mcp list
```

For a project-shared registration:

```sh
bun run install:claude -- --project
```

The script runs Claude Code's MCP CLI with the compiled binary's absolute path:

```sh
claude mcp add visual-companion --scope user -- /absolute/path/to/visual-companion-mcp
```

Use `--scope project` for a project-shared registration. Claude Code writes project-scoped servers to `.mcp.json`.

Equivalent `.mcp.json`:

```json
{
  "mcpServers": {
    "visual-companion": {
      "type": "stdio",
      "command": "/absolute/path/to/visual-companion-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

After adding or changing an MCP server, restart Claude Code so the available tool list is refreshed.

### Codex

Recommended one-command local config install:

```sh
bun run install:codex
```

The script writes `~/.codex/config.toml`, creates `~/.codex/config.toml.bak` when it replaces an existing config, and sets `command`, `cwd`, `required`, timeouts, and `enabled_tools`.

You can also register the binary with the Codex CLI:

```sh
codex mcp add visual-companion -- /absolute/path/to/visual-companion-mcp
codex mcp list
```

Equivalent `~/.codex/config.toml` or project-scoped `.codex/config.toml`:

```toml
[mcp_servers.visual-companion]
command = "/absolute/path/to/visual-companion-mcp"
cwd = "/absolute/path/to/visual-companion-mcp-repo"
enabled = true
required = true
startup_timeout_sec = 5
tool_timeout_sec = 120
enabled_tools = [
  "start_session",
  "show_screen",
  "show_options",
  "show_cards",
  "show_choice_grid",
  "show_comparison",
  "show_wireframe",
  "show_review_board",
  "update_review_item",
  "add_draft_for_reference",
  "update_draft_for_reference",
  "add_review_items",
  "accept_review_item",
  "archive_review_item",
  "import_reference_image",
  "request_reference_image",
  "read_review_board",
  "read_events",
  "wait_for_selection",
  "read_current_wireframe_summary",
  "request_user_input",
  "stop_session",
]
```

Use an absolute path unless you are certain the MCP client launches from this repository directory.
After adding or changing an MCP server, start a new Codex session so the available tool list is refreshed.
`Auth: Unsupported` is expected for this local stdio server because it does not use OAuth or remote authentication.
`required = true` makes startup failures visible instead of silently continuing without the MCP tools.

If Codex shows `Tools: (none)`, verify the server directly from this repository:

```sh
bun run probe:mcp
```

Expected output:

```json
{
  "tools": [
    "start_session",
    "show_screen",
    "show_options",
    "show_cards",
    "show_choice_grid",
    "show_comparison",
    "show_wireframe",
    "show_review_board",
    "update_review_item",
    "add_draft_for_reference",
    "update_draft_for_reference",
    "add_review_items",
    "accept_review_item",
    "archive_review_item",
    "import_reference_image",
    "request_reference_image",
    "read_review_board",
    "read_events",
    "wait_for_selection",
    "read_current_wireframe_summary",
    "request_user_input",
    "stop_session"
  ],
  "resources": [
    {
      "name": "visual-companion-usage",
      "uri": "visual-companion://usage"
    }
  ],
  "prompts": [
    "show_visual_draft",
    "compare_two_layouts",
    "collect_design_feedback",
    "review_mobile_desktop",
    "choose_visual_direction"
  ]
}
```

This server also exposes a discovery resource and prompt so tool-oriented clients can find the intended workflow even if they inspect resources or prompts before tools:

- Resource: `visual-companion://usage`
- Prompts: `show_visual_draft`, `compare_two_layouts`, `collect_design_feedback`, `review_mobile_desktop`, `choose_visual_direction`

For projects where visual review is common, add this to the project `AGENTS.md`:

```md
## Visual Review

When the user asks to show a UI draft, prototype, screen mockup, visual option,
A/B choice, layout review, or clickable preview, use the `visual-companion`
MCP server immediately.

Default to current-code-first visual review. In product UI work, the normal goal
is to show the current page or component as it exists in the codebase, then make
targeted visual changes with the user. If the requested page or component does
not exist yet, inspect nearby routes, shared components, design tokens, and data
patterns, then create a new draft that fits the existing product instead of
starting from a generic blank concept.

For hidden, blocking, or sequential UI states, separate real behavior from review
coverage. Show the real current state first. When the goal is visual review,
also expose relevant modals, sheets, popovers, dropdowns, toasts, validation
states, empty/loading states, and wizard/form steps as stacked or side-by-side
review states so the user can judge them at once. Preserve one-step-at-a-time
interaction only when the user is reviewing the actual interaction flow.

Use this flow:
1. Inspect the target route, component tree, styles, fixtures, and project
   frontend guidance. When the target exists, run or inspect the existing app so
   the first visual draft matches the real current screen. When it does not
   exist, inspect the closest comparable screens and clearly state that the draft
   is new but based on those existing patterns.
2. Call `start_session`.
3. Render the current screen baseline first when one exists, or make the first
   draft a small variant of that baseline. Preserve real layout, copy, spacing,
   navigation, data shape, and interaction states unless the user asked to change
   them. For a new page, preserve the surrounding product structure and reuse
   established components and states.
4. If the screen includes overlays or multi-step flows, include a review view
   that expands the important states after the baseline unless the user only
   asked for exact runtime behavior.
5. For multi-draft reviews, use `show_review_board`; for any real current
   screen shown in web, mobile, Expo, native apps, or design tools, prefer
   `request_reference_image` so the user can paste or drop a screenshot as a
   locked baseline. Use `import_reference_image` when a local image file path is
   already available. Add and revise HTML variants with
   `add_draft_for_reference` and `update_draft_for_reference`. For later
   advanced edits use `update_review_item`, `add_review_items`,
   `accept_review_item`, or `archive_review_item`. For fast one-off choices,
   prefer `show_choice_grid`, `show_options`, `show_cards`, or
   `show_comparison`; use `show_screen` for custom HTML.
6. Give the returned URL to the user and state what source page/component it is
   based on.
7. If feedback is needed, use `wait_for_selection` with the returned
   `screenVersion` as `sinceScreenVersion`, or use `read_events`.
8. For wireframe handoff, call `read_current_wireframe_summary` after a
   `show_wireframe` or `show_choice_grid` call that saved `wireframeSummary`.

Do not search MCP resources first for visual-companion. It is primarily a
tool-oriented MCP server.

Before making frontend or screen drafts, check the target project's own
`AGENTS.md` and follow any project-local frontend or screen guidance first.
When showing many draft variants in the browser, prefer vertical stacking or
responsive wrapping by default so the review page scrolls vertically. Use
horizontal scrolling only when the draft itself is intentionally demonstrating a
horizontal-scroll interaction.

When a review includes multiple drafts, accepted screens, or the current
implementation as a baseline, use Review Board tools. Put protected current or
accepted screens in `reference` items, active alternatives in `draft` items, and
new ideas in `proposal` items. Later requests to change one linked draft should
call `update_draft_for_reference`; use `update_review_item` only for advanced
board edits instead of replacing the whole browser view.
```

## Tool Overview

### `start_session(opts?)`

Starts a local browser session.

Options:

- `host`: bind host. Default: `127.0.0.1`
- `urlHost`: host shown in the returned URL. Default: `localhost`
- `port`: fixed port. Default: auto-select
- `baseDir`: session storage root. Default: `~/.visual-companion-mcp`

If `baseDir` points at a Git worktree root, session files are stored under that
repo's `.visual-companion-sessions/` directory. The MCP server adds that path to
the repo's local `.git/info/exclude` file so random session folders do not
appear in `git status`.

Returns `sessionId`, `url`, `host`, `port`, `workDir`, and `eventsPath`.

The tool does not open the browser automatically. The agent should show the returned URL to the user.

### `show_screen({ sessionId, filename, html, delivery?, patchSelector?, clearEvents? })`

Writes and displays a screen for the session. If `html` does not start with `<!doctype` or `<html`, it is treated as a fragment and wrapped with the default frame.

By default, fragments are sent to the browser with a live `patch-html` update against `.vc-frame`, while full HTML documents reload the page. Use `delivery: "reload"` to force a reload, `delivery: "patch-html"` to patch a selector, or `delivery: "replace-body"` to replace the body contents. `clearEvents` defaults to `false` for raw screens.

Returns `screenVersion`; pass it to `wait_for_selection({ sinceScreenVersion })` to ignore stale selections from earlier screens.

### `show_options({ sessionId, filename, title, subtitle?, options, multiselect?, clearEvents? })`

Writes and displays a selectable option list. Each option needs `id` and `title`, with optional `description` and `details`.

Choice-oriented template tools clear previous events by default.

### `show_cards({ sessionId, filename, title, subtitle?, cards, clearEvents? })`

Writes and displays selectable cards. Each card needs `id` and `title`, with optional `description`, `details`, and `imageLabel`.

### `show_choice_grid({ sessionId, filename, title, subtitle?, choices, clearEvents?, wireframeSummary? })`

Writes and displays a dense visual choice grid for fast option picking. Each choice needs `choiceId` and `title`, with optional `thumbHtml`, `bullets`, and `badge`.

When `wireframeSummary` is provided, the server saves it beside the rendered HTML as `{filename}.wireframe-summary.json` and returns `wireframeSummaryPath`.

### `show_comparison({ sessionId, filename, title, subtitle?, items, clearEvents? })`

Writes and displays a selectable comparison. Each item supports `description`, `details`, `pros`, and `cons`.

### `show_wireframe({ sessionId, filename, title, subtitle?, variant?, sections?, clearEvents?, wireframeSummary? })`

Writes and displays a selectable wireframe. `variant` can be `desktop`, `mobile`, or `split`.

`wireframeSummary` is a lightweight structure handoff, not a design spec. Keep it to screen purpose, layout pattern, regions, primary action, choices, notes, and constraints.

### Review Board tools

Use Review Board tools for multi-draft visual review where current screens,
accepted drafts, or pinned references must not disappear during later edits.

Review items have `id`, `role`, `title`, and either HTML content or image metadata. Roles are:

- `reference`: preserved baseline item, such as `referenceType: "current"` or `referenceType: "accepted"`.
- `draft`: active comparison or modification candidate.
- `proposal`: new candidate that should not replace existing references or drafts.

Accepted references are locked by default.

### `show_review_board({ sessionId, boardId, title?, filename?, currentReferenceId?, items })`

Creates or replaces a board and renders visible items as Reference, Draft, and Proposal sections.

### `update_review_item({ sessionId, boardId, itemId, html, title?, changeSummary?, filename? })`

Updates exactly one board item and re-renders the full board. Other references,
drafts, and proposals are preserved. Locked references cannot be updated.

### `add_draft_for_reference({ sessionId, boardId, referenceItemId, draftId, title, html, changeSummary?, filename? })`

Adds a single HTML draft linked to an existing reference item. Use this after
`request_reference_image` or `import_reference_image` so the real current screen
stays fixed while the draft appears beside it.

### `update_draft_for_reference({ sessionId, boardId, draftId, html, title?, changeSummary?, filename? })`

Updates one existing HTML draft only. It refuses to update reference, proposal,
or image items, which keeps the baseline safe during rapid visual iteration.

### `add_review_items({ sessionId, boardId, items, filename? })`

Adds new items to an existing board without replacing existing items.

### `accept_review_item({ sessionId, boardId, itemId, filename? })`

Promotes an item to `role: "reference"`, `referenceType: "accepted"`, and
`locked: true`. Existing accepted references remain on the board.

### `archive_review_item({ sessionId, boardId, itemId, filename? })`

Hides a mutable item from the default render without deleting it. Locked
references cannot be archived.

### `import_reference_image({ sessionId, boardId, itemId, title, imagePath, imageAlt?, filename? })`

Imports a local `.png`, `.jpg`, `.jpeg`, or `.webp` screenshot as a locked
current reference item on a Review Board. The image is copied into the session's
`assets/` directory and rendered beside later drafts without replacing existing
references or drafts.

Use this for Expo, React Native, native mobile, or manually captured screens
where the real current UI should be preserved as the source-of-truth reference
instead of being recreated as HTML.

### `request_reference_image({ sessionId, boardId, itemId, title, imageAlt?, filename?, timeoutMs? })`

Shows a paste/drop upload screen in the browser session. The user can paste,
drop, or choose a PNG, JPEG, or WebP screenshot from any source, and the server
saves it as a locked current reference item on the Review Board.

Use this as the default current-screen baseline flow when the user already has a
screen visible. It avoids runtime-specific automation and works the same for web,
mobile, Expo, native apps, and design tools.

### `read_review_board({ sessionId, boardId })`

Reads the persisted board state from the session directory.

### `read_events({ sessionId, clear? })`

Reads click events from the session JSONL file. Use `clear: true` to empty the file after reading.

### `wait_for_selection({ sessionId, timeoutMs?, sinceScreenVersion? })`

Waits for a click event to arrive. It returns existing unread events immediately unless `sinceScreenVersion` is provided, in which case only newer events are returned.

### `read_current_wireframe_summary({ sessionId })`

Reads the latest saved wireframe summary for a session and returns `screenVersion`, `filename`, `wireframeSummaryPath`, `wireframeSummary`, and relevant events for that screen. If no summary has been saved, it returns an empty event list and no summary fields.

### `request_user_input({ modePreference?, message, requestedSchema?, sensitive?, url?, sessionId? })`

Requests structured input with MCP Elicitation when available. `auto` first tries non-sensitive form elicitation and falls back to a browser form when `sessionId` is provided. Sensitive input must use URL mode and provide `url`.

### `stop_session({ sessionId })`

Stops the local HTTP/WebSocket server for the session.

## Event Format

Browser clicks are written as JSONL:

```json
{"type":"click","choice":"b","text":"Option B","timestamp":1777429599000,"dwellMs":1200,"screenVersion":2}
```

## Fragment Example

```html
<h2>Which layout should we use?</h2>
<p class="subtitle">Click one option in the browser.</p>

<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Sidebar</h3>
      <p>Persistent navigation with a dense work area.</p>
    </div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>Top Tabs</h3>
      <p>Wide content area with mode switching across the top.</p>
    </div>
  </div>
</div>
```

## Security Model

This server is intended for local use with trusted coding agents. HTML and scripts provided to `show_screen` run in the user's local browser. Do not expose the HTTP server to untrusted networks or render untrusted HTML.

For WSL or remote container setups, bind separately from the returned URL host:

```json
{
  "host": "0.0.0.0",
  "urlHost": "localhost"
}
```
