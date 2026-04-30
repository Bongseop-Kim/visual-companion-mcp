# visual-companion-mcp

한국어 | [English](README.md)

`visual-companion-mcp`는 코딩 에이전트가 사용자의 브라우저에 인터랙티브 HTML 화면을 보여주고, 사용자의 클릭을 구조화된 이벤트로 읽을 수 있게 해주는 로컬 MCP 서버입니다.

이 프로젝트는 가장 가볍게 mockup 하나를 띄우는 도구가 되려는 것이 아닙니다. 그런 용도라면 더 단순한 visual companion을 쓰는 편이 낫습니다. 이 도구의 목적은 **복잡한 기존 UI 수정 전**, 현재 화면을 보존하고, 실제 코드 구조를 읽고, 여러 시안을 비교하고, production code를 수정하기 전에 놓친 UI 영역을 줄이는 것입니다.

## 주요 기능

- MCP stdio 서버와 시각 리뷰 도구:
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
  - `attach_reference_context`
  - `read_reference_context`
  - `attach_project_context`
  - `read_project_context`
  - `analyze_project_context`
  - `validate_draft_against_reference`
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
- Bun HTTP + WebSocket 런타임.
- HTML fragment 자동 wrapping. 전체 HTML 문서는 helper script를 주입해 그대로 제공합니다.
- 클릭 이벤트를 JSONL로 저장합니다.
- 여러 세션을 서로 다른 로컬 포트에서 동시에 실행할 수 있습니다.
- 빠른 선택용 template: `show_choice_grid`, `show_options`, `show_cards`, `show_comparison`.
- Review Board: 현재 화면, accepted screen, draft, proposal을 한 화면에 유지합니다.
- 기존 reference와 새 페이지 draft를 위한 자동 정적 코드 분석.
- reference screenshot과 draft screenshot을 비교하는 PNG 기반 visual diff 검증.
- 웹, 모바일, Expo, native app, design tool screenshot을 locked reference로 저장할 수 있습니다.
- wireframe summary를 저장하고 MCP output으로 다시 읽을 수 있습니다.

## 언제 써야 하나

다음 중 2개 이상이 맞으면 `visual-companion-mcp`를 쓰는 것이 좋습니다.

- 대상 화면이 이미 존재하고, 현재 화면을 visual baseline으로 보존해야 한다.
- 요청한 변경이 여러 UI 영역에 동시에 걸쳐 있다.
- 화면에 hidden state, overlay, filter, loading/empty state, dense responsive layout이 있다.
- draft가 기존 route, component, style, data shape, state pattern을 재사용해야 한다.
- 바로 구현하면 test 수정이나 인접 로직 파손 가능성이 있다.
- 현재 화면과 여러 draft, accepted variant를 함께 비교해야 한다.
- 방향을 확정하기 전에 screenshot diff report가 필요하다.

다음 경우에는 더 가벼운 도구가 낫습니다.

- 일회성 sketch
- 단순 layout 선택
- 기존 코드베이스와 무관한 독립적인 visual idea

## 가치 검증 벤치마크

이 프로젝트는 “첫 mockup을 가장 빨리 띄우는 것”이 아니라, **복잡한 기존 UI 수정에서 재작업과 누락을 줄이는 것**으로 가치를 증명해야 합니다.

권장 벤치마크:

- 같은 제품에서 실제 화면 5개를 고릅니다:
  - dense form
  - dashboard
  - filter/list view
  - mobile card screen
  - modal 또는 multi-state flow
- 각 화면마다 기존 component나 test에 영향을 줄 수 있는 작은 visual change 3-7개를 하나의 요청으로 작성합니다.
- 같은 요청을 세 방식으로 수행합니다:
  - lightweight visual companion 먼저 사용 후 구현
  - `visual-companion-mcp` 먼저 사용 후 구현
  - visual draft 없이 바로 구현

평가표:

