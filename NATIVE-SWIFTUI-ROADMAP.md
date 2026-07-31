# Saxjax Monitor Native SwiftUI Roadmap

## Prototype status

The browser dashboard is a validated functional prototype for a native macOS Ollama monitor. It is already running against real local and LAN inference traffic.

What is proven:

- A monitored Ollama-compatible gateway on port `11435` forwards traffic to Ollama’s standard local port `11434` without reconfiguring Ollama.
- An optional second listener supports advanced transparent LAN configurations.
- Chat, generate, and OpenAI-compatible chat-completion requests are captured.
- Prompts, message roles, streamed responses, model reasoning, request timing, Ollama token counts, and errors are visible in real time.
- Requests are grouped and color-coded by explicit session identifiers when available, with a deterministic fallback when they are not.
- The interface shows the resident model, allocation, processor placement, context capacity, CPU pressure, memory, swap, Ollama controller memory, disk, uptime, and hardware-core activity.
- Request rows are newest-first, filterable by session, and use a one-open-at-a-time accordion.
- IN and OUT previews are limited to ten lines. Full content opens in a dedicated reader.
- Manual scrolling is never overridden while a model is generating. Auto-follow disengages when the user scrolls away.
- The browser prototype restores page position, inference-list position, selected session, open request, and follow mode after reload.
- Completed traffic is persisted locally with user-only permissions.

Important limitations to preserve honestly in the native app:

- Per-core bars show system-wide hardware-core activity, not guaranteed Ollama thread affinity.
- The processor value reported by `ollama ps` describes model allocation, not a live GPU utilization percentage.
- Context use is estimated from captured text while a request is active. Exact input-token counts replace the estimate only when Ollama reports completion metrics.
- The gateway keeps a bounded recent history in memory and stores completed records locally. Clear view permanently deletes the disk history and purges the shared in-memory history.
- Prompt and response contents are sensitive local data.

## Native product direction

Build a native macOS SwiftUI application named **Saxjax Monitor**. Treat the current browser dashboard as the behavioral and visual prototype.

Version 1 replaces the browser interface, not the gateway. It connects to the existing local gateway and consumes its state endpoint and Server-Sent Events stream. Do not embed a web view and do not duplicate the proxy in the first milestone.

The single post-read goal of this document is: an Xcode coding assistant can create a working native app that connects to the running monitor gateway and matches the prototype's behavior.

## Data source

Use a configurable base URL with this default:

`http://127.0.0.1:11435`

Consume:

- `GET /monitor/api/state` for the initial snapshot and reconnect recovery.
- `GET /monitor/events` for Server-Sent Events.

Supported event names:

- `state`: full metrics, active requests, recent history, and counters.
- `metrics`: refreshed machine and Ollama metrics.
- `request-started`: a newly observed inference request.
- `token`: one streamed response or reasoning fragment.
- `request-finished`: the final request state, metrics, HTTP status, and error.

A request contains:

- Stable request ID and API path.
- Requested model.
- Prompt and role-based messages.
- Response and optional reasoning text.
- Client identity and address.
- Session ID, short label, and identity source.
- Error details when present.
- Start and finish timestamps, state, and HTTP status.
- Ollama completion metrics: total and load duration, input tokens and duration, output tokens and duration.

Machine metrics contain:

- Ollama online state and version.
- CPU used percentage.
- Memory free percentage.
- Swap used and total.
- One-, five-, and fifteen-minute load averages.
- Uptime and disk space.
- Logical and physical core counts and Apple performance/efficiency topology when available.
- Per-core system activity samples.
- Ollama controller CPU, resident memory, process count, and resident-model records.
- Active, total, and error request counters.

Implement Codable domain models with tolerant decoding. Missing fields must produce an explicit unavailable state instead of crashing or inventing values.

## App architecture

Use SwiftUI with a small, testable architecture:

- `MonitorClient`: initial state fetch, SSE connection, decoding, reconnect with bounded exponential backoff, and connection status.
- `MonitorStore`: `@MainActor` observable state, request ordering, session grouping, token accumulation, counters, and selection.
- Domain models: request, session, request metrics, machine metrics, core sample, resident model, and connection state.
- Views: dashboard, compact system details, meters, core activity, inference wire, request row, content reader, throughput, and settings.
- Persistence: store only UI state in app preferences. Do not create another prompt/response archive; the gateway remains the source of persisted traffic.

Use native networking and Swift concurrency. Keep parsing and state reduction independent of SwiftUI so they can be unit tested from captured JSON and SSE fixtures.

Reconnect behavior:

