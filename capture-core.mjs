export const SOURCE_PROFILES = Object.freeze({
  ollama: { label: "Ollama", provider: "ollama", client: "Ollama client", contextFidelity: "gateway-payload" },
  "copilot-cli": { label: "Copilot CLI", provider: "github-copilot", client: "GitHub Copilot CLI", contextFidelity: "reconstructed" },
  vscode: { label: "VS Code", provider: "github-copilot", client: "VS Code Copilot", contextFidelity: "client-rendered" },
  "vscode-insiders": { label: "VS Code Insiders", provider: "github-copilot", client: "VS Code Insiders Copilot", contextFidelity: "client-rendered" },
});

const SNAPSHOT_FIELDS = [
  "id", "source", "sourceLabel", "provider", "path", "model", "prompt", "submittedPrompt", "transformedPrompt",
  "inputContext", "inputContextStatus", "messages", "response", "thinking", "tools",
  "client", "clientAddress", "session", "error", "startedAt", "finishedAt", "status",
  "httpStatus", "metrics",
];

export function normalizeCaptureRecord(item) {
  const source = item.source || "ollama";
  const profile = SOURCE_PROFILES[source] || { label: source, client: source, contextFidelity: "unknown" };
  return {
    response: "",
    thinking: "",
    tools: [],
    messages: [],
    metrics: {},
    status: "streaming",
    ...item,
    source,
    sourceLabel: item.sourceLabel || profile.label,
    provider: item.provider || profile.provider || source,
    client: item.client || profile.client,
    clientAddress: item.clientAddress || "local",
    inputContextStatus: item.inputContextStatus || profile.contextFidelity,
    session: item.session || {
      id: `${source}-${item.sessionId || "unknown"}`,
      label: profile.label,
      source,
    },
  };
}

export function finishCaptureRecord(item, finishedAt, status = "complete") {
  item.finishedAt = finishedAt || new Date().toISOString();
  item.status = status;
  const elapsedMs = new Date(item.finishedAt) - new Date(item.startedAt);
  if (elapsedMs >= 0) {
    item.metrics ||= {};
    item.metrics.totalDurationNs ??= elapsedMs * 1e6;
  }
  return item;
}

export function captureSnapshot(item) {
  return Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field, item[field]]));
}

export function combineCaptureState(...states) {
  return {
    active: states.flatMap((state) => state?.active || [])
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)),
    history: states.flatMap((state) => state?.history || [])
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)),
  };
}

export function captureCounters(state) {
  return {
    total: state.active.length + state.history.length,
    errors: state.history.filter((item) => item.status === "error").length,
  };
}
