import assert from "node:assert/strict";
import test from "node:test";
import { buildUsageTimelineViewModel, concurrentSessionCounts, displayValue } from "./usage-timeline-view-model.mjs";

const event = (id, usageAt, measurements, family = "gpt") => ({
  id,
  timing: { startedAt: usageAt, usageAt },
  measurements,
  model: { family },
});

test("plots measured values at completion and leaves absent measurements out of aggregates", () => {
  const events = [
    event("one", "2026-08-01T23:45:00Z", { inputTokens: 10, outputTokens: 5, nativeUnit: { value: 2 } }),
    event("two", "2026-08-01T23:50:00Z", {}, "claude-sonnet"),
  ];
  const view = buildUsageTimelineViewModel(events, { unit: "native", timeZone: "UTC", month: "2026-08" });
  assert.equal(view.slots.find((slot) => slot.bucket === 47).total, 2);
  assert.deepEqual(view.measurementCoverage, { totalEvents: 2, measuredEvents: 1, missingEvents: 1 });
  assert.equal(view.cumulative.at(-1).total, 2);
  assert.equal(view.ledger.length, 2);
  assert.equal(displayValue(events[1], "native"), null);
});

test("uses an explicit selected/reference pair for a locked comparison scale", () => {
  const events = [
    event("selected", "2026-08-02T10:00:00Z", { nativeUnit: { value: 3 } }),
    event("reference", "2026-07-02T10:00:00Z", { nativeUnit: { value: 7 } }),
    event("unselected", "2026-06-02T10:00:00Z", { nativeUnit: { value: 99 } }),
  ];
  const view = buildUsageTimelineViewModel(events, { unit: "native", timeZone: "UTC", month: "2026-08", referenceMonth: "2026-07" });
  assert.equal(view.referenceMonth, "2026-07");
  assert.equal(view.referenceTotals.find((value) => value === 7), 7);
  assert.equal(view.scalePeak, 7);
});

test("counts unique concurrent sessions in each occupied slot with one event pass", () => {
  const counts = concurrentSessionCounts([
    { day: "2026-06-03", minute: 10, durationMinutes: 50, sessionId: "alpha" },
    { day: "2026-06-03", minute: 25, durationMinutes: 10, sessionId: "alpha" },
    { day: "2026-06-03", minute: 30, durationMinutes: 30, sessionId: "beta" },
    { day: "2026-06-03", minute: 1_430, durationMinutes: 30, sessionId: "late" },
  ]);

  assert.equal(counts.get("2026-06-03:0"), 1);
  assert.equal(counts.get("2026-06-03:1"), 2);
  assert.equal(counts.get("2026-06-03:47"), 1);
  assert.equal(counts.has("2026-06-03:48"), false);
});
