import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { preferredMonitorLocation } from "./monitor-surface-routing.mjs";

test("preferred prototypes launch as the default monitor surface, not as the LAB", () => {
  assert.equal(
    preferredMonitorLocation({ mode: "variant", variant: "E" }),
    "/monitor/?prototype=monitor&surface=default&variant=E",
  );
  assert.equal(
    preferredMonitorLocation({ mode: "custom" }),
    "/monitor/?prototype=monitor&surface=default&layout=custom",
  );
  assert.equal(preferredMonitorLocation({ mode: "classic" }), null);
  assert.equal(
    preferredMonitorLocation({ mode: "variant", variant: "D" }),
    "/monitor/?prototype=monitor&surface=default&variant=B",
  );
});

test("the native MONITOR action opens the preferred monitor instead of forcing Classic", async () => {
  const source = await readFile(new URL("./launcher/OllamaMonitor.swift", import.meta.url), "utf8");
  const body = source.match(/@objc private func openMonitor\(\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  assert.match(body, /loadSurface\(monitorURL\)/);
  assert.doesNotMatch(body, /surface[\s\S]*classic/);
});

test("the native app bundles the preferred-monitor routing module", async () => {
  const source = await readFile(new URL("./launcher/build-app.sh", import.meta.url), "utf8");
  assert.match(source, /monitor-surface-routing\.mjs/);
});
