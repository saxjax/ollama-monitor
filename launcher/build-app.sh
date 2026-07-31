#!/usr/bin/env bash

set -euo pipefail

launcher_dir="$(cd "$(dirname "$0")" && pwd)"
app_bundle="${APP_DESTINATION:-$HOME/Applications/Saxjax Monitor.app}"
monitor_url="${OLLAMA_MONITOR_URL:-http://127.0.0.1:11435/monitor/}"
monitor_service_label="${MONITOR_SERVICE_LABEL:-io.github.saxjax.ollama-monitor}"
contents_dir="$app_bundle/Contents"
macos_dir="$contents_dir/MacOS"

mkdir -p "$macos_dir"
/usr/bin/swiftc \
  -O \
  -framework AppKit \
  -framework WebKit \
  "$launcher_dir/OllamaMonitor.swift" \
  -o "$macos_dir/OllamaMonitor"
/bin/cp "$launcher_dir/Info.plist" "$contents_dir/Info.plist"
/usr/libexec/PlistBuddy -c "Set :OllamaMonitorURL $monitor_url" "$contents_dir/Info.plist"
/usr/libexec/PlistBuddy -c "Set :MonitorServiceLabel $monitor_service_label" "$contents_dir/Info.plist"
/usr/bin/codesign --force --deep --sign - "$app_bundle"

printf 'Built %s\n' "$app_bundle"
