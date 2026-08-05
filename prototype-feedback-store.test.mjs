import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPrototypeFeedbackStore } from "./prototype-feedback-store.mjs";

test("persists a sanitized local preferred view without adding it to review exports", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "prototype-feedback-preference-"));
  const store = await createPrototypeFeedbackStore({ dataDir });
  const saved = await store.setPreferredView({
    mode: "custom",
    variant: "I",
    layout: {
      shellVariant: "C",
      sections: [
        { id: "spikes", sourceVariant: "B", enabled: false },
        { id: "timeline", sourceVariant: "E", enabled: false },
        { id: "system", sourceVariant: "A", enabled: false },
        { id: "evidence", sourceVariant: "D", enabled: false },
        { id: "timeline", sourceVariant: "A", enabled: true },
        { id: "unknown", sourceVariant: "A", enabled: true },
      ],
    },
  });

  assert.equal(saved.preferredView.mode, "custom");
  assert.equal(saved.preferredView.variant, "I");
  assert.equal(saved.preferredView.layout.shellVariant, "C");
  assert.deepEqual(saved.preferredView.layout.sections.slice(0, 4), [
    { id: "spikes", sourceVariant: "B", enabled: false },
    { id: "timeline", sourceVariant: "E", enabled: true },
    { id: "system", sourceVariant: "B", enabled: true },
    { id: "evidence", sourceVariant: "B", enabled: true },
  ]);
  assert.equal(new Set(saved.preferredView.layout.sections.map((item) => item.id)).size, 8);
  assert.equal(Object.hasOwn(store.exportBundle(), "preferredView"), false);
  assert.equal((await stat(store.filePath)).mode & 0o777, 0o600);

  const persisted = JSON.parse(await readFile(store.filePath, "utf8"));
  assert.deepEqual(persisted.preferredView, saved.preferredView);
  const reloaded = await createPrototypeFeedbackStore({ dataDir });
  assert.deepEqual(reloaded.snapshot().preferredView, saved.preferredView);
});

test("reset keeps the personal startup view while clearing review evidence", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "prototype-feedback-reset-"));
  const store = await createPrototypeFeedbackStore({ dataDir });
  await store.setPreferredView({ mode: "variant", variant: "E" });
  await store.addComment({ variant: "E", target: { id: "timeline", label: "Usage timeline" }, body: "Keep it." });

  const reset = await store.reset();

  assert.equal(reset.preferredView.mode, "variant");
  assert.equal(reset.preferredView.variant, "E");
  assert.equal(reset.comments.length, 0);
  assert.equal(reset.activity.length, 0);
  const reloaded = await createPrototypeFeedbackStore({ dataDir });
  assert.equal(reloaded.snapshot().preferredView.mode, "variant");
  assert.equal(reloaded.snapshot().preferredView.variant, "E");
});
