#!/usr/bin/env node

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { appendFile, access, mkdir, readFile, unlink } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createCopilotUsageMonitor } from "./copilot-usage.mjs";
import { createCopilotCapture, readVsCodeRequestCapture } from "./copilot-capture.mjs";
import { createUsageTimelineStore } from "./usage-timeline-store.mjs";
import { createPrototypeFeedbackStore } from "./prototype-feedback-store.mjs";
import { createVsCodeInsidersImporter } from "./vscode-insiders-importer.mjs";
import { captureCounters, captureSnapshot, combineCaptureState, finishCaptureRecord, normalizeCaptureRecord } from "./capture-core.mjs";
import { forecastCopilotUsage, summarizeCopilotTokens } from "./copilot-forecast.mjs";
import { preferredMonitorLocation } from "./monitor-surface-routing.mjs";
import { createEventStreamHub } from "./event-stream.mjs";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");
const dataDir = process.env.MONITOR_DATA_DIR || path.join(here, "data");
const trafficLog = path.join(dataDir, "traffic.jsonl");
const copilotConfig = process.env.COPILOT_CONFIG || path.join(dataDir, "copilot.json");
const listenHost = process.env.MONITOR_HOST || "127.0.0.1";
const listenPort = Number(process.env.MONITOR_PORT || 11435);
const proxyHost = process.env.PROXY_HOST || "";
const proxyPort = Number(process.env.PROXY_PORT || 0);
const upstream = new URL(process.env.OLLAMA_UPSTREAM || "http://127.0.0.1:11434");
const ollamaServiceLabel = process.env.OLLAMA_SERVICE_LABEL || "";
const ollamaLaunchAgent = process.env.OLLAMA_LAUNCH_AGENT || (
  ollamaServiceLabel
    ? path.join(os.homedir(), "Library", "LaunchAgents", `${ollamaServiceLabel}.plist`)
    : ""
);
const ollamaPowerMode = process.env.OLLAMA_POWER_MODE || (ollamaServiceLabel ? "launchagent" : "app");
const maxHistory = 50;
// Large enough for full 128k-token contexts while still protecting the monitor
// from unbounded malformed streams.
const maxCaptureChars = 2_000_000;

await mkdir(dataDir, { recursive: true, mode: 0o700 });

async function loadHistory() {
  try {
    const lines = (await readFile(trafficLog, "utf8")).trim().split("\n").filter(Boolean);
    return lines
      .slice(-maxHistory)
      .map((line) => normalizeHistoryItem(JSON.parse(line)))
      .reverse();
  } catch {
    return [];
  }
}

const eventStream = createEventStreamHub();
const requests = new Map();
const history = await loadHistory();
const copilotUsage = createCopilotUsageMonitor({ configPath: copilotConfig });
let copilotCapture;
let usageTimelineStore;
let usageTimelineImporter;
let prototypeFeedbackStore;
const counters = {
  total: history.length,
  errors: history.filter((item) => item.status === "error").length,
};
let latestMetrics = null;
let trafficFileOperation = Promise.resolve();

function queueTrafficFileOperation(operation) {
  trafficFileOperation = trafficFileOperation.then(operation, operation);
  return trafficFileOperation;
}

function refreshCounters() {
  const copilot = copilotCapture?.snapshot() || { active: [], history: [] };
  Object.assign(counters, captureCounters(combineCaptureState(
    { active: [...requests.values()], history },
    copilot,
  )));
}

function trimHistory() {
  const before = history.length;
  history.splice(maxHistory);
  refreshCounters();
  return history.length !== before;
}

function sendEvent(type, payload) {
  eventStream.send(type, payload);
}

function json(response, status, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": encoded.length,
    "cache-control": "no-store",
  });
  response.end(encoded);
}

function requestSnapshot(item) {
  return captureSnapshot(normalizeCaptureRecord(item));
}

function initialState({ includeHistoricalData = true } = {}) {
  const copilotTraffic = copilotCapture?.snapshot() || { active: [], history: [] };
  const traffic = combineCaptureState(
    { active: [...requests.values()].map(requestSnapshot), history: includeHistoricalData ? history.map(requestSnapshot) : [] },
    { active: copilotTraffic.active.map(requestSnapshot), history: includeHistoricalData ? copilotTraffic.history.map(requestSnapshot) : [] },
  );
  return {
    metrics: latestMetrics,
    ...traffic,
    counters: { ...counters },
    copilot: copilotDashboardState(copilotUsage.snapshot()),
    usageTimeline: includeHistoricalData ? usageTimelineStore?.snapshot() || null : null,
  };
}

function currentMonthClientCredits() {
  const now = new Date();
  const prefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const events = usageTimelineStore?.snapshot()?.usageEvents ?? [];
  let sum = 0;
  let count = 0;
  for (const event of events) {
    if (!event.timing?.usageAt?.startsWith(prefix)) continue;
    const value = event.measurements?.nativeUnit?.value;
    if (Number.isFinite(value)) { sum += value; count += 1; }
  }
  return count > 0 ? sum : null;
}

