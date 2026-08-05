import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prototypeStyles = [
  "public/styles.css",
  "public/monitor-ux-prototypes.css",
  "public/prototype-feedback-lab.css",
];

test("prototype typography never drops below the 12px annotation floor", async () => {
  for (const filename of prototypeStyles) {
    const css = await readFile(new URL(filename, import.meta.url), "utf8");
    const declarations = [...css.matchAll(/font(?:-size)?\s*:\s*([^;}]+)/g)];
    const undersized = declarations.flatMap(([, value]) =>
      [...value.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)px\b/g)]
        .map((match) => Number(match[1]))
        .filter((size) => size < 12),
    );
    assert.deepEqual(undersized, [], `${filename} contains text below 12px`);
  }
});

test("every monitor direction exposes persistent progressive disclosure", async () => {
  const source = await readFile(new URL("public/monitor-ux-prototypes.js", import.meta.url), "utf8");
  assert.match(source, /data-action="detail-level"/);
  assert.match(source, /reading-\$\{prototypeDetailLevel\}/);
  assert.match(source, /localStorage\.setItem\(PROTOTYPE_DETAIL_KEY, prototypeDetailLevel\)/);
  assert.match(source, /variant === "A0"[\s\S]+readingDetailControl/);
});
