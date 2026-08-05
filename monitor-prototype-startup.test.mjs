import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every monitor surface shares one full stream instead of duplicating startup payloads", async () => {
  const [store, prototype, productionTimeline, app, gateway] = await Promise.all([
    readFile(new URL("public/monitor-store.js", import.meta.url), "utf8"),
    readFile(new URL("public/monitor-ux-prototypes.js", import.meta.url), "utf8"),
    readFile(new URL("public/usage-timeline.js", import.meta.url), "utf8"),
    readFile(new URL("public/app.js", import.meta.url), "utf8"),
    readFile(new URL("gateway.mjs", import.meta.url), "utf8"),
  ]);

  // The shared store opens exactly one full (non-compact) EventSource that
  // carries live telemetry and the durable timeline together.
  assert.match(store, /new EventSource\("\/monitor\/events"\)/);
  assert.doesNotMatch(store, /events\?compact=1/);
  assert.match(store, /payload\?\.usageTimeline/);

  // Surfaces read from the shared store; none opens its own stream or re-fetches
  // the multi-megabyte history at startup.
  assert.doesNotMatch(prototype, /new EventSource/);
  assert.doesNotMatch(prototype, /api\/state\?compact=1/);
  assert.doesNotMatch(prototype, /events\?compact=1/);
  assert.match(prototype, /window\.SaxjaxMonitorStore/);
  assert.doesNotMatch(app, /new EventSource/);
  assert.doesNotMatch(app, /compactPrototypeStream/);
  assert.match(app, /window\.SaxjaxMonitorStore/);
  assert.doesNotMatch(productionTimeline, /if \(!monitorPrototypeEnabled\)/);
  assert.match(productionTimeline, /SaxjaxMonitorStore\?\.getLatest\?\.\("usage-timeline"\)/);

  // The connect payload still bundles the durable timeline so a single stream
  // is sufficient for every surface.
  assert.match(gateway, /usageTimeline: includeHistoricalData \?/);
});

