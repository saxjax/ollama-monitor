import path from "node:path";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";

export const TIMELINE_SCHEMA_VERSION = 1;
export const INSIDERS_LOCAL_PROFILE_ID = "github-copilot:local:vscode-insiders";

function clone(value) {
  return structuredClone(value);
}

function emptyState() {
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    profiles: [{
      id: INSIDERS_LOCAL_PROFILE_ID,
      providerId: "github-copilot",
      label: "VS Code Insiders (unverified local profile)",
      kind: "unverified-local",
      clientSource: "vscode-insiders",
      verifiedAccount: null,
    }],
    sessions: [],
    usageEvents: [],
    coverage: {},
    billingSnapshots: [],
    attribution: [],
    monetaryEstimates: [],
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isoTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function boundedText(value, maximum = 180) {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim().slice(0, maximum);
  return text || undefined;
}

function sanitizeSession(session) {
  if (!session?.id || session.clientSource !== "vscode-insiders") return null;
  return {
    id: String(session.id),
    profileId: INSIDERS_LOCAL_PROFILE_ID,
    providerId: "github-copilot",
    clientSource: "vscode-insiders",
    clientSessionId: typeof session.clientSessionId === "string" ? session.clientSessionId : null,
    identityStatus: session.identityStatus === "client-reported" ? "client-reported" : "journal-file-fallback",
    sourceReference: {
      client: "VS Code Insiders",
      journalSessionId: typeof session.sourceReference?.journalSessionId === "string" ? session.sourceReference.journalSessionId : null,
      journalName: typeof session.sourceReference?.journalName === "string" ? session.sourceReference.journalName : null,
    },
  };
}

// Deliberately pick fields rather than cloning an adapter record.  This is the
// storage privacy boundary: raw journals, responses, tool payloads and full
// prompts cannot enter this file accidentally.
function sanitizeUsageEvent(event) {
  if (!event?.id || !event?.sessionId || event.clientSource !== "vscode-insiders") return null;
  const startedAt = isoTimestamp(event.timing?.startedAt);
  if (!startedAt) return null;
  const completedAt = isoTimestamp(event.timing?.completedAt);
  const usageAt = isoTimestamp(event.timing?.usageAt) || completedAt || startedAt;
  const inputTokens = finiteNumber(event.measurements?.inputTokens);
  const outputTokens = finiteNumber(event.measurements?.outputTokens);
  const totalTokens = finiteNumber(event.measurements?.totalTokens);
  const nativeValue = finiteNumber(event.measurements?.nativeUnit?.value);
  const durationMs = finiteNumber(event.timing?.durationMs);
  const exactModelLabel = boundedText(event.model?.exactLabel, 200);
  const promptExcerpt = boundedText(event.promptExcerpt);

  return {
    id: String(event.id),
    profileId: INSIDERS_LOCAL_PROFILE_ID,
    providerId: "github-copilot",
    clientSource: "vscode-insiders",
    sessionId: String(event.sessionId),
    identity: {
      durableKey: String(event.identity?.durableKey || event.id),
      strength: ["strong", "response-fallback", "weak-timestamp"].includes(event.identity?.strength)
        ? event.identity.strength : "weak-timestamp",
      requestId: typeof event.identity?.requestId === "string" ? event.identity.requestId : null,
      responseId: typeof event.identity?.responseId === "string" ? event.identity.responseId : null,
      requestOrdinal: Number.isInteger(event.identity?.requestOrdinal) ? event.identity.requestOrdinal : null,
    },
    timing: {
      startedAt,
      completedAt: completedAt || null,
      usageAt,
      durationMs: durationMs == null || durationMs < 0 ? null : durationMs,
    },
    model: {
      exactLabel: exactModelLabel || null,
      family: typeof event.model?.family === "string" ? event.model.family : null,
    },
    measurements: {
      inputTokens: inputTokens == null ? null : inputTokens,
      outputTokens: outputTokens == null ? null : outputTokens,
      totalTokens: totalTokens == null ? null : totalTokens,
      nativeUnit: nativeValue == null ? null : {
        unit: "copilot-credits",
        label: "Copilot client-displayed credits",
        value: nativeValue,
        evidence: "client-observed",
      },
    },
    evidence: {
      source: "client-record",
      status: "durable",
      observedAt: isoTimestamp(event.evidence?.observedAt) || new Date().toISOString(),
    },
    sourceReference: {
      client: "VS Code Insiders",
      journalSessionId: typeof event.sourceReference?.journalSessionId === "string" ? event.sourceReference.journalSessionId : null,
      journalName: typeof event.sourceReference?.journalName === "string" ? event.sourceReference.journalName : null,
      requestId: typeof event.sourceReference?.requestId === "string" ? event.sourceReference.requestId : null,
      responseId: typeof event.sourceReference?.responseId === "string" ? event.sourceReference.responseId : null,
      requestStartedAt: startedAt,
    },
    promptExcerpt: promptExcerpt || null,
  };
}

function sanitizeCoverage(coverage) {
  if (!coverage || coverage.clientSource !== "vscode-insiders") return null;
  return {
    clientSource: "vscode-insiders",
    status: ["available", "partial", "unavailable", "error"].includes(coverage.status) ? coverage.status : "error",
    checkedAt: isoTimestamp(coverage.checkedAt) || new Date().toISOString(),
    latestClientRecordAt: isoTimestamp(coverage.latestClientRecordAt) || null,
    availableJournalCount: Math.max(0, Math.trunc(finiteNumber(coverage.availableJournalCount) || 0)),
    parseableJournalCount: Math.max(0, Math.trunc(finiteNumber(coverage.parseableJournalCount) || 0)),
    importedRecordCount: Math.max(0, Math.trunc(finiteNumber(coverage.importedRecordCount) || 0)),
    failure: boundedText(coverage.failure, 500) || null,
  };
}

export async function createUsageTimelineStore({ dataDir, fileName = "usage-timeline-v1.json" } = {}) {
  if (!dataDir) throw new Error("createUsageTimelineStore requires dataDir");
  const filePath = path.join(dataDir, fileName);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });

  let state = emptyState();
  try {
    const loaded = JSON.parse(await readFile(filePath, "utf8"));
    if (loaded?.schemaVersion === TIMELINE_SCHEMA_VERSION) {
      state = {
        ...emptyState(),
        ...loaded,
        profiles: Array.isArray(loaded.profiles) ? loaded.profiles : emptyState().profiles,
        sessions: Array.isArray(loaded.sessions) ? loaded.sessions : [],
        usageEvents: Array.isArray(loaded.usageEvents) ? loaded.usageEvents : [],
        coverage: loaded.coverage && typeof loaded.coverage === "object" ? loaded.coverage : {},
        billingSnapshots: Array.isArray(loaded.billingSnapshots) ? loaded.billingSnapshots : [],
        attribution: Array.isArray(loaded.attribution) ? loaded.attribution : [],
        monetaryEstimates: Array.isArray(loaded.monetaryEstimates) ? loaded.monetaryEstimates : [],
      };
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  let writes = Promise.resolve();
  function persist() {
    writes = writes.then(async () => {
      const temporaryPath = `${filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, filePath);
      await chmod(filePath, 0o600);
    });
    return writes;
  }

  return {
    filePath,
    snapshot: () => clone(state),
    async upsertImport({ sessions = [], usageEvents = [], coverage } = {}) {
      const sessionById = new Map(state.sessions.map((session) => [session.id, session]));
      const eventById = new Map(state.usageEvents.map((event) => [event.id, event]));
      let inserted = 0;
      let updated = 0;
      for (const candidate of sessions) {
        const session = sanitizeSession(candidate);
        if (!session) continue;
        sessionById.set(session.id, session);
      }
      for (const candidate of usageEvents) {
        const event = sanitizeUsageEvent(candidate);
        if (!event) continue;
        if (eventById.has(event.id)) updated += 1;
        else inserted += 1;
        eventById.set(event.id, event);
      }
      state.sessions = [...sessionById.values()].sort((left, right) => left.id.localeCompare(right.id));
      state.usageEvents = [...eventById.values()].sort((left, right) => left.timing.usageAt.localeCompare(right.timing.usageAt) || left.id.localeCompare(right.id));
      const normalizedCoverage = sanitizeCoverage(coverage);
      if (normalizedCoverage) state.coverage[normalizedCoverage.clientSource] = normalizedCoverage;
      await persist();
      return { inserted, updated, snapshot: clone(state) };
    },
    async clearPromptExcerpts() {
      state.usageEvents = state.usageEvents.map((event) => ({ ...event, promptExcerpt: null }));
      await persist();
      return clone(state);
    },
    async renameUnverifiedProfile(label) {
      const normalized = boundedText(label, 120);
      if (!normalized) throw new Error("Profile label must not be empty");
      state.profiles = state.profiles.map((profile) => profile.id === INSIDERS_LOCAL_PROFILE_ID
        ? { ...profile, label: normalized }
        : profile);
      await persist();
      return clone(state);
    },
    async resetUsageHistory() {
      state = emptyState();
      await unlink(filePath).catch((error) => { if (error.code !== "ENOENT") throw error; });
      return clone(state);
    },
  };
}
