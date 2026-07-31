#!/usr/bin/env bash

set -euo pipefail

service_label="io.github.saxjax.ollama-monitor"
domain="gui/$(id -u)"
launch_agent="$HOME/Library/LaunchAgents/$service_label.plist"
app_bundle="$HOME/Applications/Ollama Monitor.app"
data_dir="$HOME/Library/Application Support/Ollama Monitor"

launchctl bootout "$domain/$service_label" 2>/dev/null || true
launchctl disable "$domain/$service_label" 2>/dev/null || true
rm -f "$launch_agent"
rm -rf "$app_bundle"

if [[ "${1:-}" == "--purge" ]]; then
  rm -rf "$data_dir"
  printf 'Removed Ollama Monitor, including locally captured prompt history.\n'
else
  printf 'Removed Ollama Monitor. Local history remains at %s\n' "$data_dir"
  printf 'Run %s --purge to remove it.\n' "$0"
fi
