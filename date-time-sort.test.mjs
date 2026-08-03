import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/date-time-sort.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const sort = context.SaxjaxDateTimeSort;

const records = [
  { id: "middle", at: "2026-07-14T12:00:00Z" },
  { id: "oldest", at: "2026-06-01T08:00:00Z" },
  { id: "newest", at: "2026-08-03T10:30:00Z" },
];

test("date-time tables default to newest first", () => {
  const result = [...records].sort((left, right) => sort.compareDateTimes(left, right, undefined, (item) => item.at));
  assert.deepEqual(result.map((item) => item.id), ["newest", "middle", "oldest"]);
  assert.equal(sort.label(), "Newest first");
});

test("date-time tables can be changed to oldest first", () => {
  const result = [...records].sort((left, right) => sort.compareDateTimes(left, right, "asc", (item) => item.at));
  assert.deepEqual(result.map((item) => item.id), ["oldest", "middle", "newest"]);
  assert.equal(sort.label("asc"), "Oldest first");
});

test("numeric time positions use the same direction semantics", () => {
  assert.deepEqual([30, 10, 20].sort((left, right) => sort.compareValues(left, right)), [30, 20, 10]);
  assert.deepEqual([30, 10, 20].sort((left, right) => sort.compareValues(left, right, "asc")), [10, 20, 30]);
});
