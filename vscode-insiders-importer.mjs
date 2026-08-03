import os from "node:os";
import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { parseVsCodeChatJournal } from "./copilot-capture.mjs";
import { INSIDERS_LOCAL_PROFILE_ID } from "./usage-timeline-store.mjs";

const DEFAULT_POLL_MS = 5_000;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function toIso(value) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return undefined;
}

function messageText(value) {
  const text = typeof value?.text === "string" ? value.text : typeof value === "string" ? value : "";
  return text.replace(/\s+/g, " ").trim().slice(0, 180) || undefined;
}

export function modelFamily(model) {
  const label = String(model || "").toLowerCase();
  if (!label) return null;
  if (label.includes("opus")) return "claude-opus";
  if (label.includes("sonnet")) return "claude-sonnet";
  if (label.includes("haiku")) return "claude-haiku";
  if (label.includes("claude")) return "claude";
  if (label.includes("gpt")) return "gpt";
  if (label.includes("gemini")) return "gemini";
  return "other";
}

// VS Code currently exposes this as a client-details display string.  We use
// only the exact `model • N credits` form; any other number is unavailable.
export function findClientDisplayedCredits(value) {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (key === "details" && typeof child === "string") {
      const match = child.match(/^(.+?)\s*•\s*([\d.]+)\s+credits?$/i);
      const credits = finite(match?.[2]);
      if (match && credits != null) return { model: match[1].trim(), credits };
    }
    const found = findClientDisplayedCredits(child);
    if (found) return found;
  }
  return null;
}

function encoded(...parts) {
  return parts.map((part) => encodeURIComponent(String(part))).join(":");
}

export function normalizeVsCodeInsidersRequest({ sessionId, journalName, request, requestOrdinal = 0, observedAt = new Date().toISOString() }) {
  const startedAt = toIso(request?.timestamp);
  if (!startedAt) return null;
  const session = String(sessionId || journalName || "unknown-session");
  const requestId = typeof request?.requestId === "string" && request.requestId ? request.requestId : null;
  const responseId = typeof request?.responseId === "string" && request.responseId ? request.responseId : null;
  const identity = requestId
    ? { strength: "strong", durableKey: encoded("vscode-insiders", session, "request", requestId), requestId, responseId, requestOrdinal: null }
    : responseId
      ? { strength: "response-fallback", durableKey: encoded("vscode-insiders", session, "response", responseId), requestId: null, responseId, requestOrdinal: null }
      // Ordinal makes simultaneous timestamp-only records distinct. It is part
      // of the weak identity rather than a claim that they are one request.
      : { strength: "weak-timestamp", durableKey: encoded("vscode-insiders", session, "timestamp", startedAt, requestOrdinal), requestId: null, responseId: null, requestOrdinal };
  const metadata = request.result?.metadata || {};
  const credits = findClientDisplayedCredits(request);
  const exactModel = request.modelId || metadata.resolvedModel || credits?.model || null;
  const completedAt = toIso(request.modelState?.completedAt || request.responseTimestamp);
  const elapsedMs = finite(request.elapsedMs ?? request.result?.timings?.totalElapsed);
  const inputTokens = finite(request.promptTokens ?? metadata.promptTokens);
  const outputTokens = finite(request.completionTokens ?? metadata.completionTokens ?? metadata.outputTokens);
  const totalTokens = finite(request.totalTokens ?? metadata.totalTokens);
  const normalizedSessionId = encoded("vscode-insiders", "session", session);

  return {
    session: {
      id: normalizedSessionId,
      profileId: INSIDERS_LOCAL_PROFILE_ID,
      clientSource: "vscode-insiders",
      clientSessionId: sessionId ? String(sessionId) : null,
      identityStatus: sessionId ? "client-reported" : "journal-file-fallback",
      sourceReference: { journalSessionId: session, journalName: journalName || null },
    },
    usageEvent: {
      id: encoded("usage-event", identity.durableKey),
      profileId: INSIDERS_LOCAL_PROFILE_ID,
      providerId: "github-copilot",
      clientSource: "vscode-insiders",
      sessionId: normalizedSessionId,
      identity,
      timing: {
        startedAt,
        completedAt: completedAt || null,
        usageAt: completedAt || startedAt,
        durationMs: elapsedMs == null || elapsedMs < 0 ? null : elapsedMs,
      },
      model: { exactLabel: exactModel, family: modelFamily(exactModel) },
      measurements: {
        inputTokens,
        outputTokens,
        totalTokens,
        nativeUnit: credits ? { value: credits.credits } : null,
      },
      evidence: { source: "client-record", status: "durable", observedAt },
      sourceReference: {
        journalSessionId: session,
        journalName: journalName || null,
        requestId,
        responseId,
        requestStartedAt: startedAt,
      },
      promptExcerpt: messageText(request.message),
    },
  };
}

