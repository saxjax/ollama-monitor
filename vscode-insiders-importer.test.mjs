import assert from "node:assert/strict";
import { appendFile, mkdtemp, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createUsageTimelineStore } from "./usage-timeline-store.mjs";
import { createVsCodeInsidersImporter, normalizeVsCodeInsidersRequest } from "./vscode-insiders-importer.mjs";

function journalState(requests) {
  return `${JSON.stringify({ kind: 0, v: { sessionId: "chat-1", requests } })}\n`;
}

test("normalizes completion timing, optional measurements, and client-displayed credits", () => {
  const record = normalizeVsCodeInsidersRequest({
    sessionId: "chat-1",
    journalName: "opaque-file",
    requestOrdinal: 0,
    request: {
      requestId: "request-1", responseId: "response-1", timestamp: Date.parse("2026-08-01T10:00:00Z"),
      modelId: "GPT-5", message: { text: "  concise   local prompt  " }, promptTokens: 12, completionTokens: 8,
      elapsedMs: 2000, modelState: { completedAt: Date.parse("2026-08-01T10:00:02Z") },
      result: { metadata: {}, details: "GPT-5 • 2 credits" },
    },
  });
  assert.equal(record.usageEvent.identity.strength, "strong");
  assert.equal(record.usageEvent.timing.usageAt, "2026-08-01T10:00:02.000Z");
  assert.equal(record.usageEvent.measurements.inputTokens, 12);
  assert.equal(record.usageEvent.measurements.outputTokens, 8);
  assert.equal(record.usageEvent.measurements.nativeUnit.value, 2);
  assert.equal(record.usageEvent.promptExcerpt, "concise local prompt");
  assert.equal(record.usageEvent.model.family, "gpt");
});

test("uses an explicit weak timestamp identity without merging same-timestamp records", () => {
  const base = { timestamp: Date.parse("2026-08-01T10:00:00Z"), message: { text: "x" } };
  const first = normalizeVsCodeInsidersRequest({ sessionId: "chat-1", journalName: "one", request: base, requestOrdinal: 0 });
  const second = normalizeVsCodeInsidersRequest({ sessionId: "chat-1", journalName: "one", request: base, requestOrdinal: 1 });
  assert.equal(first.usageEvent.identity.strength, "weak-timestamp");
  assert.notEqual(first.usageEvent.id, second.usageEvent.id);
});

test("imports existing Insiders history then updates a changed journal idempotently", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insiders-importer-"));
  const workspaceRoot = path.join(root, "workspaceStorage");
  const chatDirectory = path.join(workspaceRoot, "workspace-1", "chatSessions");
  const journal = path.join(chatDirectory, "opaque-file.jsonl");
  await mkdir(chatDirectory, { recursive: true });
  const request = {
    requestId: "request-1", timestamp: Date.parse("2026-08-01T10:00:00Z"), modelId: "Claude Sonnet",
    message: { text: "private prompt must be bounded" }, result: { metadata: {} },
  };
  await writeFile(journal, journalState([request]));
  const store = await createUsageTimelineStore({ dataDir: path.join(root, "data") });
  const importer = createVsCodeInsidersImporter({ store, root: workspaceRoot, pollMs: 60_000 });
  await importer.importAvailable();
  assert.equal(store.snapshot().usageEvents.length, 1);
  assert.equal(store.snapshot().coverage["vscode-insiders"].status, "available");

  request.modelState = { completedAt: Date.parse("2026-08-01T10:00:04Z") };
  request.result = { metadata: {}, details: "Claude Sonnet • 1 credits" };
  await writeFile(journal, journalState([request]));
  await importer.importAvailable();
  await importer.importAvailable();
  const snapshot = store.snapshot();
  assert.equal(snapshot.usageEvents.length, 1);
  assert.equal(snapshot.usageEvents[0].timing.usageAt, "2026-08-01T10:00:04.000Z");
  assert.equal(snapshot.usageEvents[0].measurements.nativeUnit.value, 1);
  const serialized = await readFile(store.filePath, "utf8");
  assert.equal(serialized.includes("private prompt must be bounded"), true);
  assert.equal(serialized.includes("result\":{\"metadata"), false);
  importer.close();
});

