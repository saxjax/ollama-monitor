#!/usr/bin/env bash

set -euo pipefail

launcher_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$launcher_dir/.." && pwd)"
app_bundle="${APP_DESTINATION:-$HOME/Applications/Saxjax Monitor.app}"
monitor_url="${OLLAMA_MONITOR_URL:-http://127.0.0.1:11435/monitor/}"
monitor_service_label="${MONITOR_SERVICE_LABEL:-io.github.saxjax.ollama-monitor}"
contents_dir="$app_bundle/Contents"
macos_dir="$contents_dir/MacOS"
resources_dir="$contents_dir/Resources"
runtime_dir="$resources_dir/runtime"

mkdir -p "$macos_dir" "$resources_dir"
/usr/bin/swiftc \
  -O \
  -framework AppKit \
  -framework WebKit \
  "$launcher_dir/OllamaMonitor.swift" \
  -o "$macos_dir/OllamaMonitor"
/bin/cp "$launcher_dir/Info.plist" "$contents_dir/Info.plist"
/usr/libexec/PlistBuddy -c "Set :OllamaMonitorURL $monitor_url" "$contents_dir/Info.plist"
/usr/libexec/PlistBuddy -c "Set :MonitorServiceLabel $monitor_service_label" "$contents_dir/Info.plist"
/usr/bin/xcrun actool "$launcher_dir/Assets.xcassets" \
  --compile "$resources_dir" \
  --platform macosx \
  --minimum-deployment-target 13.0 \
  --app-icon AppIcon \
  --output-partial-info-plist "$contents_dir/asset-info.plist"
/bin/rm -rf "$runtime_dir"
/bin/mkdir -p "$runtime_dir"
/bin/cp "$repo_root/gateway.mjs" "$runtime_dir/gateway.mjs"
/bin/cp "$repo_root/copilot-usage.mjs" "$runtime_dir/copilot-usage.mjs"
/bin/cp "$repo_root/copilot-capture.mjs" "$runtime_dir/copilot-capture.mjs"
/bin/cp "$repo_root/capture-core.mjs" "$runtime_dir/capture-core.mjs"
/bin/cp "$repo_root/copilot-forecast.mjs" "$runtime_dir/copilot-forecast.mjs"
/bin/cp "$repo_root/usage-timeline-store.mjs" "$runtime_dir/usage-timeline-store.mjs"
/bin/cp "$repo_root/prototype-feedback-store.mjs" "$runtime_dir/prototype-feedback-store.mjs"
/bin/cp "$repo_root/vscode-insiders-importer.mjs" "$runtime_dir/vscode-insiders-importer.mjs"
/bin/cp "$repo_root/usage-timeline-view-model.mjs" "$runtime_dir/usage-timeline-view-model.mjs"
/bin/cp -R "$repo_root/public" "$runtime_dir/public"
/usr/bin/codesign --force --deep --sign - "$app_bundle"

printf 'Built %s\n' "$app_bundle"
