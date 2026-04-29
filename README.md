# visual-companion-mcp

`visual-companion-mcp` is a local MCP server that lets coding agents show interactive HTML screens in a user's browser and read the user's clicks back as structured events.

It is designed for visual collaboration loops such as layout choices, wireframes, diagrams, and UI direction reviews.

## Features

- MCP stdio server with five tools:
  - `start_session`
  - `show_screen`
  - `read_events`
  - `wait_for_selection`
  - `stop_session`
- Bun HTTP + WebSocket runtime.
- Fragment auto-wrap: HTML fragments are wrapped in a built-in frame template.
- Full HTML documents are served as-is with the helper script injected.
- Click events are stored as JSONL on disk.
- Multiple sessions can run in one MCP process on separate local ports.
- Built-in CSS classes for common visual patterns: `.options`, `.cards`, `.mockup`, `.split`, `.pros-cons`.

## Install

```sh
bun install
```

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

Register the binary as a local stdio MCP server:

```sh
claude mcp add visual-companion --scope user -- ./visual-companion-mcp
claude mcp list
```

For a project-shared registration, use `--scope project` instead. Claude Code writes project-scoped servers to `.mcp.json`.

Equivalent `.mcp.json`:

```json
{
  "mcpServers": {
    "visual-companion": {
      "type": "stdio",
      "command": "./visual-companion-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

### Codex

Register the binary with the Codex CLI:

```sh
codex mcp add visual-companion -- ./visual-companion-mcp
codex mcp list
```

Equivalent `~/.codex/config.toml` or project-scoped `.codex/config.toml`:

```toml
[mcp_servers.visual-companion]
command = "./visual-companion-mcp"
```

If the binary is not in the client working directory, use an absolute path for `command`.

## Tool Overview

### `start_session(opts?)`

Starts a local browser session.

Options:

- `host`: bind host. Default: `127.0.0.1`
- `urlHost`: host shown in the returned URL. Default: `localhost`
- `port`: fixed port. Default: auto-select
- `baseDir`: session storage root. Default: `~/.visual-companion-mcp`

Returns `sessionId`, `url`, `host`, `port`, `workDir`, and `eventsPath`.

The tool does not open the browser automatically. The agent should show the returned URL to the user.

### `show_screen({ sessionId, filename, html })`

Writes and displays a screen for the session. If `html` does not start with `<!doctype` or `<html`, it is treated as a fragment and wrapped with the default frame.

### `read_events({ sessionId, clear? })`

Reads click events from the session JSONL file. Use `clear: true` to empty the file after reading.

### `wait_for_selection({ sessionId, timeoutMs? })`

Waits for a click event to arrive. It returns existing unread events immediately, otherwise waits until the timeout.

### `stop_session({ sessionId })`

Stops the local HTTP/WebSocket server for the session.

## Event Format

Browser clicks are written as JSONL:

```json
{"type":"click","choice":"b","text":"Option B","timestamp":1777429599000,"dwellMs":1200}
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
