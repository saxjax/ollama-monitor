import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the monitor prototype avoids duplicate historical startup payloads", async () => {
  const [prototype, productionTimeline, app, gateway] = await Promise.all([
    readFile(new URL("public/monitor-ux-prototypes.js", import.meta.url), "utf8"),
    readFile(new URL("public/usage-timeline.js", import.meta.url), "utf8"),
    readFile(new URL("public/app.js", import.meta.url), "utf8"),
    readFile(new URL("gateway.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(prototype, /api\/state\?compact=1/);
  assert.match(prototype, /events\?compact=1/);
  assert.match(productionTimeline, /if \(!monitorPrototypeEnabled\)/);
  assert.match(app, /compactPrototypeStream/);
  assert.match(gateway, /usageTimeline: includeHistoricalData \?/);
  assert.match(gateway, /includeHistoricalData: !compact/);
});