async function listChatJournals(root) {
  const journals = [];
  let workspaces;
  try { workspaces = await readdir(root, { withFileTypes: true }); }
  catch (error) { return { journals, unavailable: error.code === "ENOENT" || error.code === "ENOTDIR", failure: error.message }; }
  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue;
    const chatDirectory = path.join(root, workspace.name, "chatSessions");
    let entries;
    try { entries = await readdir(chatDirectory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) if (entry.isFile() && entry.name.endsWith(".jsonl")) journals.push(path.join(chatDirectory, entry.name));
  }
  return { journals, unavailable: false, failure: null };
}

export function createVsCodeInsidersImporter({
  store,
  root = path.join(os.homedir(), "Library", "Application Support", "Code - Insiders", "User", "workspaceStorage"),
  pollMs = DEFAULT_POLL_MS,
  onChange = () => {},
} = {}) {
  if (!store?.upsertImport) throw new Error("createVsCodeInsidersImporter requires a usage timeline store");
  const files = new Map(); // Ephemeral paths and safe normalized records only; never persisted.
  let poller;
  let pending = null;

  async function importAvailable() {
    if (pending) return pending;
    pending = (async () => {
      const checkedAt = new Date().toISOString();
      const scan = await listChatJournals(root);
      let parseableJournalCount = 0;
      let latestClientRecordAt = null;
      let failure = scan.failure;
      const seen = new Set(scan.journals);
      const sessionsToImport = [];
      const eventsToImport = [];
      for (const file of scan.journals) {
        let fileStat;
        try { fileStat = await stat(file); } catch { continue; }
        const previous = files.get(file);
        if (previous?.mtimeMs === fileStat.mtimeMs && previous?.size === fileStat.size) {
          parseableJournalCount += 1;
          for (const event of previous.events) if (!latestClientRecordAt || event.timing.startedAt > latestClientRecordAt) latestClientRecordAt = event.timing.startedAt;
          continue;
        }
        try {
          const state = parseVsCodeChatJournal(await readFile(file, "utf8"));
          const sessionId = typeof state.sessionId === "string" && state.sessionId ? state.sessionId : null;
          const journalName = path.basename(file, ".jsonl");
          const normalized = (state.requests || []).map((request, requestOrdinal) =>
            normalizeVsCodeInsidersRequest({ sessionId, journalName, request, requestOrdinal, observedAt: checkedAt })
          ).filter(Boolean);
          sessionsToImport.push(...normalized.map((record) => record.session));
          eventsToImport.push(...normalized.map((record) => record.usageEvent));
          parseableJournalCount += 1;
          files.set(file, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, events: normalized.map((record) => record.usageEvent) });
          for (const record of normalized) if (!latestClientRecordAt || record.usageEvent.timing.startedAt > latestClientRecordAt) latestClientRecordAt = record.usageEvent.timing.startedAt;
        } catch (error) {
          failure = failure || error.message;
        }
      }
      for (const file of files.keys()) if (!seen.has(file)) files.delete(file);
      const coverage = {
        clientSource: "vscode-insiders",
        status: scan.unavailable ? "unavailable" : failure ? "partial" : "available",
        checkedAt,
        latestClientRecordAt,
        availableJournalCount: scan.journals.length,
        parseableJournalCount,
        // This is a count of records revisited from changed client journals,
        // not a claim of complete provider coverage.
        importedRecordCount: eventsToImport.length,
        failure,
      };
      // One atomic write per scan keeps a large recovered-history import from
      // delaying the gateway by rewriting its growing timeline for each file.
      const result = await store.upsertImport({
        sessions: sessionsToImport,
        usageEvents: eventsToImport,
        coverage,
      });
      const change = { ...result, coverage };
      onChange(change);
      return change;
    })().finally(() => { pending = null; });
    return pending;
  }

  return {
    importAvailable,
    start() {
      if (!poller) {
        poller = setInterval(() => void importAvailable(), pollMs);
        poller.unref?.();
      }
      return importAvailable();
    },
    close() { if (poller) clearInterval(poller); poller = null; },
  };
}