1. Mark the connection as reconnecting without clearing visible data.
2. Retry the SSE stream with bounded exponential backoff.
3. Fetch a fresh state snapshot after reconnect.
4. Merge by request ID so requests and streamed text are not duplicated.

## Screen specification

Use the prototype's industrial observatory aesthetic: near-black background, subtle green texture, hairline dividers, mint for live/healthy state, amber for estimates and efficiency cores, red only for failures, a serif display face, and a compact monospaced data face.

The vertical order is fixed:

1. Masthead with app identity, gateway/Ollama connection state, Ollama version, and clock.
2. System details row: resident model, understandable CPU load explanation, and Ollama controller memory.
3. Compact CPU, memory, and swap meters.
4. Hardware Core activity, dynamically sized to the machine's reported core topology.
5. Inference wire with session filter, Follow newest, and Clear view.
6. Throughput counters and operational facts.

The window must be useful at laptop width and remain readable when narrowed. Prefer compact density over large decorative cards.

### System details

- Resident model: name, allocation, processor placement, and context capacity.
- Work competing for CPU: show `one-minute load / logical cores`, followed by plain-language status. Explain that values below the core count indicate headroom. Also show five- and fifteen-minute values.
- Ollama service RAM: clearly state that this is controller/process memory and that model allocation is shown separately.

### Meters and cores

- CPU meter: system CPU used.
- Memory meter: used unified memory, derived from the reported free percentage.
- Swap meter: used percentage plus used/total GiB.
- Core grid: create exactly as many cells as the machine reports. Label performance cores `P0...`, efficiency cores `E0...`, and unknown topology `CPU0...`.
- Show the actual hardware index and current system activity percentage for each cell.
- Include a visible note that core activity is system-wide.

### Inference wire

- Newest requests appear first.
- Color-code stable session identity and provide an All sessions selector.
- Only one request may be expanded at a time.
- A new request opens automatically only when Follow newest is enabled and the user has not manually moved away.
- Manual scrolling immediately disengages Follow newest. Streaming tokens must never change the user's scroll position.
- Preserve the selected session, open request, list position, and window position across app restoration.
- Collapsed rows show session, requested model, timestamp, latency, token throughput, and context use.
- Failed collapsed rows still show the requested model but hide textual error details and unavailable-context explanations.
- Expanding a failed row reveals the full error in OUT and the unavailable context state.
- An active request with no output must display an empty waiting state, never the word `ERROR`.
- Limit inline IN and OUT previews to ten lines.
- Clicking IN or OUT opens a native sheet or inspector containing the entire content, model, time, context status, character count, and line count.
- Optional reasoning appears in a secondary disclosure section.

### Context and token states

- Active with known model capacity: show estimated input tokens, estimated percent, and label the value as an estimate.
- Completed with reported input count: show exact input tokens and exact percentage.
- Completed without a reported count: show Not reported.
- Failed without metrics: show Unavailable only inside the expanded error row.
- Use warning styling at 70% and danger styling at 90% of context capacity.
- Output throughput is `output tokens / output duration` when both are available.

## Privacy and safety

- Assume prompts and responses may contain private source code, credentials, or personal data.
- Do not send telemetry outside the Mac.
- Do not add analytics, crash upload, cloud sync, or third-party SDKs.
- Do not log full prompt or response bodies from the native app.
- Make the gateway URL configurable, but visibly warn before connecting to a non-loopback host.
- The full-content reader must not copy automatically or expose text in notifications.

## Implementation phases

1. Domain models, tolerant JSON decoding, and fixture tests.
2. Initial state client and a static native dashboard populated from the live gateway.
3. SSE client, streamed token accumulation, reconnect, and request lifecycle updates.
4. Sessions, accordion, full-content reader, context states, and error presentation.
5. Scroll stability, restoration, keyboard navigation, accessibility, and reduced-motion behavior.
6. Packaging, app icon, settings, diagnostics, and release verification.

Do not begin a later phase until the previous phase has executable tests.

## Acceptance criteria

The native app is equivalent to the prototype when all of these pass:

1. Launching while the gateway is running shows the correct resident model and machine metrics without manual refresh.
2. A request arriving through the standard LAN Ollama port appears before inference completes.
3. Response and reasoning fragments append in real time without duplicate text.
4. Exact Ollama token counts replace estimates at completion.
5. Manually scrolling during an active generation leaves both page and request-list positions unchanged while output continues growing.
6. Relaunch restores the selected session, open request, follow setting, and previous reading position.
7. A failed request shows its requested model in the collapsed header and shows the error explanation only after expansion.
8. An active empty response never displays `ERROR`.
9. IN and OUT previews stop at ten lines, and the full reader shows every captured character.
10. Only one request is expanded at a time.
11. Core cells match the reported machine core count and retain the system-wide qualifier.
12. Disconnecting the gateway keeps the last data visible, changes connection state, and reconnects without duplicate requests.
13. VoiceOver can identify sections, controls, session labels, request state, context use, and core activity.
14. No prompt or response content leaves the machine or appears in native-app logs.

