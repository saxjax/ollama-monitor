import os from "node:os";
import path from "node:path";
import { appendFile, chmod, mkdir, open, readFile, readdir, stat, unlink } from "node:fs/promises";
import { finishCaptureRecord, normalizeCaptureRecord } from "./capture-core.mjs";

const DEFAULT_POLL_MS = 1_000;
const DEFAULT_MAX_HISTORY = 50;

function asText(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function section(label, value) {
  const text = asText(value).trim();
  return text ? `\n\n--- ${label} ---\n${text}` : "";
}

function valueText(value) {
  if (typeof value === "string") return value;
  if (typeof value?.value === "string") return value.value;
  if (typeof value?.message === "string") return value.message;
  return asText(value);
}

function applyJournalEntry(state, entry) {
  if (entry.kind === 0) return entry.v;
  if (!state || !Array.isArray(entry.k)) return state;
  let target = state;
  for (let index = 0; index < entry.k.length - 1; index += 1) {
    const key = entry.k[index];
    if (target[key] == null) target[key] = typeof entry.k[index + 1] === "number" ? [] : {};
    target = target[key];
  }
  const key = entry.k.at(-1);
  if (entry.kind === 1) target[key] = entry.v;
  if (entry.kind === 2) {
    if (!Array.isArray(target[key])) target[key] = [];
    target[key].push(...(Array.isArray(entry.v) ? entry.v : [entry.v]));
  }
  return state;
}

export function parseVsCodeChatJournal(contents) {
  let state;
  for (const line of contents.split("\n")) {
    if (!line.trim()) continue;
    try { state = applyJournalEntry(state, JSON.parse(line)); } catch { /* Ignore an incomplete final write. */ }
  }
  return state || { requests: [] };
}

function vsCodeResponse(request) {
  let response = "";
  let thinking = "";
  const tools = [];
  for (const part of request.response || []) {
    if (part?.kind === "thinking") {
      thinking += valueText(part.value);
    } else if (part?.kind === "toolInvocationSerialized") {
      const tool = {
        id: part.toolCallId,
        name: part.toolId || part.generatedTitle || "tool",
        arguments: part.toolSpecificData ?? part.invocationMessage,
        result: part.resultDetails ?? part.pastTenseMessage,
        status: part.isComplete ? "complete" : "running",
        record: part,
      };
      tools.push(tool);
      response += section(`TOOL ${tool.name} · FULL RECORD`, part);
    } else if (typeof part?.value === "string") {
      response += part.value;
    } else if (part?.kind && !["undoStop", "inlineReference", "codeblockUri"].includes(part.kind)) {
      response += section(part.kind.toUpperCase(), part);
    }
  }
  return { response, thinking, tools };
}

function renderedContext(metadata) {
  const global = Array.isArray(metadata.renderedGlobalContext) ? metadata.renderedGlobalContext : [];
  const user = Array.isArray(metadata.renderedUserMessage) ? metadata.renderedUserMessage : [];
  if (!global.length && !user.length) return null;
  const parts = [...global, ...user].map((part) => ({
    type: part?.type || "context",
    text: typeof part?.text === "string" ? part.text : asText(part?.text),
  }));
  return {
    global,
    user,
    text: parts.map((part) => `${String(part.type).toUpperCase()}\n${part.text}`).join("\n\n"),
  };
}

function normalizeVsCodeRequest(edition, sessionId, request, sessionState = {}) {
  const source = edition === "vscode-insiders" ? "vscode-insiders" : "vscode";
  const id = `${source}-${sessionId}-${request.requestId || request.responseId || request.timestamp}`;
  const message = valueText(request.message?.text ?? request.message);
  const context = request.variableData?.variables?.length
    ? section("ATTACHED CONTEXT", request.variableData.variables)
    : "";
  const attachments = request.contentReferences?.length
    ? section("CONTENT REFERENCES", request.contentReferences)
    : "";
  const output = vsCodeResponse(request);
  const resultMetadata = request.result?.metadata || {};
  const exactContext = renderedContext(resultMetadata);
  const selectedModel = sessionState.inputState?.selectedModel;
  const contextWindow = selectedModel?.identifier === request.modelId
    ? selectedModel.metadata?.maxInputTokens
    : undefined;
  const promptTokens = request.promptTokens ?? resultMetadata.promptTokens;
  const outputTokens = request.completionTokens ?? resultMetadata.outputTokens;
  const elapsedMs = request.elapsedMs ?? request.result?.timings?.totalElapsed;
  const completedAt = request.modelState?.completedAt || request.responseTimestamp;
  const complete = Boolean(request.modelState?.completedAt || request.result);
  return normalizeStored({
    id,
    source,
    client: edition === "vscode-insiders" ? "VS Code Insiders Copilot" : "VS Code Copilot",
    sessionId,
    interactionId: request.requestId || id,
    model: request.modelId || "GitHub Copilot",
    prompt: exactContext?.text || `${message}${context}${attachments}`,
    submittedPrompt: message,
    inputContext: exactContext ? { global: exactContext.global, user: exactContext.user } : null,
    inputContextStatus: exactContext ? "client-rendered" : "reconstructed",
    messages: exactContext
      ? [{ role: "copilot rendered context", content: exactContext.text }]
      : [{ role: "user", content: `${message}${context}${attachments}` }],
    ...output,
    startedAt: new Date(request.timestamp || Date.now()).toISOString(),
    finishedAt: complete ? new Date(completedAt || Date.now()).toISOString() : null,
    status: complete ? "complete" : "streaming",
    httpStatus: null,
    metrics: {
      promptTokens: Number.isFinite(promptTokens) ? promptTokens : undefined,
      outputTokens: Number.isFinite(outputTokens) ? outputTokens : undefined,
      totalDurationNs: Number.isFinite(elapsedMs) ? elapsedMs * 1e6 : undefined,
      outputDurationNs: Number.isFinite(elapsedMs) ? elapsedMs * 1e6 : undefined,
      contextWindow: Number.isFinite(contextWindow) ? contextWindow : undefined,
    },
  });
}

function normalizeStored(item) {
  return normalizeCaptureRecord({ source: "copilot-cli", ...item });
}

function vscodeCompletionSignature(item) {
  return JSON.stringify({
    status: item.status,
    prompt: item.prompt,
    response: item.response,
    thinking: item.thinking,
    tools: item.tools,
    metrics: item.metrics,
    finishedAt: item.finishedAt,
  });
}

export async function loadCopilotCaptureHistory(logPath, maxHistory = DEFAULT_MAX_HISTORY) {
  try {
    const lines = (await readFile(logPath, "utf8")).trim().split("\n").filter(Boolean);
    const byId = new Map();
    for (const line of lines) {
      const item = normalizeStored(JSON.parse(line));
      byId.delete(item.id);
      byId.set(item.id, item);
    }
    return [...byId.values()].slice(-maxHistory).reverse();
  } catch {
    return [];
  }
}

export async function createCopilotCapture({
  dataDir,
  sessionsRoot = path.join(os.homedir(), ".copilot", "session-state"),
  vscodeRoots = [
    { edition: "vscode", root: path.join(os.homedir(), "Library", "Application Support", "Code", "User", "workspaceStorage") },
    { edition: "vscode-insiders", root: path.join(os.homedir(), "Library", "Application Support", "Code - Insiders", "User", "workspaceStorage") },
  ],
  pollMs = DEFAULT_POLL_MS,
  maxHistory = DEFAULT_MAX_HISTORY,
  onChange = () => {},
} = {}) {
  const logPath = path.join(dataDir, "copilot-traffic.jsonl");
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const history = await loadCopilotCaptureHistory(logPath, maxHistory);
  const active = new Map();
  const cursors = new Map();
  const vscodeFiles = new Map();
  const vscodeTracked = new Map();
  const cliContexts = new Map();
  const cliTracked = new Map();
  const cliHistories = new Map();
  const captureStartedAt = Date.now();
  let timer;
  let polling = false;
  let fileOperation = Promise.resolve();

  function queueFile(operation) {
    fileOperation = fileOperation.then(operation, operation);
    return fileOperation;
  }

  function hydrateCliHistory(sessionId, contents) {
    const turns = [];
    const byInteraction = new Map();
    for (const line of contents.split("\n")) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      const data = event.data || {};
      const interactionId = data.interactionId || data.requestId;
      if (event.type === "user.message" && interactionId) {
        const turn = {
          interactionId,
          submittedUser: asText(data.content),
          user: asText(data.transformedContent || data.content),
          assistant: "",
          thinking: "",
          tools: [],
        };
        byInteraction.set(interactionId, turn);
        turns.push(turn);
        continue;
      }
      const turn = interactionId ? byInteraction.get(interactionId) : turns.at(-1);
      if (!turn) continue;
      if (event.type === "assistant.message") {
        turn.assistant += asText(data.content);
        turn.thinking += asText(data.reasoningText);
      } else if (event.type === "tool.execution_start") {
        const tool = { id: data.toolCallId, name: data.toolName, arguments: data.arguments, status: "running" };
        turn.tools.push(tool);
        turn.assistant += section(`TOOL ${data.toolName || "CALL"} · INPUT`, data.arguments);
      } else if (event.type === "tool.execution_complete") {
        const tool = turn.tools.find((entry) => entry.id === data.toolCallId) || { id: data.toolCallId, name: "tool" };
        tool.status = data.success === false ? "error" : "complete";
        tool.result = data.result ?? data.error;
        if (!turn.tools.includes(tool)) turn.tools.push(tool);
        turn.assistant += section(`TOOL ${tool.name || "CALL"} · ${tool.status.toUpperCase()}`, tool.result);
      }
    }
    cliHistories.set(sessionId, turns);
  }

  function snapshot() {
    return { active: [...active.values()], history: [...history] };
  }

  async function persist(item) {
    await queueFile(async () => {
      await appendFile(logPath, `${JSON.stringify(item)}\n`, { encoding: "utf8", mode: 0o600 });
      await chmod(logPath, 0o600);
    });
  }

  function complete(item, timestamp, status = "complete") {
    finishCaptureRecord(item, timestamp, status);
    item.metrics.outputDurationNs ||= item.metrics.totalDurationNs;
    active.delete(item.id);
    const existing = history.findIndex((entry) => entry.id === item.id);
    if (existing >= 0) history[existing] = { ...item };
    else history.unshift({ ...item });
    history.splice(maxHistory);
    if (item.source === "copilot-cli") {
      const turns = cliHistories.get(item.sessionId) || [];
      const turn = {
        interactionId: item.interactionId,
        submittedUser: item.submittedPrompt,
        user: item.transformedPrompt || item.submittedPrompt || item.prompt,
        assistant: item.response,
        thinking: item.thinking,
        tools: item.tools,
      };
      const turnIndex = turns.findIndex((entry) => entry.interactionId === item.interactionId);
      if (turnIndex >= 0) turns[turnIndex] = turn;
      else turns.push(turn);
      cliHistories.set(item.sessionId, turns);
    }
    void persist(item);
    onChange("complete", { ...item });
  }

  function acceptVsCodeItem(item) {
    const previous = vscodeTracked.get(item.id);
    if (previous?.status === "complete" && item.status === "complete" &&
        vscodeCompletionSignature(previous) === vscodeCompletionSignature(item)) return;
    vscodeTracked.set(item.id, item);
    if (!previous) {
      if (item.status === "complete") {
        history.unshift({ ...item });
        history.splice(maxHistory);
        void persist(item);
        onChange("complete", { ...item });
      } else {
        active.set(item.id, item);
        onChange("started", { ...item });
      }
      return;
    }
    if (item.status === "complete") {
      active.delete(item.id);
      const index = history.findIndex((entry) => entry.id === item.id);
      if (index >= 0) history[index] = { ...item };
      else history.unshift({ ...item });
      history.splice(maxHistory);
      void persist(item);
      onChange("complete", { ...item });
    } else {
      active.set(item.id, item);
      onChange("updated", { ...item });
    }
  }

  function processEvent(sessionId, event) {
    const data = event?.data || {};
    const interactionId = data.interactionId || data.requestId;
    if (event.type === "system.message") {
      const context = {
        interactionId: interactionId || null,
        role: data.role || "system",
        content: asText(data.content),
      };
      cliContexts.set(`${sessionId}:latest`, context);
      if (interactionId) cliContexts.set(`${sessionId}:${interactionId}`, context);
      return;
    }
    if (event.type === "user.message") {
      const id = `copilot-${sessionId}-${interactionId || event.id}`;
      const systemContext = cliContexts.get(`${sessionId}:${interactionId}`) || cliContexts.get(`${sessionId}:latest`);
      cliContexts.delete(`${sessionId}:latest`);
      if (interactionId) cliContexts.delete(`${sessionId}:${interactionId}`);
      const submittedPrompt = asText(data.content);
      const transformedUser = asText(data.transformedContent || data.content);
      const conversationHistory = cliHistories.get(sessionId) || [];
      const historyText = conversationHistory.map((turn) => [
        turn.submittedUser && turn.submittedUser !== turn.user ? `SUBMITTED USER\n${turn.submittedUser}` : "",
        `TRANSFORMED USER\n${turn.user}`,
        turn.thinking ? `ASSISTANT REASONING\n${turn.thinking}` : "",
        turn.assistant ? `ASSISTANT\n${turn.assistant}` : "",
      ].filter(Boolean).join("\n\n")).join("\n\n");
      const attachmentContext = Array.isArray(data.attachments) && data.attachments.length
        ? section("ATTACHMENTS", data.attachments)
        : "";
      const renderedInput = systemContext?.content
        ? [
            `SYSTEM\n${systemContext.content}`,
            historyText ? `CONVERSATION HISTORY\n${historyText}` : "",
            `TRANSFORMED USER\n${transformedUser}${attachmentContext}`,
          ].filter(Boolean).join("\n\n")
        : [historyText ? `CONVERSATION HISTORY\n${historyText}` : "", `${transformedUser}${attachmentContext}`]
          .filter(Boolean).join("\n\n");
      const item = normalizeStored({
        id,
        sessionId,
        interactionId: interactionId || event.id,
        model: "Copilot",
        prompt: renderedInput,
        submittedPrompt,
        transformedPrompt: transformedUser,
        inputContext: systemContext ? {
          system: systemContext,
          history: conversationHistory,
          user: {
            content: data.content,
            transformedContent: data.transformedContent,
            attachments: data.attachments || [],
          },
        } : null,
        inputContextStatus: "reconstructed",
        messages: systemContext
          ? [{ role: "copilot cli rendered context", content: renderedInput }]
          : [{ role: "user", content: renderedInput }],
        response: "",
        thinking: "",
        tools: [],
        startedAt: event.timestamp,
        finishedAt: null,
        status: "streaming",
        httpStatus: null,
        metrics: {},
      });
      active.set(id, item);
      cliTracked.set(`${sessionId}:${item.interactionId}`, item);
      onChange("started", { ...item });
      return;
    }

    const item = (interactionId ? cliTracked.get(`${sessionId}:${interactionId}`) : null) ||
      [...active.values()].reverse().find((entry) =>
      !interactionId || entry.interactionId === interactionId
    );
    if (!item) return;

    if (data.model) item.model = data.model;
    if (event.type === "assistant.turn_start" && item.status === "complete") {
      item.status = "streaming";
      item.finishedAt = null;
      const index = history.findIndex((entry) => entry.id === item.id);
      if (index >= 0) history.splice(index, 1);
      active.set(item.id, item);
      onChange("updated", { ...item });
    }
    if (event.type === "assistant.message") {
      if (item.status === "complete") {
        item.status = "streaming";
        item.finishedAt = null;
        const index = history.findIndex((entry) => entry.id === item.id);
        if (index >= 0) history.splice(index, 1);
        active.set(item.id, item);
      }
      const assistantContent = asText(data.content);
      if (assistantContent && item.response && !item.response.endsWith("\n")) item.response += "\n";
      item.response += assistantContent;
      item.thinking += asText(data.reasoningText);
      if (Array.isArray(data.toolRequests)) item.tools.push(...data.toolRequests);
      if (Number.isFinite(data.outputTokens)) item.metrics.outputTokens = data.outputTokens;
      onChange("updated", { ...item });
    } else if (event.type === "tool.execution_start") {
      const tool = { id: data.toolCallId, name: data.toolName, arguments: data.arguments, status: "running" };
      item.tools.push(tool);
      item.response += section(`TOOL ${data.toolName || "CALL"} · INPUT`, data.arguments);
      onChange("updated", { ...item });
    } else if (event.type === "tool.execution_complete") {
      const tool = item.tools.find((entry) => entry.id === data.toolCallId) || { id: data.toolCallId, name: "tool" };
      tool.status = data.success === false ? "error" : "complete";
      tool.result = data.result ?? data.error;
      if (!item.tools.includes(tool)) item.tools.push(tool);
      item.response += section(`TOOL ${tool.name || "CALL"} · ${tool.status.toUpperCase()}`, tool.result);
      onChange("updated", { ...item });
    } else if (event.type === "assistant.turn_end") {
      complete(item, event.timestamp);
    } else if (event.type === "abort" || event.type === "session.error") {
      item.error = asText(data.message || data.reason || data);
      item.response += section("ERROR", item.error);
      complete(item, event.timestamp, "error");
    }
  }

  async function discover(initial = false) {
    let directories = [];
    try { directories = await readdir(sessionsRoot, { withFileTypes: true }); } catch { return; }
    for (const directory of directories) {
      if (!directory.isDirectory()) continue;
      const file = path.join(sessionsRoot, directory.name, "events.jsonl");
      let size;
      try { size = (await stat(file)).size; } catch { continue; }
      if (!cursors.has(file)) {
        cursors.set(file, {
          offset: initial ? size : 0,
          remainder: "",
          sessionId: directory.name,
          needsHydration: initial && size > 0,
        });
        if (initial || size === 0) continue;
      }
      const cursor = cursors.get(file);
      if (size < cursor.offset) { cursor.offset = 0; cursor.remainder = ""; }
      if (size === cursor.offset) continue;
      const handle = await open(file, "r");
      try {
        if (cursor.needsHydration) {
          const previous = Buffer.alloc(cursor.offset);
          await handle.read(previous, 0, cursor.offset, 0);
          hydrateCliHistory(cursor.sessionId, previous.toString("utf8"));
          cursor.needsHydration = false;
        }
        const length = size - cursor.offset;
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, cursor.offset);
        cursor.offset = size;
        const lines = (cursor.remainder + buffer.toString("utf8")).split("\n");
        cursor.remainder = lines.pop() || "";
        for (const line of lines) {
          try { processEvent(cursor.sessionId, JSON.parse(line)); } catch { /* Ignore partial or future event formats. */ }
        }
      } finally { await handle.close(); }
    }
  }

  async function listChatJournals(root) {
    const found = [];
    let workspaces = [];
    try { workspaces = await readdir(root, { withFileTypes: true }); } catch { return found; }
    for (const workspace of workspaces) {
      if (!workspace.isDirectory()) continue;
      const directory = path.join(root, workspace.name, "chatSessions");
      let entries = [];
      try { entries = await readdir(directory, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(path.join(directory, entry.name));
      }
    }
    return found;
  }

  async function discoverVsCode(initial = false) {
    for (const adapter of vscodeRoots) {
      for (const file of await listChatJournals(adapter.root)) {
        let fileStat;
        try { fileStat = await stat(file); } catch { continue; }
        const previous = vscodeFiles.get(file);
        if (previous?.mtimeMs === fileStat.mtimeMs && previous?.size === fileStat.size) continue;
        if (initial) {
          vscodeFiles.set(file, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, requestIds: new Set() });
          continue;
        }
        const state = parseVsCodeChatJournal(await readFile(file, "utf8"));
        const sessionId = state.sessionId || path.basename(file, ".jsonl");
        const requestIds = new Set((state.requests || []).map((request) =>
          normalizeVsCodeRequest(adapter.edition, sessionId, request, state).id
        ));
        if (!previous) {
          vscodeFiles.set(file, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, requestIds });
        }
        const known = previous?.requestIds || new Set();
        for (const request of state.requests || []) {
          const item = normalizeVsCodeRequest(adapter.edition, sessionId, request, state);
          if (!known.has(item.id) && Number(request.timestamp || 0) < captureStartedAt) continue;
          if (!known.has(item.id) || vscodeTracked.has(item.id)) acceptVsCodeItem(item);
        }
        vscodeFiles.set(file, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, requestIds });
      }
    }
  }

  async function poll() {
    if (polling) return;
    polling = true;
    try {
      await discover(false);
      await discoverVsCode(false);
      await fileOperation;
    } finally { polling = false; }
  }

  async function clear() {
    active.clear();
    history.splice(0);
    vscodeTracked.clear();
    await queueFile(() => unlink(logPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    }));
  }

  await discover(true);
  await discoverVsCode(true);
  timer = setInterval(() => void poll(), pollMs);
  timer.unref?.();

  return {
    snapshot,
    clear,
    poll,
    close() { clearInterval(timer); },
    logPath,
  };
}
