#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'Ollama Monitor currently supports macOS only.\n' >&2
  exit 1
fi

repo_root="$(cd "$(dirname "$0")" && pwd)"
node_bin="$(command -v node || true)"
monitor_service_label="io.github.saxjax.ollama-monitor"
domain="gui/$(id -u)"
launch_agent="$HOME/Library/LaunchAgents/$monitor_service_label.plist"
log_file="$HOME/Library/Logs/Ollama Monitor.log"
data_dir="${MONITOR_DATA_DIR:-$HOME/Library/Application Support/Ollama Monitor}"
app_bundle="$HOME/Applications/Ollama Monitor.app"
monitor_host="${MONITOR_HOST:-127.0.0.1}"
monitor_port="${MONITOR_PORT:-11435}"
ollama_upstream="${OLLAMA_UPSTREAM:-http://127.0.0.1:11434}"
ollama_power_mode="${OLLAMA_POWER_MODE:-app}"
ollama_service_label="${OLLAMA_SERVICE_LABEL:-}"
ollama_launch_agent="${OLLAMA_LAUNCH_AGENT:-}"
ollama_bin="${OLLAMA_BIN:-}"
proxy_host="${PROXY_HOST:-}"
proxy_port="${PROXY_PORT:-0}"
monitor_url="${OLLAMA_MONITOR_URL:-http://127.0.0.1:$monitor_port/monitor/}"

valid_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

if ! valid_port "$monitor_port"; then
  printf 'MONITOR_PORT must be between 1 and 65535.\n' >&2
  exit 1
fi
if [[ "$proxy_port" != "0" ]] && ! valid_port "$proxy_port"; then
  printf 'PROXY_PORT must be 0 or between 1 and 65535.\n' >&2
  exit 1
fi
if [[ "$ollama_upstream" != http://* ]]; then
  printf 'OLLAMA_UPSTREAM must use http://.\n' >&2
  exit 1
fi
case "$ollama_power_mode" in
  app|off) ;;
  launchagent)
    if [[ -z "$ollama_service_label" ]]; then
      printf 'OLLAMA_SERVICE_LABEL is required when OLLAMA_POWER_MODE=launchagent.\n' >&2
      exit 1
    fi
    ;;
  *)
    printf 'OLLAMA_POWER_MODE must be app, launchagent, or off.\n' >&2
    exit 1
    ;;
esac

if [[ -z "$node_bin" ]]; then
  printf 'Node.js 18 or newer is required. Install it, then run this installer again.\n' >&2
  exit 1
fi

if ! "$node_bin" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'; then
  printf 'Node.js 18 or newer is required; found %s.\n' "$("$node_bin" --version)" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs" "$data_dir" "$HOME/Applications"
chmod 700 "$data_dir"

launchctl bootout "$domain/$monitor_service_label" 2>/dev/null || true

rm -f "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :Label string $monitor_service_label" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :ProgramArguments array" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :ProgramArguments:0 string $node_bin" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :ProgramArguments:1 string $repo_root/gateway.mjs" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables dict" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:MONITOR_HOST string $monitor_host" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:MONITOR_PORT string $monitor_port" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:MONITOR_DATA_DIR string $data_dir" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:OLLAMA_UPSTREAM string $ollama_upstream" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:OLLAMA_POWER_MODE string $ollama_power_mode" "$launch_agent"
if [[ -n "$ollama_service_label" ]]; then
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:OLLAMA_SERVICE_LABEL string $ollama_service_label" "$launch_agent"
fi
if [[ -n "$ollama_launch_agent" ]]; then
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:OLLAMA_LAUNCH_AGENT string $ollama_launch_agent" "$launch_agent"
fi
if [[ -n "$ollama_bin" ]]; then
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:OLLAMA_BIN string $ollama_bin" "$launch_agent"
fi
if [[ "$proxy_port" != "0" ]]; then
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:PROXY_PORT string $proxy_port" "$launch_agent"
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:PROXY_HOST string $proxy_host" "$launch_agent"
fi
/usr/libexec/PlistBuddy -c "Add :RunAtLoad bool true" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :KeepAlive bool true" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :StandardOutPath string $log_file" "$launch_agent"
/usr/libexec/PlistBuddy -c "Add :StandardErrorPath string $log_file" "$launch_agent"
chmod 600 "$launch_agent"

APP_DESTINATION="$app_bundle" OLLAMA_MONITOR_URL="$monitor_url" "$repo_root/launcher/build-app.sh"

launchctl enable "$domain/$monitor_service_label"
launchctl bootstrap "$domain" "$launch_agent"
launchctl kickstart -k "$domain/$monitor_service_label"

printf '\nOllama Monitor installed.\n'
printf 'App:       %s\n' "$app_bundle"
printf 'Dashboard: %s\n' "$monitor_url"
printf 'Gateway:   http://127.0.0.1:%s\n' "$monitor_port"
printf '\nPoint Ollama clients at the gateway URL to see their traffic.\n'
