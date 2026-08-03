import assert from "node:assert/strict";
import test from "node:test";
import { captureCounters, captureSnapshot, combineCaptureState, finishCaptureRecord, normalizeCaptureRecord } from "./capture-core.mjs";

test("normalizes every capture source behind one record contract", () => {
  for (const source of ["ollama", "copilot-cli", "vscode", "vscode-insiders"]) {
    const item = normalizeCaptureRecord({ id: source, source, sessionId: "one", startedAt: "2026-01-01T00:00:00Z" });
    assert.equal(item.session.source, source);
    assert.equal(typeof item.sourceLabel, "string");
    assert.equal(item.provider, source === "ollama" ? "ollama" : "github-copilot");
    assert.equal(typeof item.inputContextStatus, "string");
    assert.deepEqual(item.metrics, {});
    finishCaptureRecord(item, "2026-01-01T00:00:02Z");
    assert.equal(item.metrics.totalDurationNs, 2_000_000_000);
    assert.equal(captureSnapshot(item).source, source);
  }
});

test("combines source states and calculates shared counters", () => {
  const state = combineCaptureState(
    { active: [{ id: "a", startedAt: "2026-01-02" }], history: [] },
    { active: [], history: [{ id: "b", status: "error", startedAt: "2026-01-01" }] },
  );
  assert.deepEqual(captureCounters(state), { total: 2, errors: 1 });
});
