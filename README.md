# Saxjax Monitor for Ollama

A local, dependency-free macOS dashboard for Ollama and GitHub Copilot
communications, Copilot credit usage, and machine health. It shows full prompts,
responses, reasoning and tool activity from Copilot CLI, VS Code, and VS Code
Insiders alongside context use, loaded models, CPU cores, unified memory, swap,
load, throughput, and errors.

The dashboard runs entirely on your Mac. It includes a small native AppKit
launcher with a draggable floating-widget mode; the monitor UI itself is the
validated web prototype described in [Native SwiftUI roadmap](NATIVE-SWIFTUI-ROADMAP.md).

## Requirements

- macOS 13 or newer
- [Ollama](https://ollama.com/)
- Node.js 18 or newer
- Xcode Command Line Tools (the installer builds the native launcher locally)
- GitHub Copilot CLI, VS Code, or VS Code Insiders (optional capture sources)

## Install

```bash
git clone https://github.com/saxjax/ollama-monitor.git
cd ollama-monitor
./install.sh
```

The installer derives every path from the current user and checkout. It creates:

- `~/Applications/Saxjax Monitor.app`
- `~/Library/LaunchAgents/io.github.saxjax.ollama-monitor.plist`
- `~/Library/Application Support/Saxjax Monitor/traffic.jsonl` when requests finish
- `~/Library/Application Support/Saxjax Monitor/copilot-traffic.jsonl` when new Copilot turns finish

The installed app is self-contained: it includes the gateway and dashboard
assets used by the LaunchAgent. After installation, the cloned repository can
be moved or removed without breaking Saxjax Monitor. Node.js remains an external
runtime dependency and must stay available at the path recorded during install.

Configuration variables can be supplied to the installer and are persisted in
the generated LaunchAgent. For example:

```bash
MONITOR_PORT=12435 OLLAMA_POWER_MODE=off ./install.sh
```

Open **Saxjax Monitor** from Applications, Spotlight, or the Dock. The native
bar can be dragged, and **WIDGET** switches to an always-on-top compact window.

Use the clickable **?** in the dashboard header for an interactive setup guide
with Ollama gateway commands, Copilot CLI/VS Code capture locations, GitHub token
permissions, direct documentation links, and copy buttons for setup commands.
It also explains exact versus estimated values, paid versus local/free tokens,
fallback billing, velocity/runway metrics, installation updates, Clear View, and
common troubleshooting steps.

### GitHub Copilot credit usage

The dashboard can also show monthly GitHub Copilot AI-credit usage for either
an organization-billed seat or a personally billed subscription. Create a
fine-grained personal access token with **Administration: read** organization
permission, or **Plan: read** user permission, then run:

```bash
./configure-copilot.sh organization YOUR_ORG YOUR_GITHUB_USERNAME
# or: ./configure-copilot.sh user YOUR_USERNAME
```

The script prompts for the token and stores it in macOS Keychain. Only the
billing scope and owner are stored in Application Support. Re-run the command
to switch accounts, or use `./configure-copilot.sh --disable` to hide usage.
When access fails, the dashboard links to the token-status page and to a
prefilled replacement-token form with the required read-only permission.

The top telemetry row includes a Copilot monthly-budget dial. Set the dollar
allowance in the Copilot panel; it is stored only in local Application Support.
The dial compares GitHub's reported estimated cost with that allowance, warns at
75%, and turns red at 100%. The panel also shows GitHub AI credits and locally
observed input/output tokens from monitored Copilot conversations. Token totals
cover only traffic observed by this Mac and are not a substitute for GitHub's
billing ledger.

GitHub's billing API remains authoritative whenever it is available. If that
API is unavailable and this Mac has observed Copilot requests, the dashboard
falls back to a clearly marked **LOCAL ESTIMATE**: estimated credits and cost
are prefixed with `≈`, and a separate panel shows recent credit velocity,
projected monthly use, budget runway, and a sustainable parallel-work factor.
The estimate uses the observed model and token counts where the client exposes
them, otherwise it estimates tokens from locally captured text and applies a
conservative unknown-model rate. Missing cache metrics are treated as uncached,
so the fallback may overestimate spend. It disappears as soon as authoritative
GitHub usage becomes available again.

The parallel-work factor is a budget-rate scenario, not a concurrency limit. A
value near `2×`, for example, means roughly twice the currently observed burn
rate would fit the remaining configured budget if that rate and model mix stayed
constant. Forecast confidence improves with a longer local observation window;
work performed on other computers is invisible to the fallback.

The paid-Copilot velocity panel remains visible when GitHub billing is working:
GitHub's month-to-date billed cost is then the authoritative budget baseline,
while locally observed Copilot requests provide the recent velocity. Ollama
input and output tokens are shown separately as **LOCAL / FREE** and are never
included in Copilot credits, paid velocity, projections, runway, or parallel
capacity.

You can optionally set a custom **USD per 1 million tokens** price below the
budget control. It replaces published per-model prices for local paid-Copilot
velocity and fallback estimates. It never changes GitHub's authoritative billed
total and never applies to Ollama. Enter `0` to return to per-model pricing.

Copilot input/output totals use exact client-reported token counts when present.
If a client records content without token metadata, the dashboard estimates that
record from its locally captured text instead of counting it as zero and prefixes
the affected aggregate with `≈`.

### GitHub Copilot communication capture

No proxy, editor extension, setting change, or extra Copilot token is required.
While Saxjax Monitor is running, it follows new structured local sessions from:

- GitHub Copilot CLI: `~/.copilot/session-state/`
- VS Code: `~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/`
- VS Code Insiders: `~/Library/Application Support/Code - Insiders/User/workspaceStorage/*/chatSessions/`

New prompts, assistant messages, reasoning exposed by the client, attachments,
and tool inputs/results appear in the same communication wire as Ollama traffic.
Existing Copilot sessions are not imported when the monitor starts.
When an existing CLI session is continued after a monitor restart, its earlier
transcript is used only to rebuild that new turn's IN context; the older turns
are not added as separate dashboard history entries.

Copilot requests use the same telemetry presentation as Ollama: input and output
tokens, elapsed time, average output tokens per second, and context-window usage.
VS Code values are exact when its journal supplies them. Missing client values
are visibly marked as estimates or unavailable rather than silently fabricated.

For VS Code and VS Code Insiders, the **IN** viewer switches to Copilot's exact
locally recorded `renderedGlobalContext` plus `renderedUserMessage` after the
request completes. The raw structured parts are retained in the private monitor
history together with the separately submitted chat prompt. This represents the
complete input rendered by the local Copilot extension; instructions added only
after the request reaches GitHub's servers are not observable on the Mac.

When VS Code does not retain `renderedGlobalContext`, the **IN** viewer is
labelled **LOCALLY RECONSTRUCTED INPUT**. It includes every locally recorded
context contribution: prior turns, summaries, mode instructions, variables,
references, code blocks, tool rounds/results, agent data, and edited-file events.
This makes accumulated and repeated material inspectable, but it is not labelled
as the exact server message array because VS Code did not preserve that array.

For Copilot CLI, the **IN** viewer reconstructs the request context from the
full `system.message` recorded for the interaction, its `transformedContent`
user message, attachments, and prior transcript events.
Continued turns also include the accumulated submitted/transformed prompts,
assistant responses, reasoning, and tool exchanges from earlier turns in that
monitored session. Multi-round agent/tool activity remains attached to its
original interaction. The raw structured context and short submitted prompt are
retained separately. Copilot CLI does not persist the final per-request message
array after compaction/truncation, so this view is explicitly labelled as a
reconstruction rather than the exact HTTPS payload. Server-only additions and
per-request cache-token counts are also outside the transcript's visibility.

## Use

The safe default does not replace or reconfigure Ollama. Ollama keeps its normal
address at `http://127.0.0.1:11434`, while the monitored gateway is:

```text
http://127.0.0.1:11435
```

Point the Ollama client you want to observe at port `11435`. For example:

```bash
OLLAMA_HOST=http://127.0.0.1:11435 your-client-command
```

Open the dashboard directly at
`http://127.0.0.1:11435/monitor/`.

### Prototype review lab

Open **View → Open Prototype Lab** in the native app, use the **Prototype lab**
link in the dashboard, or open:

```text
http://127.0.0.1:11435/monitor/?prototype=monitor&variant=A
```

All five monitor directions use the same local usage and system data and expose
the same filters, units, time navigation, evidence, session lanes, and Ollama
power control. The floating review tools add three workflows:

- **Comment** marks commentable sections and controls. Click one to attach a
  keep/problem/idea/question note to its prototype and current investigation
  context.
- **Compare** places comments beside aggregate visits, active-use time, and
  feature-action counts for every prototype. These counts indicate attention
  and attempts, not approval.
- **Export** creates a portable JSON review bundle. Colleagues can send their
  bundles back; import all of them on one Mac to merge the evidence without
  double-counting repeated imports.

The bundle deliberately excludes captured prompt/response bodies and the usage
timeline. It includes reviewer-written comments, selected section/item IDs,
aggregate prototype activity, and an AI analysis brief. Attach the exported
bundle to an AI coding session with this repository to synthesize and implement
the next set of variants while retaining the review loop.

Prototype feedback is stored locally in
`~/Library/Application Support/Saxjax Monitor/prototype-feedback-v1.json`.

The vertical header lever starts or stops a local Ollama installation. It uses
Ollama.app when available and falls back to `ollama serve`. Up/green is on,
down/red is off, and amber means the state is changing.

## Privacy

The monitor captures complete prompts and responses because that is its purpose.
They never leave the Mac through this project, but completed traffic is stored
locally so the current view survives a reload. **Clear view** permanently
deletes both monitor-owned history files and shared in-memory history. The files
are permissioned for the current user and excluded from Git. Clear does not
delete the source session history maintained by Copilot CLI, VS Code, or VS Code
Insiders.

The dashboard binds to loopback by default. Do not expose it publicly: it has no
authentication and displays prompt content.

## Configuration

The gateway accepts these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONITOR_HOST` | `127.0.0.1` | Dashboard and monitored gateway bind address |
| `MONITOR_PORT` | `11435` | Dashboard and monitored gateway port |
| `MONITOR_DATA_DIR` | Application Support when installed; repository `data/` when run manually | Private history directory |
| `OLLAMA_UPSTREAM` | `http://127.0.0.1:11434` | Ollama server receiving proxied requests |
| `OLLAMA_BIN` | auto-detected | Explicit path to the Ollama CLI |
| `OLLAMA_POWER_MODE` | `app` | `app`, `launchagent`, or `off` |
| `OLLAMA_SERVICE_LABEL` | empty | LaunchAgent label when power mode is `launchagent` |
| `OLLAMA_LAUNCH_AGENT` | derived from label | Optional LaunchAgent plist path |
| `OLLAMA_MONITOR_URL` | derived from monitor port | URL embedded in the native launcher |
| `PROXY_HOST` | empty | Optional second listener bind address |
| `PROXY_PORT` | `0` (disabled) | Optional second listener port |

LAN access is deliberately opt-in. Setting `MONITOR_HOST=0.0.0.0` exposes both
the Ollama-compatible gateway and dashboard, including captured prompt text, to
your network. Prefer a firewall and a trusted LAN. A second transparent listener
can be enabled with `PROXY_HOST` and `PROXY_PORT`, but moving Ollama away from
its standard port is an advanced configuration.

## Manual development

### Capture architecture

All Ollama, Copilot CLI, VS Code, and VS Code Insiders traffic crosses the same
normalized record interface in `capture-core.mjs`. That module owns source
identity, context-fidelity labels, metrics fields, completion timing, browser
snapshots, ordering, and counters. Source adapters only decode their native
gateway or transcript format. New cross-source behavior should be implemented
in the shared module unless the source genuinely exposes different data.

```bash
node gateway.mjs
```

Rebuild the self-contained launcher with:

```bash
./launcher/build-app.sh
```

The launcher includes a complete liquid-glass macOS icon family. Its editable
master is `assets/SaxjaxMonitorIcon-source.png`; regenerate every standard icon
size after changing it with:

```bash
swift launcher/generate-iconset.swift \
  assets/SaxjaxMonitorIcon-source.png \
  launcher/Assets.xcassets/AppIcon.appiconset
```

Run the capture smoke test while Saxjax Monitor is running:

```bash
./test-capture.sh
```

## Uninstall

```bash
./uninstall.sh
```

This preserves local prompt history. To remove it as well:

```bash
./uninstall.sh --purge
```

## License

MIT