## Copy-ready prompt for Xcode

Paste the following into Xcode's coding assistant after creating a new macOS SwiftUI app project:

> Build a native macOS SwiftUI application named **Saxjax Monitor**. The existing browser dashboard is a validated prototype; this app must reproduce its behavior natively and must not use WebKit or embed the website.
>
> For version 1, keep the existing Ollama monitoring gateway as the backend. Connect to `http://127.0.0.1:11435`, fetch `/monitor/api/state`, and consume `/monitor/events` as Server-Sent Events. Implement tolerant Codable models and a testable `MonitorClient` plus a `@MainActor` observable store. Use Swift concurrency, reconnect with bounded exponential backoff, refetch state after reconnect, and merge requests by stable ID without duplicating streamed text.
>
> Decode these SSE event types: `state` for the complete snapshot, `metrics` for machine updates, `request-started` for a new inference, `token` for response or reasoning fragments, and `request-finished` for final timing, token metrics, HTTP state, and errors. Model request identity, API path, requested model, prompt/messages, response, reasoning, client, session, timestamps, status, HTTP status, error, and Ollama timing/token metrics. Model Ollama connection/version, machine CPU/memory/swap/load/uptime/disk/core topology, per-core activity, Ollama process memory/CPU, resident models, and request counters. Treat missing values as unavailable.
>
> Reproduce this screen order: masthead; compact System details row; small CPU/MEM/SWAP meters; dynamic Hardware Core activity; Inference wire; Throughput. Match an industrial local-observatory aesthetic using near-black, mint, amber, restrained red, hairline dividers, serif display typography, and compact monospaced telemetry. Do not make oversized dashboard cards.
>
> Inference requests are newest-first, color-coded by session, filterable by session, and use a strict one-open-at-a-time accordion. Collapsed rows show the requested model and normal request metadata. For failed rows, hide textual error details and unavailable-context explanations until the row is expanded. An active response with no output must remain blank and must never default to `ERROR`. Limit IN and OUT previews to ten lines; clicking either opens the full captured content in a native sheet or inspector.
>
> Show estimated context use while active and replace it with exact Ollama input-token counts at completion. Clearly distinguish Exact, Estimated, Not reported, and Unavailable states. Warn at 70% context and show danger at 90%. Calculate output tokens per second only from reported output count and duration.
>
> Streaming tokens must never force scrolling. If the user manually scrolls away, disengage Follow newest until they enable it again. Preserve selected session, open request, follow setting, request-list position, and reading position across app restoration. A genuinely new request may open and move to newest only while Follow newest remains enabled.
>
> Display resident model allocation and processor placement, understandable one/five/fifteen-minute load information, Ollama controller memory, CPU, unified memory, swap, disk, uptime, and one cell per reported hardware core. Label Apple performance and efficiency cores when topology is available. State clearly that core bars are system-wide activity and that model processor placement is not live GPU utilization.
>
> Keep all data local. Add no analytics, cloud sync, third-party SDKs, or prompt/response logging. Warn before using a non-loopback gateway URL.
>
> Work in phases: models and fixture tests; initial state dashboard; SSE streaming and reconnect; request interactions and content reader; persistence/accessibility; packaging. After each phase, run its tests and show me the result before continuing. Do not invent missing backend values or silently weaken any requirement.
>
> The executable acceptance checklist is: (1) live resident-model and machine metrics appear at launch; (2) a request through the LAN Ollama port appears before completion; (3) response and reasoning fragments stream without duplication; (4) exact token counts replace estimates; (5) manual scrolling remains fixed while active output grows; (6) relaunch restores session, open row, follow mode, and reading position; (7) a failed collapsed row shows its requested model while error details appear only after expansion; (8) an active empty response never displays `ERROR`; (9) IN/OUT previews stop at ten lines and the reader shows all content; (10) only one request is expanded; (11) core-cell count matches hardware and is labeled system-wide; (12) gateway disconnect keeps last data visible and reconnect does not duplicate requests; (13) VoiceOver identifies sections, controls, request state, context, and cores; and (14) no prompt or response content leaves the Mac or appears in app logs. Create unit tests for decoding and state reduction and UI tests for these behaviors.
