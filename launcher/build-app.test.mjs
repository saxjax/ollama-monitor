import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const launcherDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(launcherDirectory, "..");

test("the app bundle includes every local gateway runtime dependency", async () => {
  const [gateway, buildScript] = await Promise.all([
    readFile(path.join(repositoryRoot, "gateway.mjs"), "utf8"),
    readFile(path.join(launcherDirectory, "build-app.sh"), "utf8"),
  ]);
  const dependencies = [...gateway.matchAll(/from "\.\/([^"/]+\.mjs)"/g)].map((match) => match[1]);
  for (const dependency of dependencies) {
    assert.match(buildScript, new RegExp(`cp "\\$repo_root/${dependency.replace(".", "\\.")}" "\\$runtime_dir/${dependency.replace(".", "\\.")}"`));
  }
  assert.match(buildScript, /usage-timeline-view-model\.mjs/);
});