| Metric | 측정 방법 | 좋은 방향 |
| --- | --- | --- |
| 첫 reviewable draft까지 시간 | 요청부터 사용자가 판단 가능한 첫 화면까지 걸린 분 | 낮을수록 좋음 |
| 의사결정 왕복 수 | 방향이 확정되기 전 user-agent turn 수 | 낮을수록 좋음 |
| 놓친 요청 수 | accepted draft에서 빠진 요청 change 수 | 낮을수록 좋음 |
| 의도치 않은 visual change | 요청하지 않았는데 바뀐 영역 수 | 낮을수록 좋음 |
| 기존 component 재사용 | 보존/재사용된 component, style, data pattern 수 | 높을수록 좋음 |
| 구현 churn | 방향 확정 후 변경된 파일 수 | 낮을수록 좋음 |
| 깨진 검증 | 최종 구현 후 실패한 test/typecheck/build 수 | 낮을수록 좋음 |
| 사용자 confidence | 방향 선택 후 1-5 주관 점수 | 높을수록 좋음 |

권장 scoring:

- 정량 점수: 앞 7개 metric을 0-100으로 normalize 후 평균.
- 정성 점수: 사용자 confidence를 0-100으로 변환.
- 최종 점수: `0.7 * quantitative + 0.3 * qualitative`.

성공 기준:

- `visual-companion-mcp`가 첫 draft까지 더 느린 것은 허용합니다.
- 대신 놓친 변경, 의도치 않은 변경, 구현 churn, 깨진 검증, 의사결정 왕복 수를 줄여야 합니다.
- 5개 benchmark screen 중 최소 3개에서 이기지 못하면 현재 기능 대비 너무 무거운 도구일 가능성이 큽니다.

## 설치

```sh
bun install
bun run compile
```

Codex 등록:

```sh
bun run install:codex
bun run probe:mcp
codex mcp list
```

Claude Code 등록:

```sh
bun run install:claude
bun run probe:mcp
claude mcp list
```

설치 후 Codex 또는 Claude Code를 재시작해야 MCP tool 목록이 갱신됩니다.

## 실행

```sh
bun run src/index.ts
```

MCP client에서 이 프로젝트 디렉터리를 cwd로 하여 위 명령을 실행하도록 설정합니다.

## 빌드

```sh
bun run build
bun run compile
```

`bun run compile`은 `./visual-companion-mcp` 단일 실행 파일을 생성합니다.

## MCP Client 등록

client 등록에는 compiled binary 사용을 권장합니다. 그러면 MCP 서버 실행 시 Bun 런타임이 필요하지 않습니다.

```sh
bun run compile
./visual-companion-mcp
```

두 번째 명령은 MCP stdio 서버를 직접 실행합니다. 정상 실행을 확인한 뒤 `Ctrl-C`로 종료합니다.

### Claude Code

사용자 scope 설치:

```sh
bun run install:claude
claude mcp list
```

프로젝트 공유 등록:

```sh
bun run install:claude -- --project
```

동등한 `.mcp.json` 예:

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

### Codex

권장 설치:

```sh
bun run install:codex
```

Codex CLI로 직접 등록:

```sh
codex mcp add visual-companion -- /absolute/path/to/visual-companion-mcp
codex mcp list
```

동등한 `~/.codex/config.toml` 예:

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
  "attach_reference_context",
  "read_reference_context",
  "attach_project_context",
  "read_project_context",
  "analyze_project_context",
  "validate_draft_against_reference",
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

경로는 가능하면 절대 경로를 사용하세요. MCP 서버를 추가하거나 변경한 뒤에는 새 Codex session을 시작해야 tool 목록이 갱신됩니다.

`Auth: Unsupported`는 정상입니다. 이 로컬 stdio 서버는 OAuth나 remote auth를 사용하지 않습니다.

tool이 보이지 않으면 이 저장소에서 직접 확인합니다.

```sh
bun run probe:mcp
```

## 권장 Visual Review 흐름

제품 UI 작업에서는 기본적으로 “현재 코드 우선”으로 접근합니다.

1. 대상 route, component tree, style, fixture, project frontend guide를 확인합니다.
2. `start_session`을 호출합니다.
3. 기존 화면이 있으면 current screen baseline을 먼저 보여줍니다.
4. 여러 draft가 필요하면 `show_review_board`를 사용합니다.
5. 실제 current screen은 `request_reference_image` 또는 `import_reference_image`로 locked reference로 저장합니다.
6. `analyze_project_context`로 target route/component/style/data/state를 분석합니다.
7. 분석 결과는 `read_reference_context` 또는 `read_project_context`로 확인합니다.
8. `add_draft_for_reference`로 reference에 연결된 draft를 추가합니다.
9. draft screenshot이 있으면 `validate_draft_against_reference`로 PNG diff report를 붙입니다.
10. 사용자가 선택하면 `wait_for_selection` 또는 `read_events`로 feedback을 읽습니다.