function copilotDashboardState(usage) {
  const traffic = copilotCapture?.snapshot() || { active: [], history: [] };
  const records = [...traffic.active, ...traffic.history].filter((item) => item.provider === "github-copilot");
  const authoritativeSpend = usage.status === "ready" ? usage.estimatedCost : null;
  const forecast = forecastCopilotUsage(records, usage.monthlyBudgetUsd, new Date(), authoritativeSpend, usage.tokenPriceUsdPerMillion);
  const copilotTokens = summarizeCopilotTokens(records);
  const ollamaRecords = [...requests.values(), ...history];
  const clientCredits = usage.status !== "ready" ? currentMonthClientCredits() : null;
  const fallback = usage.status !== "ready" && (clientCredits != null || forecast.requestCount > 0);
  const estimatedCost = fallback ? forecast.costUsd : usage.estimatedCost;
  let usedCredits = usage.usedCredits;
  if (usage.status !== "ready") usedCredits = clientCredits ?? forecast.credits;
  const monthlyBudgetUsd = usage.monthlyBudgetUsd;
  let fallbackDetail = "GitHub billing is unavailable; showing a local token-priced estimate.";
  if (clientCredits != null) fallbackDetail = "GitHub billing is unavailable; showing client-observed credits from local journals.";
  return {
    ...usage,
    status: fallback ? "estimated" : usage.status,
    detail: fallback ? fallbackDetail : usage.detail,
    estimatedCost,
    usedCredits,
    budgetUsedPercent: monthlyBudgetUsd && Number.isFinite(estimatedCost) ? (estimatedCost / monthlyBudgetUsd) * 100 : usage.budgetUsedPercent,
    budgetRemainingUsd: monthlyBudgetUsd && Number.isFinite(estimatedCost) ? Math.max(0, monthlyBudgetUsd - estimatedCost) : usage.budgetRemainingUsd,
    usageEstimate: fallback,
    forecast,
    observedRequests: records.length,
    observedInputTokens: copilotTokens.inputTokens,
    observedOutputTokens: copilotTokens.outputTokens,
    observedInputTokensEstimated: copilotTokens.estimatedInputRecords > 0,
    observedOutputTokensEstimated: copilotTokens.estimatedOutputRecords > 0,
    ollamaInputTokens: ollamaRecords.reduce((sum, item) => sum + (Number(item.metrics?.promptTokens) || 0), 0),
    ollamaOutputTokens: ollamaRecords.reduce((sum, item) => sum + (Number(item.metrics?.outputTokens) || 0), 0),
  };
}

function historyState(reason) {
  const copilotTraffic = copilotCapture?.snapshot() || { active: [], history: [] };
  const traffic = combineCaptureState(
    { active: [...requests.values()].map(requestSnapshot), history: history.map(requestSnapshot) },
    { active: copilotTraffic.active.map(requestSnapshot), history: copilotTraffic.history.map(requestSnapshot) },
  );
  return {
    ...traffic,
    counters: { ...counters },
    reason,
  };
}

async function clearHistory() {
  history.splice(0);
  await copilotCapture?.clear();
  // Timeline Clear is deliberately narrower than Reset: it removes local
  // recognition text but retains numeric recovered history and source anchors.
  if (usageTimelineStore) {
    const timeline = await usageTimelineStore.clearPromptExcerpts();
    sendEvent("usage-timeline", timeline);
  }
  await queueTrafficFileOperation(() => unlink(trafficLog).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  }));
  refreshCounters();
  const state = historyState("cleared");
  sendEvent("history-reset", state);
  return state;
}

copilotCapture = await createCopilotCapture({
  dataDir,
  onChange(type, item) {
    refreshCounters();
    if (type === "started") sendEvent("request-started", requestSnapshot(item));
    else sendEvent("request-finished", requestSnapshot(item));
    sendEvent("copilot", copilotDashboardState(copilotUsage.snapshot()));
  },
});
usageTimelineStore = await createUsageTimelineStore({ dataDir });
prototypeFeedbackStore = await createPrototypeFeedbackStore({ dataDir });
usageTimelineImporter = createVsCodeInsidersImporter({
  store: usageTimelineStore,
  onChange({ snapshot }) { sendEvent("usage-timeline", snapshot); },
});
// Historical journal recovery can be substantial. The dashboard must become
// available while it runs; completed imports update it through the event stream.
void usageTimelineImporter.start().catch((error) => {
  console.error(`Usage timeline import unavailable: ${error.message}`);
});
refreshCounters();

function textContent(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => (typeof part === "string" ? part : part?.text || `[${part?.type || "content"}]`))
      .join("\n");
  }
  return value == null ? "" : JSON.stringify(value);
}

function shortHash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 10);
}

function normalizeAddress(value) {
  return String(value || "unknown").replace(/^::ffff:/, "");
}

function buildSession({ explicitId, model, messages, prompt, client, clientAddress }) {
  const firstUser = messages.find((message) => message.role === "user")?.content || prompt || "";
  const source = explicitId ? "explicit" : firstUser ? "conversation" : "client";
  const basis = explicitId
    ? `explicit|${explicitId}`
    : `${source}|${clientAddress}|${client}|${model}|${firstUser.slice(0, 8192)}`;
  const digest = shortHash(basis);
  return {
    id: `session-${digest}`,
    label: `Session ${digest.slice(0, 4).toUpperCase()}`,
    source,
  };
}

function withSession(item) {
  if (item.session?.id) return item;
  item.session = buildSession({
    model: item.model || "unknown",
    messages: Array.isArray(item.messages) ? item.messages : [],
    prompt: item.prompt || "",
    client: typeof item.client === "string" ? item.client : "unknown",
    clientAddress: item.clientAddress || "legacy",
  });
  return item;
}

function errorText(value) {
  if (typeof value === "string") return value;
  if (value?.message) return String(value.message);
  return value == null ? "" : JSON.stringify(value);
}