test("commits a recovered-history scan in one durable store update", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insiders-import-batch-"));
  const workspaceRoot = path.join(root, "workspaceStorage");
  const chatDirectory = path.join(workspaceRoot, "workspace-1", "chatSessions");
  await mkdir(chatDirectory, { recursive: true });
  await Promise.all(["one", "two"].map((name, index) => writeFile(
    path.join(chatDirectory, `${name}.jsonl`),
    journalState([{ requestId: `request-${name}`, timestamp: Date.parse("2026-08-01T10:00:00Z") + index }]),
  )));
  const writes = [];
  const store = { upsertImport: async (value) => { writes.push(value); return { inserted: value.usageEvents?.length || 0, updated: 0, snapshot: {} }; } };
  const importer = createVsCodeInsidersImporter({ store, root: workspaceRoot, pollMs: 60_000 });
  await importer.importAvailable();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].usageEvents.length, 2);
  assert.equal(writes[0].coverage.importedRecordCount, 2);
  importer.close();
});

test("imports one newest copy when VS Code repeats a journal across workspaces", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insiders-import-deduplicate-"));
  const workspaceRoot = path.join(root, "workspaceStorage");
  const firstDirectory = path.join(workspaceRoot, "workspace-1", "chatSessions");
  const secondDirectory = path.join(workspaceRoot, "workspace-2", "chatSessions");
  await Promise.all([
    mkdir(firstDirectory, { recursive: true }),
    mkdir(secondDirectory, { recursive: true }),
  ]);
  const firstRequest = { requestId: "request-1", timestamp: Date.parse("2026-08-01T10:00:00Z") };
  const secondRequest = { requestId: "request-2", timestamp: Date.parse("2026-08-01T10:01:00Z") };
  const journalName = "shared-session.jsonl";
  await writeFile(path.join(firstDirectory, journalName), journalState([firstRequest]));
  await new Promise((resolve) => setTimeout(resolve, 10));
  await writeFile(path.join(secondDirectory, journalName), journalState([firstRequest, secondRequest]));

  const writes = [];
  const store = { upsertImport: async (value) => { writes.push(value); return { inserted: value.usageEvents.length, updated: 0, snapshot: {} }; } };
  const importer = createVsCodeInsidersImporter({ store, root: workspaceRoot, pollMs: 60_000 });
  await importer.importAvailable();

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].usageEvents.map((event) => event.identity.requestId), ["request-1", "request-2"]);
  assert.equal(writes[0].coverage.availableJournalCount, 1);
  assert.equal(writes[0].coverage.importedRecordCount, 2);
  importer.close();
});

test("does not reparse journals older than a persisted successful scan", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insiders-import-watermark-"));
  const workspaceRoot = path.join(root, "workspaceStorage");
  const chatDirectory = path.join(workspaceRoot, "workspace-1", "chatSessions");
  const journal = path.join(chatDirectory, "known-session.jsonl");
  await mkdir(chatDirectory, { recursive: true });
  await writeFile(journal, journalState([
    { requestId: "already-imported", timestamp: Date.parse("2026-08-01T10:00:00Z") },
  ]));
  await utimes(journal, new Date("2026-08-01T11:00:00Z"), new Date("2026-08-01T11:00:00Z"));

  const writes = [];
  const store = {
    snapshot: () => ({
      sessions: [{ sourceReference: { journalName: "known-session" } }],
      coverage: { "vscode-insiders": {
        status: "available",
        checkedAt: "2026-08-02T00:00:00.000Z",
        latestClientRecordAt: "2026-08-01T10:00:00.000Z",
      } },
    }),
    upsertImport: async (value) => { writes.push(value); return { inserted: value.usageEvents.length, updated: 0, snapshot: {} }; },
  };
  const importer = createVsCodeInsidersImporter({ store, root: workspaceRoot, pollMs: 60_000 });
  await importer.importAvailable();

  assert.equal(writes[0].usageEvents.length, 0);
  assert.equal(writes[0].coverage.parseableJournalCount, 1);
  assert.equal(writes[0].coverage.latestClientRecordAt, "2026-08-01T10:00:00.000Z");
  importer.close();
});
