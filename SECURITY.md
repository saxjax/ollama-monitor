# Security and privacy

Ollama Monitor is designed for trusted local use. It intentionally captures
complete prompts, model responses, reasoning fields, client addresses, and
request metadata passing through its gateway.

## Safe defaults

- The dashboard and monitored gateway bind to `127.0.0.1`.
- Captured history is written with user-only file permissions.
- Runtime history, application bundles, logs, and data files are ignored by Git.
- Ollama power control accepts only local JSON requests from the dashboard’s
  own origin.
- No telemetry or prompt content is sent to the project author.

## Operator responsibilities

Do not bind the dashboard to `0.0.0.0` or expose it through a public reverse
proxy without adding authentication and transport security. Anyone who can open
the dashboard can read captured prompt content, and anyone who can reach the
gateway can submit inference requests to Ollama.

Before sharing logs or bug reports, remove prompt text, model responses, client
addresses, usernames, and local paths.

Use **Clear view** to permanently delete completed traffic from memory and disk.
`./uninstall.sh` preserves history by default; `./uninstall.sh --purge` removes it.

## Reporting a vulnerability

Open a GitHub security advisory for the repository instead of posting sensitive
details in a public issue.
