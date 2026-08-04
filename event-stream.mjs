function eventLine(type, payload, serialize) {
  return `event: ${type}\ndata: ${serialize(payload)}\n\n`;
}

export function createEventStreamHub({ serialize = JSON.stringify } = {}) {
  const subscribers = new Set();

  function remove(client) {
    subscribers.delete(client);
  }

  function destroy(client) {
    remove(client);
    if (!client.response.destroyed) client.response.destroy();
  }

  function discardBlocked() {
    for (const client of subscribers) if (client.blocked) destroy(client);
  }

  function write(line) {
    discardBlocked();
    if (!subscribers.size) return 0;
    for (const client of subscribers) {
      if (!client.response.write(line)) client.blocked = true;
    }
    return subscribers.size;
  }

  return {
    get size() { return subscribers.size; },

    subscribe(request, response, initialState) {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      const client = { response, blocked: false };
      subscribers.add(client);
      const close = () => remove(client);
      request.on("close", close);
      response.on("close", close);
      response.on("drain", () => { client.blocked = false; });
      if (!response.write(eventLine("state", initialState, serialize))) client.blocked = true;
    },

    send(type, payload) {
      discardBlocked();
      if (!subscribers.size) return 0;
      return write(eventLine(type, payload, serialize));
    },

    heartbeat() {
      return write(": heartbeat\n\n");
    },
  };
}
