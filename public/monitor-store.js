// Shared data pipeline for every monitor surface (Classic, Run the month, the
// prototype lab). A single EventSource feeds them all, so switching surfaces
// never re-downloads or re-parses local history, live telemetry stays current
// in every surface at once, and the selected session is shared and persisted.
//
// The full `/monitor/events` connect payload already contains the durable
// usage timeline alongside live active/history/metrics/copilot, so one stream
// is enough — no surface needs a second fetch of the same multi-megabyte
// history.
(() => {
  const SELECTION_KEY = "saxjax.shared-selection.v1";
  const BUFFERED_TYPES = new Set(["state", "metrics", "copilot", "usage-timeline", "prototype-feedback"]);
  const STREAM_TYPES = [
    "state", "metrics", "copilot", "request-started", "token",
    "request-finished", "history-reset", "usage-timeline", "prototype-feedback",
  ];

  function readStoredSelection() {
    try {
      return localStorage.getItem(SELECTION_KEY) || null;
    } catch {
      return null;
    }
  }

  function storeSelection(id) {
    try {
      if (id) localStorage.setItem(SELECTION_KEY, id);
      else localStorage.removeItem(SELECTION_KEY);
    } catch {
      // Selection sharing is best-effort when storage is unavailable.
    }
  }

  function createStore() {
    const listeners = new Map();
    const latest = new Map();
    let selectedSessionId = readStoredSelection();

    function emit(type, payload) {
      const handlers = listeners.get(type);
      if (!handlers) return;
      // Snapshot so a handler may unsubscribe during dispatch without skipping.
      [...handlers].forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`monitor-store: ${type} handler failed`, error);
        }
      });
    }

    const source = new EventSource("/monitor/events");
    for (const type of STREAM_TYPES) {
      source.addEventListener(type, (event) => {
        const payload = JSON.parse(event.data);
        if (BUFFERED_TYPES.has(type)) latest.set(type, payload);
        if (type === "state" && payload?.usageTimeline) latest.set("usage-timeline", payload.usageTimeline);
        emit(type, payload);
      });
    }

    // Subscribe to a stream event. Pass { replay: true } to immediately receive
    // the most recent buffered payload for late subscribers (surfaces that
    // start after the connect `state` has already arrived).
    function on(type, handler, { replay = false } = {}) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
      if (replay && latest.has(type)) handler(latest.get(type));
      return () => listeners.get(type)?.delete(handler);
    }

    function getLatest(type) {
      return latest.has(type) ? latest.get(type) : null;
    }

    function getSelectedSessionId() {
      return selectedSessionId;
    }

    // Update the shared session selection. Surfaces call this when the user
    // picks a session; other surfaces react via the "selection" event and
    // resolve the id against their own view, falling back to no selection when
    // the id is not present in that surface.
    function setSelectedSessionId(id, { silent = false } = {}) {
      const next = id || null;
      if (next === selectedSessionId) return;
      selectedSessionId = next;
      storeSelection(next);
      if (!silent) emit("selection", next);
    }

    return { on, getLatest, getSelectedSessionId, setSelectedSessionId };
  }

  window.SaxjaxMonitorStore = window.SaxjaxMonitorStore || createStore();
})();
