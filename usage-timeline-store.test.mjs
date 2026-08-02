import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { INSIDERS_LOCAL_PROFILE_ID, createUsageTimelineStore } from "./usage-timeline-store.mjs";

const event = (overrides = {}) => ({
  id: "usage-event:one",
  sessionId: "session:one",
  clientSource: "vscode-insiders",
  identity: { durableKey: "one", strength: "strong", requestId: "request-1" },
  timing: { startedAt: "2026-08-01T10:00:00.000Z", completedAt: "2026-08-01T10:00:02.000Z", usageAt: "2026-08-01T10:00:02.000Z", durationMs: 2000 },
  model: { exactLabel: "GPT-5", family: "gpt" },
  measurements: { inputTokens: 10, outputTokens: 5, nativeUnit: { value: 2 } },
  evidence: { observedAt: "2026-08-01T10:01:00.000Z" },
  sourceReference: { journalSessionId: "journal-1", journalName: "opaque-journal", requestId: "request-1" },
  promptExcerpt: "A deliberately short prompt excerpt",
  // These represent raw journal material that the store must never write.
  response: "private response",
  rawJournal: { request: "private raw journal" },
  tools: [{ arguments: "private tool input" }],
  ...overrides,
});

const session = {
  id: "session:one",
  clientSource: "vscode-insiders",
  clientSessionId: "journal-1",
  identityStatus: "client-reported",
  sourceReference: { journalSessionId: "journal-1", journalName: "opaque-journal" },
};

test("persists only normalized timeline evidence and updates durable identities in place", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "usage-timeline-store-"));
  const store = await createUsageTimelineStore({ dataDir });
  const first = await store.upsertImport({ sessions: [session], usageEvents: [event()] });
  const second = await store.upsertImport({ sessions: [session], usageEvents: [event({ measurements: { inputTokens: 11, nativeUnit: { value: 3 } } })] });
  const persisted = await readFile(store.filePath, "utf8");
  const snapshot = store.snapshot();

  assert.equal(first.inserted, 1);
  assert.equal(second.updated, 1);
  assert.equal(snapshot.profiles[0].id, INSIDERS_LOCAL_PROFILE_ID);
  assert.equal(snapshot.usageEvents.length, 1);
  assert.equal(snapshot.usageEvents[0].measurements.inputTokens, 11);
  assert.equal(snapshot.usageEvents[0].measurements.outputTokens, null);
  assert.equal(snapshot.usageEvents[0].measurements.nativeUnit.value, 3);
  assert.equal(persisted.includes("private response"), false);
  assert.equal(persisted.includes("private raw journal"), false);
  assert.equal(persisted.includes("private tool input"), false);
  assert.equal((await stat(store.filePath)).mode & 0o777, 0o600);
});

test("clear removes excerpts only and reset removes timeline history", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "usage-timeline-clear-"));
  const store = await createUsageTimelineStore({ dataDir });
  await store.upsertImport({
    sessions: [session],
    usageEvents: [event()],
    coverage: { clientSource: "vscode-insiders", status: "available", checkedAt: "2026-08-01T10:02:00Z", availableJournalCount: 1, parseableJournalCount: 1, importedRecordCount: 1 },
  });
  const cleared = await store.clearPromptExcerpts();
  assert.equal(cleared.usageEvents[0].promptExcerpt, null);
  assert.equal(cleared.usageEvents[0].measurements.nativeUnit.value, 2);
  assert.equal(cleared.sessions.length, 1);
  const reset = await store.resetUsageHistory();
  assert.equal(reset.usageEvents.length, 0);
  assert.equal(reset.sessions.length, 0);
  assert.deepEqual(reset.coverage, {});
  assert.equal(reset.billingSnapshots.length, 0);
});

test("renames only the explicitly unverified local profile", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "usage-timeline-profile-"));
  const store = await createUsageTimelineStore({ dataDir });
  const snapshot = await store.renameUnverifiedProfile("My editor");
  assert.equal(snapshot.profiles.find((profile) => profile.id === INSIDERS_LOCAL_PROFILE_ID).label, "My editor");
});
