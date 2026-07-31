#!/usr/bin/env bash

set -euo pipefail

remote_base="${MONITOR_GATEWAY_BASE:-http://127.0.0.1:11435}"
monitor_base="${MONITOR_BASE:-http://127.0.0.1:11435}"
node_bin="$(command -v node)"

request_count() {
  "$node_bin" -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => process.stdout.write(String(JSON.parse(input).counters.total)));
  '
}

state_before="$(curl -fsS --max-time 5 "$monitor_base/monitor/api/state")"
before="$(request_count <<< "$state_before")"

# A deliberately absent model makes the upstream return immediately. The
# monitor must still capture the chat request, so this tests routing without
# waiting behind a large inference already occupying the model runner.
http_status="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$remote_base/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"model":"monitor-capture-probe:missing","messages":[{"role":"user","content":"Capture regression test"}],"stream":false,"think":false}')"

state_after="$(curl -fsS --max-time 5 "$monitor_base/monitor/api/state")"
after="$(request_count <<< "$state_after")"

if (( after <= before )); then
  printf 'FAIL: remote chat reached %s (HTTP %s), but monitor count stayed at %s\n' "$remote_base" "$http_status" "$before" >&2
  exit 1
fi

printf 'PASS: chat captured (%s -> %s, upstream HTTP %s) through %s\n' "$before" "$after" "$http_status" "$remote_base"