function fallbackError(item, legacy = false) {
  const status = Number(item.httpStatus);
  const statusLabel = status ? `HTTP ${status}${http.STATUS_CODES[status] ? ` ${http.STATUS_CODES[status]}` : ""}` : "Request failed";
  return legacy
    ? `${statusLabel}. Error details were not captured by the older monitor version.`
    : `${statusLabel}. Ollama returned no additional error details.`;
}

function normalizeHistoryItem(item) {
  withSession(item);
  if (item.status === "error" && !item.error) item.error = item.response?.trim() || fallbackError(item, true);
  if (item.status === "error" && !item.response?.trim()) item.response = `ERROR\n${item.error}`;
  return item;
}

function captureRequest(body, clientRequest) {
  let parsed;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    parsed = {};
  }
  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  const lastUser = [...messages].reverse().find((message) => message?.role === "user");
  const captured = {
    model: parsed.model || "unknown",
    prompt: parsed.model ? textContent(lastUser?.content ?? parsed.prompt ?? parsed.input ?? "") : "[non-JSON request]",
    messages: messages.map((message) => ({
      role: message?.role || "message",
      content: textContent(message?.content),
    })),
  };
  const metadata = parsed.metadata && typeof parsed.metadata === "object" ? parsed.metadata : {};
  const explicitId =
    parsed.session_id ?? parsed.sessionId ?? parsed.chat_id ?? parsed.chatId ??
    parsed.conversation_id ?? parsed.conversationId ?? metadata.session_id ??
    metadata.chat_id ?? metadata.conversation_id ?? clientRequest.headers["x-session-id"] ??
    clientRequest.headers["x-chat-id"] ?? clientRequest.headers["x-conversation-id"];
  const client = clientRequest.headers["user-agent"] || "unknown client";
  const clientAddress = normalizeAddress(clientRequest.socket.remoteAddress);
  return {
    ...captured,
    client,
    clientAddress,
    session: buildSession({ explicitId, ...captured, client, clientAddress }),
  };
}

function appendCaptured(item, field, value) {
  if (!value) return;
  item[field] = (item[field] + value).slice(-maxCaptureChars);
  sendEvent("token", { id: item.id, field, value });
}

function consumePayload(item, payload) {
  if (!payload || typeof payload !== "object") return;
  const reportedError = errorText(payload.error || payload.message?.error || payload.choices?.[0]?.error);
  if (reportedError) item.error = (item.error ? `${item.error}\n${reportedError}` : reportedError).slice(-maxCaptureChars);
  appendCaptured(item, "response", payload.message?.content || payload.response || "");
  appendCaptured(item, "thinking", payload.message?.thinking || payload.thinking || "");

  const choice = payload.choices?.[0];
  appendCaptured(item, "response", choice?.delta?.content || choice?.message?.content || "");
  appendCaptured(item, "thinking", choice?.delta?.reasoning_content || choice?.message?.reasoning_content || "");

  if (payload.done || choice?.finish_reason) {
    item.metrics = {
      totalDurationNs: payload.total_duration,
      loadDurationNs: payload.load_duration,
      promptTokens: payload.prompt_eval_count ?? payload.usage?.prompt_tokens,
      promptDurationNs: payload.prompt_eval_duration,
      outputTokens: payload.eval_count ?? payload.usage?.completion_tokens,
      outputDurationNs: payload.eval_duration,
    };
  }
}

function parseResponseChunk(item, parser, chunk) {
  parser.buffer += chunk.toString("utf8");
  const lines = parser.buffer.split("\n");
  parser.buffer = lines.pop() || "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "data: [DONE]") continue;
    const candidate = line.startsWith("data:") ? line.slice(5).trim() : line;
    try {
      consumePayload(item, JSON.parse(candidate));
    } catch {
      // Non-streaming JSON is handled from the accumulated response at finish.
    }
  }
}

async function finishRequest(item, parser, error = null) {
  if (parser.buffer.trim()) {
    const candidate = parser.buffer.trim().replace(/^data:\s*/, "");
    try {
      consumePayload(item, JSON.parse(candidate));
    } catch {
      try {
        consumePayload(item, JSON.parse(parser.all));
      } catch {
        // The upstream response may legitimately be non-JSON.
      }
    }
  }

  finishCaptureRecord(item, new Date().toISOString(), error || item.httpStatus >= 400 ? "error" : "complete");
  if (error) item.error = `Gateway error: ${error.message}`;
  if (item.status === "error" && !item.error) item.error = fallbackError(item);
  if (item.status === "error" && !item.response.trim()) item.response = `ERROR\n${item.error}`;
  requests.delete(item.id);
  history.unshift(item);
  const trimmed = trimHistory();
  sendEvent("request-finished", requestSnapshot(item));
  sendEvent("state", initialState());
  if (trimmed) sendEvent("history-reset", historyState("trimmed"));
  await queueTrafficFileOperation(() =>
    appendFile(trafficLog, `${JSON.stringify(requestSnapshot(item))}\n`, { mode: 0o600 })
  );
}