중요한 원칙:

- screenshot은 reference material입니다. 구현의 source of truth는 기존 code structure입니다.
- current/reference screen은 draft 수정 중 사라지면 안 됩니다.
- 복잡한 화면은 modal, sheet, popover, dropdown, toast, validation, empty/loading state를 한 번에 비교 가능하게 펼쳐 보여주는 편이 좋습니다.
- 한 draft만 수정할 때는 `update_draft_for_reference`를 사용합니다. 전체 board를 갈아엎지 않습니다.

## 주요 도구 개요

### `start_session(opts?)`

로컬 browser session을 시작하고 `sessionId`, `url`, `workDir`, `eventsPath`를 반환합니다.

### `show_screen({ sessionId, filename, html, delivery?, patchSelector?, clearEvents? })`

HTML fragment 또는 전체 HTML 문서를 session browser에 표시합니다.

### `show_choice_grid`, `show_options`, `show_cards`, `show_comparison`

빠른 선택과 비교를 위한 built-in template입니다. 단순 A/B/C 선택에는 raw `show_screen`보다 이 도구들이 낫습니다.

### `show_wireframe`

desktop, mobile, split wireframe을 표시합니다. `wireframeSummary`를 함께 저장할 수 있습니다.

### `show_review_board`

Reference, Draft, Proposal 섹션을 가진 Review Board를 생성합니다. 현재 화면, accepted screen, active draft를 보존하면서 비교할 때 사용합니다.

### `add_draft_for_reference`

기존 reference item에 연결된 HTML draft를 추가합니다.

기본적으로 reference에는 implementation context가 있어야 합니다. `allowMissingContext: true`는 의도적으로 throwaway review를 할 때만 사용하세요.

### `update_draft_for_reference`

기존 draft 하나만 수정합니다. reference, proposal, image item은 수정하지 않습니다.

### `attach_reference_context` / `read_reference_context`

reference item에 source files, components, routes, style sources, data shapes, states, notes를 저장하고 읽습니다.

### `attach_project_context` / `read_project_context`

아직 current reference가 없는 새 페이지용 project context를 저장하고 읽습니다.

### `analyze_project_context`

대상 프로젝트를 정적 TypeScript/JSX 분석으로 읽습니다.

감지 항목:

- route file
- component names
- imports
- React Native core components
- `StyleSheet.create`
- `className`
- `style` prop
- data type
- state/data hook

`referenceItemId`를 주면 reference context에 저장하고, `contextId`를 주면 project context에 저장합니다.

앱 실행, simulator 실행, browser capture는 하지 않습니다.

### `validate_draft_against_reference`

locked reference screenshot과 draft screenshot PNG를 비교합니다.

결과:

- diff ratio
- diff pixel count
- passed/warning/failed status
- diff image
- Review Board의 draft item에 validation report 저장

두 이미지는 PNG이며 크기가 같아야 합니다. `draftImagePath`는 필수입니다.

### `import_reference_image`

로컬 `.png`, `.jpg`, `.jpeg`, `.webp` screenshot을 locked current reference로 가져옵니다.

### `request_reference_image`

브라우저에 paste/drop upload 화면을 띄웁니다. 사용자는 web, mobile, Expo, native app, design tool screenshot을 붙여넣거나 선택할 수 있습니다.

### `read_review_board`

session directory에 저장된 Review Board 상태를 읽습니다.

### `read_events` / `wait_for_selection`

사용자가 browser에서 클릭한 선택 이벤트를 읽습니다.

### `request_user_input`

MCP elicitation을 지원하는 client에서는 form/url mode로 입력을 요청하고, 지원하지 않으면 browser fallback을 사용합니다.

### `stop_session`

로컬 HTTP/WebSocket session을 종료합니다.

## 개발

```sh
bun install
bun test
bun run typecheck
bun run build
bun run compile
bun run probe:mcp
```

## 현재 한계

- `analyze_project_context`는 정적 분석입니다. runtime DOM tree나 React Native runtime tree를 직접 읽지 않습니다.
- `validate_draft_against_reference`는 자동 screenshot capture를 하지 않습니다. draft PNG를 직접 제공해야 합니다.
- 복잡한 alias, monorepo, custom routing, dynamic imports는 일부 누락될 수 있습니다.
- 단순한 visual sketch에는 이 도구가 과할 수 있습니다.
