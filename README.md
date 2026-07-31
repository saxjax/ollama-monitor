# Ollama Monitor

A local, dependency-free macOS dashboard for Ollama inference traffic and
machine health. It shows prompts and streamed responses, context use, loaded
models, CPU cores, unified memory, swap, load, throughput, and errors in real
time.

The dashboard runs entirely on your Mac. It includes a small native AppKit
launcher with a draggable floating-widget mode; the monitor UI itself is the
validated web prototype described in [Native SwiftUI roadmap](NATIVE-SWIFTUI-ROADMAP.md).

## Requirements

- macOS 13 or newer
- [Ollama](https://ollama.com/)
- Node.js 18 or newer
- Xcode Command Line Tools (for the optional native launcher)

## Install

```bash
git clone https://github.com/saxjax/ollama-monitor.git
cd ollama-monitor
./install.sh
```

The installer derives every path from the current user and checkout. It creates:

- `~/Applications/Ollama Monitor.app`
- `~/Library/LaunchAgents/io.github.saxjax.ollama-monitor.plist`
- `~/Library/Application Support/Ollama Monitor/traffic.jsonl` when requests finish

Configuration variables can be supplied to the installer and are persisted in
the generated LaunchAgent. For example:

```bash
MONITOR_PORT=12435 OLLAMA_POWER_MODE=off ./install.sh
```

Open **Ollama Monitor** from Applications, Spotlight, or the Dock. The native
bar can be dragged, and **WIDGET** switches to an always-on-top compact window.

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

The vertical header lever starts or stops a local Ollama installation. It uses
Ollama.app when available and falls back to `ollama serve`. Up/green is on,
down/red is off, and amber means the state is changing.

## Privacy

The monitor captures complete prompts and responses because that is its purpose.
They never leave the Mac through this project, but completed traffic is stored
locally so the current view survives a reload. **Clear view** permanently
deletes both the on-disk history and shared in-memory history. The data file is
permissioned for the current user and excluded from Git.

The dashboard binds to loopback by default. Do not expose it publicly: it has no
authentication and displays prompt content.

## Configuration

The gateway accepts these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONITOR_HOST` | `127.0.0.1` | Dashboard and monitored gateway bind address |
| `MONITOR_PORT` | `11435` | Dashboard and monitored gateway port |
| `MONITOR_DATA_DIR` | repository `data/` | Private history directory |
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

```bash
node gateway.mjs
```

Rebuild the launcher with:

```bash
./launcher/build-app.sh
```

Run the capture smoke test while Ollama Monitor is running:

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