async function proxyRequest(clientRequest, clientResponse) {
  const chunks = [];
  for await (const chunk of clientRequest) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const observedRequest =
    clientRequest.method === "POST" &&
    /^\/(api\/(chat|generate)|v1\/chat\/completions)(\?|$)/.test(clientRequest.url || "");

  if (!observedRequest) {
    const headers = { ...clientRequest.headers, host: upstream.host, "content-length": body.length };
    delete headers.connection;
    const upstreamRequest = http.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port,
        method: clientRequest.method,
        path: clientRequest.url,
        headers,
      },
      (upstreamResponse) => {
        clientResponse.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
        upstreamResponse.pipe(clientResponse);
      },
    );
    upstreamRequest.on("error", (error) => {
      if (!clientResponse.headersSent) json(clientResponse, 502, { error: `Ollama unavailable: ${error.message}` });
      else clientResponse.destroy(error);
    });
    if (body.length) upstreamRequest.write(body);
    upstreamRequest.end();
    return;
  }

  const captured = captureRequest(body, clientRequest);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const item = {
    id,
    path: clientRequest.url,
    model: captured.model,
    prompt: captured.prompt.slice(-maxCaptureChars),
    messages: captured.messages,
    response: "",
    thinking: "",
    client: captured.client,
    clientAddress: captured.clientAddress,
    session: captured.session,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "active",
    httpStatus: null,
    metrics: null,
    error: null,
  };
  requests.set(id, item);
  refreshCounters();
  sendEvent("request-started", requestSnapshot(item));
  sendEvent("state", initialState());

  const headers = { ...clientRequest.headers, host: upstream.host, "content-length": body.length };
  delete headers.connection;

  const parser = { buffer: "", all: "" };
  const upstreamRequest = http.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: clientRequest.method,
      path: clientRequest.url,
      headers,
    },
    (upstreamResponse) => {
      item.httpStatus = upstreamResponse.statusCode || 502;
      const responseHeaders = { ...upstreamResponse.headers };
      delete responseHeaders["content-length"];
      clientResponse.writeHead(item.httpStatus, responseHeaders);

      upstreamResponse.on("data", (chunk) => {
        clientResponse.write(chunk);
        parser.all = (parser.all + chunk.toString("utf8")).slice(-maxCaptureChars);
        parseResponseChunk(item, parser, chunk);
      });
      upstreamResponse.on("end", () => {
        clientResponse.end();
        void finishRequest(item, parser);
      });
      upstreamResponse.on("error", (error) => {
        clientResponse.destroy(error);
        void finishRequest(item, parser, error);
      });
    },
  );

  upstreamRequest.on("error", (error) => {
    if (!clientResponse.headersSent) json(clientResponse, 502, { error: `Ollama unavailable: ${error.message}` });
    else clientResponse.destroy(error);
    void finishRequest(item, parser, error);
  });
  if (body.length) upstreamRequest.write(body);
  upstreamRequest.end();
}

async function run(command, args = []) {
  if (!command) return "";
  try {
    const { stdout } = await execFileAsync(command, args, { timeout: 1800, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function findOllamaBinary() {
  const pathCandidates = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, "ollama"));
  const candidates = [
    process.env.OLLAMA_BIN,
    ...pathCandidates,
    "/opt/homebrew/bin/ollama",
    "/usr/local/bin/ollama",
    "/Applications/Ollama.app/Contents/Resources/ollama",
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next conventional installation path.
    }
  }
  return null;
}

const ollamaBinary = await findOllamaBinary();

async function runCommand(command, args, timeout = 5000) {
  try {
    await execFileAsync(command, args, { timeout, maxBuffer: 1024 * 1024 });
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: String(error.stderr || error.message).trim() };
  }
}

async function runLaunchctl(args) {
  return runCommand("/bin/launchctl", args);
}

