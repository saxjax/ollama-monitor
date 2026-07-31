#!/usr/bin/env bash

set -euo pipefail

scope="${1:-}"
owner="${2:-}"
user="${3:-}"
service_label="io.github.saxjax.ollama-monitor"
keychain_service="$service_label.copilot"
data_dir="${MONITOR_DATA_DIR:-$HOME/Library/Application Support/Saxjax Monitor}"
config_file="$data_dir/copilot.json"

if [[ "$scope" == "--disable" ]]; then
  rm -f "$config_file"
  launchctl kickstart -k "gui/$(id -u)/$service_label" 2>/dev/null || true
  printf 'Copilot usage monitoring disabled. Existing Keychain credentials were preserved.\n'
  exit 0
fi

if [[ "$scope" != "organization" && "$scope" != "user" ]]; then
  printf 'Usage: %s organization <GitHub org> <GitHub username>\n' "$0" >&2
  printf '       %s user <GitHub username>\n' "$0" >&2
  exit 1
fi
if [[ "$scope" == "organization" && ! "$user" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$ ]]; then
  printf 'A GitHub username is required to filter organization usage.\n' >&2
  exit 1
fi
if [[ "$scope" == "user" ]]; then
  if [[ ! "$owner" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$ ]]; then
    printf 'GitHub username is invalid.\n' >&2
    exit 1
  fi
  user="$owner"
fi
if [[ "$scope" == "organization" && ! "$owner" =~ ^[A-Za-z0-9][A-Za-z0-9-]{0,38}$ ]]; then
  printf 'GitHub organization must be a valid organization slug.\n' >&2
  exit 1
fi

mkdir -p "$data_dir"
chmod 700 "$data_dir"
printf 'Enter a fine-grained GitHub token for %s %s.\n' "$scope" "$owner"
printf 'The token will be stored in macOS Keychain (input is hidden).\n'
/usr/bin/security add-generic-password -U \
  -a "$scope:$owner" \
  -s "$keychain_service" \
  -l "Saxjax Monitor Copilot usage ($scope:$owner)" \
  -w

umask 077
config_staging="$config_file.$$"
printf '{"scope":"%s","owner":"%s","user":"%s"}\n' "$scope" "$owner" "$user" > "$config_staging"
/bin/mv "$config_staging" "$config_file"
launchctl kickstart -k "gui/$(id -u)/$service_label" 2>/dev/null || true

printf 'Copilot usage monitoring configured for %s:%s (%s).\n' "$scope" "$owner" "$user"
