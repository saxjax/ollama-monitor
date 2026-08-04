import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createEventStreamHub } from "./event-stream.mjs";

class FakeResponse extends EventEmitter {
  constructor(writeResults = []) {
    super();
    this.writeResults = writeResults;
    this.writes = [];
    this.destroyed = false;
  }

  writeHead(status, headers) {
    this.status = status;
    this.headers = headers;
  }

  write(value) {
    this.writes.push(value);
    return this.writeResults.length ? this.writeResults.shift() : true;
  }

  destroy() {
    this.destroyed = true;
    this.emit("close");
  }
}

test("does not serialize events when no dashboard is connected", () => {
  let serializations = 0;
  const hub = createEventStreamHub({ serialize(value) { serializations += 1; return JSON.stringify(value); } });
  hub.send("state", { large: true });
  assert.equal(serializations, 0);
});

test("drops a blocked dashboard before another event can extend its queue", () => {
  let serializations = 0;
  const hub = createEventStreamHub({ serialize(value) { serializations += 1; return JSON.stringify(value); } });
  const request = new EventEmitter();
  const response = new FakeResponse([false]);
  hub.subscribe(request, response, { initial: "large state" });
  assert.equal(hub.size, 1);
  assert.equal(serializations, 1);

  hub.send("metrics", { next: true });
  assert.equal(response.destroyed, true);
  assert.equal(hub.size, 0);
  assert.equal(serializations, 1);
});

test("continues delivery when the blocked socket drains", () => {
  const hub = createEventStreamHub();
  const request = new EventEmitter();
  const response = new FakeResponse([false, true]);
  hub.subscribe(request, response, { initial: true });
  response.emit("drain");
  hub.send("metrics", { memory: 42 });
  assert.equal(response.destroyed, false);
  assert.equal(response.writes.length, 2);
  assert.match(response.writes[1], /^event: metrics\ndata: /);
});