async function ollamaIsOnline() {
  try {
    const response = await fetch(new URL("/api/version", upstream), { signal: AbortSignal.timeout(700) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForOllama(expectedOnline, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await ollamaIsOnline() === expectedOnline) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  return false;
}

async function setOllamaEnabled(enabled) {
  if (!["127.0.0.1", "localhost", "::1"].includes(upstream.hostname)) {
    throw new Error("Power control is unavailable for a remote Ollama server");
  }
  if (ollamaPowerMode === "off") {
    throw new Error("Ollama power control is disabled by configuration");
  }

  if (ollamaPowerMode === "app") {
    if (enabled) {
      if (!await ollamaIsOnline()) {
        const opened = await runCommand("/usr/bin/open", ["-gja", "Ollama"]);
        if (!opened.ok && !ollamaBinary) {
          throw new Error("Ollama.app or the ollama command was not found");
        }
        if (!await waitForOllama(true, 4_000) && ollamaBinary) {
          const child = spawn(ollamaBinary, ["serve"], {
            detached: true,
            stdio: "ignore",
            env: { ...process.env, OLLAMA_HOST: upstream.host },
          });
          child.on("error", () => {
            // Readiness polling below reports a useful error if the process fails.
          });
          child.unref();
        }
      }
    } else {
      await runCommand("/usr/bin/osascript", ["-e", "tell application \"Ollama\" to quit"]);
      if (!await waitForOllama(false, 2_500)) {
        await runCommand("/usr/bin/pkill", ["-x", "ollama"]);
      }
    }

    if (!await waitForOllama(enabled)) {
      throw new Error(enabled ? "Ollama did not become ready in time" : "Ollama did not stop in time");
    }
    await refreshMetrics();
    return latestMetrics;
  }

  if (ollamaPowerMode !== "launchagent" || !ollamaServiceLabel) {
    throw new Error(`Unsupported OLLAMA_POWER_MODE: ${ollamaPowerMode}`);
  }

  const domain = `gui/${process.getuid()}`;
  const service = `${domain}/${ollamaServiceLabel}`;

  if (enabled) {
    await runLaunchctl(["enable", service]);
    const kickstarted = await runLaunchctl(["kickstart", service]);
    if (!kickstarted.ok && !await ollamaIsOnline()) {
      if (!ollamaLaunchAgent || !await readFile(ollamaLaunchAgent).then(() => true, () => false)) {
        throw new Error(`Ollama LaunchAgent is missing at ${ollamaLaunchAgent}`);
      }
      const bootstrapped = await runLaunchctl(["bootstrap", domain, ollamaLaunchAgent]);
      if (!bootstrapped.ok && !await ollamaIsOnline()) {
        await runLaunchctl(["kickstart", service]);
      }
    }
  } else {
    await runLaunchctl(["disable", service]);
    await runLaunchctl(["bootout", service]);
  }

  if (!await waitForOllama(enabled)) {
    throw new Error(enabled ? "Ollama did not become ready in time" : "Ollama did not stop in time");
  }
  await refreshMetrics();
  return latestMetrics;
}

async function readJsonRequest(request, maximumBytes = 4096) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumBytes) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function isLoopbackRequest(request) {
  const address = normalizeAddress(request.socket.remoteAddress);
  return address === "127.0.0.1" || address === "::1";
}

function hasTrustedDashboardOrigin(request) {
  const origin = request.headers.origin;
  const localOrigins = new Set([
    `http://127.0.0.1:${listenPort}`,
    `http://localhost:${listenPort}`,
  ]);
  return !origin || localOrigins.has(origin);
}

function isLocalControlRequest(request) {
  return isLoopbackRequest(request) &&
    hasTrustedDashboardOrigin(request) &&
    String(request.headers["content-type"] || "").startsWith("application/json");
}

function sizeToMB(value, unit) {
  const number = Number(value);
  if (unit.toUpperCase() === "G") return number * 1024;
  if (unit.toUpperCase() === "K") return number / 1024;
  return number;
}

function systemValue(read, fallback = null) {
  try {
    return read();
  } catch {
    return fallback;
  }
}

let hardwareInfoPromise = null;
let machineNamePromise = null;
let previousCoreTimes = null;

function getMachineName() {
  if (machineNamePromise) return machineNamePromise;
  machineNamePromise = (async () => {
    const [localHostName, computerName] = await Promise.all([
      run("/usr/sbin/scutil", ["--get", "LocalHostName"]),
      run("/usr/sbin/scutil", ["--get", "ComputerName"]),
    ]);
    return localHostName || computerName || os.hostname().replace(/\.local$/i, "") || "Saxjax Monitor";
  })();
  return machineNamePromise;
}

function getHardwareInfo() {
  if (hardwareInfoPromise) return hardwareInfoPromise;
  hardwareInfoPromise = (async () => {
    const [logical, physical, brand, performance, efficiency, performanceName, efficiencyName] = await Promise.all([
      run("/usr/sbin/sysctl", ["-n", "hw.logicalcpu"]),
      run("/usr/sbin/sysctl", ["-n", "hw.physicalcpu"]),
      run("/usr/sbin/sysctl", ["-n", "machdep.cpu.brand_string"]),
      run("/usr/sbin/sysctl", ["-n", "hw.perflevel0.logicalcpu"]),
      run("/usr/sbin/sysctl", ["-n", "hw.perflevel1.logicalcpu"]),
      run("/usr/sbin/sysctl", ["-n", "hw.perflevel0.name"]),
      run("/usr/sbin/sysctl", ["-n", "hw.perflevel1.name"]),
    ]);
    const fallbackCores = os.cpus();
    const logicalCores = Number(logical) || fallbackCores.length;
    const physicalCores = Number(physical) || logicalCores;
    const performanceCores = Number(performance) || 0;
    const efficiencyCores = Number(efficiency) || 0;
    return {
      brand: brand || fallbackCores[0]?.model || "Unknown CPU",
      logicalCores,
      physicalCores,
      performanceCores,
      efficiencyCores,
      performanceName: performanceName || "Performance",
      efficiencyName: efficiencyName || "Efficiency",
      topologySource: logical && physical ? "sysctl" : "node-fallback",
    };
  })();
  return hardwareInfoPromise;
}

function sampleCoreActivity(hardware) {
  const current = os.cpus();
  const previous = previousCoreTimes;
  previousCoreTimes = current.map((cpu) => ({ ...cpu.times }));
  return current.map((cpu, index) => {
    const before = previous?.[index];
    const now = cpu.times;
    const total = before
      ? Object.keys(now).reduce((sum, key) => sum + Math.max(0, now[key] - (before[key] || 0)), 0)
      : 0;
    const idle = before ? Math.max(0, now.idle - before.idle) : 0;
    const utilization = total > 0 ? Math.max(0, Math.min(100, ((total - idle) / total) * 100)) : null;
    const isPerformance = hardware.performanceCores > 0 && index < hardware.performanceCores;
    const isEfficiency =
      hardware.efficiencyCores > 0 &&
      index >= hardware.performanceCores &&
      index < hardware.performanceCores + hardware.efficiencyCores;
    const type = isPerformance ? "performance" : isEfficiency ? "efficiency" : "logical";
    const typeIndex = isPerformance ? index : isEfficiency ? index - hardware.performanceCores : index;
    return {
      index,
      label: type === "performance" ? `P${typeIndex}` : type === "efficiency" ? `E${typeIndex}` : `CPU${index}`,
      type,
      utilization,
      speedMHz: cpu.speed || null,
    };
  });
}

async function collectMetrics() {
  const [top, pressure, swap, processesText, ollamaPs, disk, hardware, machineName] = await Promise.all([
    run("/usr/bin/top", ["-l", "1", "-n", "0"]),
    run("/usr/bin/memory_pressure"),
    run("/usr/sbin/sysctl", ["-n", "vm.swapusage"]),
    run("/bin/ps", ["-axo", "%cpu=,rss=,comm="]),
    run(ollamaBinary, ["ps"]),
    run("/bin/df", ["-k", "/"]),
    getHardwareInfo(),
    getMachineName(),
  ]);
  const cores = sampleCoreActivity(hardware);

  const cpuMatch = top.match(/CPU usage:\s*([\d.]+)% user,\s*([\d.]+)% sys,\s*([\d.]+)% idle/);
  const memoryMatch = pressure.match(/System-wide memory free percentage:\s*(\d+)%/);
  const swapMatch = swap.match(/total\s*=\s*([\d.]+)([MGK]).*used\s*=\s*([\d.]+)([MGK])/i);
  const diskLines = disk.split("\n");
  const diskParts = diskLines.at(-1)?.trim().split(/\s+/) || [];

  let ollamaCpu = 0;
  let ollamaRssKB = 0;
  let ollamaProcesses = 0;
  for (const line of processesText.split("\n")) {
    const match = line.trim().match(/^([\d.]+)\s+(\d+)\s+(.+)$/);
    if (!match || path.basename(match[3]) !== "ollama") continue;
    ollamaCpu += Number(match[1]);
    ollamaRssKB += Number(match[2]);
    ollamaProcesses += 1;
  }

  const modelLines = ollamaPs.split("\n").slice(1).filter(Boolean);
  const models = modelLines.map((line) => {
    const parts = line.trim().split(/\s+/);
    return {
      name: parts[0],
      size: `${parts[2] || "-"} ${parts[3] || ""}`.trim(),
      processor: `${parts[4] || "-"} ${parts[5] || ""}`.trim(),
      context: Number(parts[6]) || null,
      until: parts.slice(7).join(" "),
    };
  });

  let server = { online: false, version: null };
  try {
    const response = await fetch(new URL("/api/version", upstream), { signal: AbortSignal.timeout(1200) });
    const version = await response.json();
    server = { online: response.ok, version: version.version || null };
  } catch {
    // Offline is a normal monitor state.
  }

  return {
    at: new Date().toISOString(),
    configuration: {
      gateway: `${listenHost}:${listenPort}`,
      upstream: upstream.host,
      proxy: proxyPort ? `${proxyHost || "0.0.0.0"}:${proxyPort}` : null,
      powerMode: ollamaPowerMode,
    },
    server,
    system: {
      machineName,
      cpuUsed: cpuMatch ? 100 - Number(cpuMatch[3]) : null,
      memoryFree: memoryMatch ? Number(memoryMatch[1]) : null,
      swapUsedMB: swapMatch ? sizeToMB(swapMatch[3], swapMatch[4]) : null,
      swapTotalMB: swapMatch ? sizeToMB(swapMatch[1], swapMatch[2]) : null,
      load: systemValue(() => os.loadavg(), [null, null, null]),
      uptimeSeconds: systemValue(() => os.uptime()),
      diskFreeGB: diskParts[3] ? Number(diskParts[3]) / 1024 / 1024 : null,
      logicalCores: hardware.logicalCores || systemValue(() => os.availableParallelism()),
      hardware,
      cores,
    },
    ollama: {
      cpu: ollamaCpu,
      rssGB: ollamaRssKB / 1024 / 1024,
      processes: ollamaProcesses,
      models,
    },
    requests: { active: requests.size, ...counters },
  };
}

async function serveAsset(response, name, contentType) {
  try {
    const body = await readFile(path.join(publicDir, name));
    response.writeHead(200, {
      "content-type": contentType,
      "content-length": body.length,
      "cache-control": "no-cache",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (requestUrl.pathname === "/monitor" || requestUrl.pathname === "/monitor/") {
    if (!requestUrl.searchParams.has("prototype") && !requestUrl.searchParams.has("surface")) {
      const preferred = prototypeFeedbackStore.snapshot().preferredView;
      const location = preferredMonitorLocation(preferred);
      if (location) {
        response.writeHead(302, { location, "cache-control": "no-store" });
        response.end();
        return;
      }
    }
    return serveAsset(response, "index.html", "text/html; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/styles.css") {
    return serveAsset(response, "styles.css", "text/css; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/date-time-sort.js") {
    return serveAsset(response, "date-time-sort.js", "text/javascript; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/monitor-store.js") {
    return serveAsset(response, "monitor-store.js", "text/javascript; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/monitor-shell.js") {
    return serveAsset(response, "monitor-shell.js", "text/javascript; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/monitor-ux-prototypes.css") {
    return serveAsset(response, "monitor-ux-prototypes.css", "text/css; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/prototype-feedback-lab.css") {
    return serveAsset(response, "prototype-feedback-lab.css", "text/css; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/app.js") {
    return serveAsset(response, "app.js", "text/javascript; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/monitor-ux-prototypes.js") {
    return serveAsset(response, "monitor-ux-prototypes.js", "text/javascript; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/prototype-feedback-lab.js") {
    return serveAsset(response, "prototype-feedback-lab.js", "text/javascript; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/usage-timeline-prototype.js") {
    return serveAsset(response, "usage-timeline-prototype.js", "text/javascript; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/usage-timeline.js") {
    return serveAsset(response, "usage-timeline.js", "text/javascript; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/usage-timeline-view-model.mjs") {
    return serveAsset(response, "../usage-timeline-view-model.mjs", "text/javascript; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/usage-timeline-prototype-fixture.js") {
    return serveAsset(response, "usage-timeline-prototype-fixture.js", "text/javascript; charset=utf-8");
  }
  if (requestUrl.pathname === "/monitor/api/state") {
    return json(response, 200, initialState({ includeHistoricalData: requestUrl.searchParams.get("compact") !== "1" }));
  }
  if (requestUrl.pathname === "/monitor/api/usage-timeline" && request.method === "GET") {
    return json(response, 200, usageTimelineStore.snapshot());
  }
  if (requestUrl.pathname === "/monitor/api/prototype-feedback" && request.method === "GET") {
    return json(response, 200, prototypeFeedbackStore.snapshot());
  }
  if (requestUrl.pathname === "/monitor/api/request-capture" && request.method === "GET") {
    if (!isLoopbackRequest(request) || !hasTrustedDashboardOrigin(request)) {
      return json(response, 403, { error: "Full request journals are only available to the local dashboard" });
    }
    const capture = await readVsCodeRequestCapture({
      edition: requestUrl.searchParams.get("client"),
      sessionId: requestUrl.searchParams.get("session"),
      requestId: requestUrl.searchParams.get("request"),
    });
    if (!capture) return json(response, 404, { error: "The complete local journal record is unavailable" });
    return json(response, 200, {
      input: capture.prompt || capture.transformedPrompt || capture.submittedPrompt || "",
      output: capture.response || "",
      reasoning: capture.thinking || "",
      submitted: capture.submittedPrompt || "",
      inputStatus: capture.inputContextStatus || "captured",
      tools: capture.tools || [],
    });
  }
  if (requestUrl.pathname === "/monitor/api/prototype-feedback/export" && request.method === "GET") {
    return json(response, 200, prototypeFeedbackStore.exportBundle());
  }
  if (requestUrl.pathname === "/monitor/api/prototype-feedback/profile" && request.method === "POST") {
    if (!isLocalControlRequest(request)) return json(response, 403, { error: "Prototype review changes are local only" });
    try {
      const snapshot = await prototypeFeedbackStore.setReviewer(await readJsonRequest(request));
      sendEvent("prototype-feedback", snapshot);
      return json(response, 200, snapshot);
    } catch (error) {
      return json(response, 400, { error: `Could not save reviewer: ${error.message}` });
    }
  }
  if (requestUrl.pathname === "/monitor/api/prototype-feedback/preferred-view" && request.method === "POST") {
    if (!isLocalControlRequest(request)) return json(response, 403, { error: "Prototype preferences are local only" });
    try {
      const snapshot = await prototypeFeedbackStore.setPreferredView(await readJsonRequest(request, 32_768));
      sendEvent("prototype-feedback", snapshot);
      return json(response, 200, snapshot);
    } catch (error) {
      return json(response, 400, { error: `Could not save preferred view: ${error.message}` });
    }
  }
  if (requestUrl.pathname === "/monitor/api/prototype-feedback/comment" && request.method === "POST") {
    if (!isLocalControlRequest(request)) return json(response, 403, { error: "Prototype review changes are local only" });
    try {
      const result = await prototypeFeedbackStore.addComment(await readJsonRequest(request, 16_384));
      sendEvent("prototype-feedback", result.snapshot);
      return json(response, 200, result);
    } catch (error) {
      return json(response, 400, { error: `Could not save comment: ${error.message}` });
    }
  }
  if (requestUrl.pathname === "/monitor/api/prototype-feedback/comment" && request.method === "DELETE") {
    if (!isLoopbackRequest(request) || !hasTrustedDashboardOrigin(request)) return json(response, 403, { error: "Prototype review changes are local only" });
    try {
      const snapshot = await prototypeFeedbackStore.deleteComment(requestUrl.searchParams.get("id"));
      sendEvent("prototype-feedback", snapshot);
      return json(response, 200, snapshot);
    } catch (error) {
      return json(response, 400, { error: `Could not delete comment: ${error.message}` });
    }
  }
  if (requestUrl.pathname === "/monitor/api/prototype-feedback/activity" && request.method === "POST") {
    if (!isLocalControlRequest(request)) return json(response, 403, { error: "Prototype review changes are local only" });
    try {
      const body = await readJsonRequest(request, 131_072);
      const snapshot = await prototypeFeedbackStore.recordActivity(Array.isArray(body.entries) ? body.entries : []);
      return json(response, 200, snapshot);
    } catch (error) {
      return json(response, 400, { error: `Could not save prototype activity: ${error.message}` });
    }
  }
  if (requestUrl.pathname === "/monitor/api/prototype-feedback/import" && request.method === "POST") {
    if (!isLocalControlRequest(request)) return json(response, 403, { error: "Prototype review changes are local only" });
    try {
      const snapshot = await prototypeFeedbackStore.importBundle(await readJsonRequest(request, 8_000_000));
      sendEvent("prototype-feedback", snapshot);
      return json(response, 200, snapshot);
    } catch (error) {
      return json(response, 400, { error: `Could not import review bundle: ${error.message}` });
    }
  }
  if (requestUrl.pathname === "/monitor/api/prototype-feedback" && request.method === "DELETE") {
    if (!isLoopbackRequest(request) || !hasTrustedDashboardOrigin(request)) return json(response, 403, { error: "Prototype review changes are local only" });
    try {
      const snapshot = await prototypeFeedbackStore.reset();
      sendEvent("prototype-feedback", snapshot);
      return json(response, 200, snapshot);
    } catch (error) {
      return json(response, 500, { error: `Could not reset prototype feedback: ${error.message}` });
    }
  }
  if (requestUrl.pathname === "/monitor/api/usage-timeline/profile" && request.method === "POST") {
    if (!isLocalControlRequest(request)) {
      return json(response, 403, { error: "Timeline changes are only available to the local dashboard" });
    }
    try {
      const body = await readJsonRequest(request);
      const timeline = await usageTimelineStore.renameUnverifiedProfile(body.label);
      sendEvent("usage-timeline", timeline);
      return json(response, 200, timeline);
    } catch (error) {
      return json(response, 400, { error: `Could not rename local profile: ${error.message}` });
    }
  }
  if (requestUrl.pathname === "/monitor/api/usage-timeline/prompt-excerpts" && request.method === "DELETE") {
    if (!isLoopbackRequest(request) || !hasTrustedDashboardOrigin(request)) {
      return json(response, 403, { error: "Timeline changes are only available to the local dashboard" });
    }
    try {
      const timeline = await usageTimelineStore.clearPromptExcerpts();
      sendEvent("usage-timeline", timeline);
      return json(response, 200, timeline);
    } catch (error) {
      return json(response, 500, { error: `Could not clear timeline prompt excerpts: ${error.message}` });
    }
  }
  if (requestUrl.pathname === "/monitor/api/usage-timeline" && request.method === "DELETE") {
    if (!isLoopbackRequest(request) || !hasTrustedDashboardOrigin(request)) {
      return json(response, 403, { error: "Timeline changes are only available to the local dashboard" });
    }
    try {
      const timeline = await usageTimelineStore.resetUsageHistory();
      sendEvent("usage-timeline", timeline);
      return json(response, 200, timeline);
    } catch (error) {
      return json(response, 500, { error: `Could not reset usage timeline history: ${error.message}` });
    }
  }
  if (requestUrl.pathname === "/monitor/api/history" && request.method === "DELETE") {
    if (!isLoopbackRequest(request) || !hasTrustedDashboardOrigin(request)) {
      return json(response, 403, { error: "History deletion is only available to the local dashboard" });
    }
    try {
      return json(response, 200, await clearHistory());
    } catch (error) {
      return json(response, 500, { error: `Could not clear monitor history: ${error.message}` });
    }
  }
  if (requestUrl.pathname === "/monitor/api/ollama" && request.method === "POST") {
    if (!isLocalControlRequest(request)) {
      return json(response, 403, { error: "Ollama power control is only available to the local dashboard" });
    }
    try {
      const body = await readJsonRequest(request);
      if (typeof body.enabled !== "boolean") return json(response, 400, { error: "enabled must be true or false" });
      const metrics = await setOllamaEnabled(body.enabled);
      return json(response, 200, { enabled: body.enabled, metrics });
    } catch (error) {
      return json(response, 503, { error: error.message });
    }
  }
  if (requestUrl.pathname === "/monitor/api/copilot-budget" && request.method === "POST") {
    if (!isLocalControlRequest(request)) {
      return json(response, 403, { error: "Copilot budget changes are only available to the local dashboard" });
    }
    try {
      const body = await readJsonRequest(request);
      const usage = await copilotUsage.setBudget(body.monthlyBudgetUsd);
      const dashboard = copilotDashboardState(usage);
      sendEvent("copilot", dashboard);
      return json(response, 200, dashboard);
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }
  if (requestUrl.pathname === "/monitor/api/copilot-token-price" && request.method === "POST") {
    if (!isLocalControlRequest(request)) {
      return json(response, 403, { error: "Copilot token-price changes are only available to the local dashboard" });
    }
    try {
      const body = await readJsonRequest(request);
      const usage = await copilotUsage.setTokenPrice(body.tokenPriceUsdPerMillion);
      const dashboard = copilotDashboardState(usage);
      sendEvent("copilot", dashboard);
      return json(response, 200, dashboard);
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }
  if (requestUrl.pathname === "/monitor/events") {
    const compact = requestUrl.searchParams.get("compact") === "1";
    eventStream.subscribe(request, response, initialState({ includeHistoricalData: !compact }));
    return;
  }
  return proxyRequest(request, response);
});

// Optional transparent LAN listener. This lets existing clients keep using the
// conventional Ollama port while the real Ollama process stays private on a
// different upstream port.
const proxyServer = proxyPort
  ? http.createServer((request, response) => proxyRequest(request, response))
  : null;

setInterval(() => {
  eventStream.heartbeat();
}, 15_000).unref();

async function refreshMetrics() {
  latestMetrics = await collectMetrics();
  sendEvent("metrics", latestMetrics);
  return latestMetrics;
}

async function refreshCopilotUsage() {
  const usage = await copilotUsage.refresh();
  sendEvent("copilot", copilotDashboardState(usage));
  return usage;
}

await refreshMetrics();
console.log(JSON.stringify({
  event: "hardware-topology-detected",
  ...latestMetrics?.system?.hardware,
}));
setInterval(() => void refreshMetrics(), 2_000).unref();
void refreshCopilotUsage();
setInterval(() => void refreshCopilotUsage(), 5 * 60_000).unref();

server.listen(listenPort, listenHost, () => {
  console.log(`Ollama monitor: http://${listenHost}:${listenPort}/monitor/`);
  console.log(`Proxying Ollama: ${upstream.origin}`);
});

proxyServer?.listen(proxyPort, proxyHost, () => {
  console.log(`Monitored Ollama LAN endpoint: http://${proxyHost}:${proxyPort}`);
});
