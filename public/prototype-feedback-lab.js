// PROTOTYPE — contextual review and portable research data for monitor variants.

const API = "/monitor/api/prototype-feedback";
const DOCK_POSITION_KEY = "saxjax.prototype-lab-dock.v1";
const SENTIMENTS = {
  works: "Keep this",
  problem: "Gets in the way",
  idea: "Try this",
  question: "Question",
};

const SECTION_LIBRARY = {
  throughput: { label: "Throughput", description: "Active, total, and error counts with gateway and host facts.", required: true },
  timeline: { label: "Usage timeline", description: "The primary explosion-finding instrument.", required: true },
  spikes: { label: "Spike ranking", description: "A short route into the most expensive intervals." },
  evidence: { label: "Prompt and request evidence", description: "The sessions and prompts behind a selected interval.", required: true },
  system: { label: "Live system state", description: "CPU, memory, scheduler, cores, model, and Ollama state.", required: true },
  sessions: { label: "Parallel session lanes", description: "Which sessions overlapped and what each contributed." },
  resources: { label: "Usage and resource correlation", description: "Align usage with local resource pressure." },
  accumulated: { label: "Accumulated usage", description: "Month-to-date growth with every contribution visible." },
  "provider-evidence": { label: "Provider evidence", description: "Measurement coverage, confidence, and missing values." },
};

const SECTION_FLAVOURS = {
  A0: "The actual dark observatory: readouts, dials, core rack, usage timeline, and wire",
  B: "Cost-first seismograph",
  C: "Dense machine-room instrument",
  E: "Auditable incident ledger",
};

const SOURCE_VARIANTS = ["A0", "B", "C", "E"];

const DEFAULT_LAYOUT = {
  shellVariant: "B",
  sections: [
    ["throughput", "B"], ["timeline", "B"], ["spikes", "B"], ["evidence", "E"], ["system", "C"],
    ["sessions", "B"], ["resources", "C"], ["accumulated", "B"], ["provider-evidence", "E"],
  ].map(([id, sourceVariant]) => ({ id, sourceVariant, enabled: true })),
};

function normalizeLayout(layout) {
  const source = layout && typeof layout === "object" ? layout : DEFAULT_LAYOUT;
  const sections = (Array.isArray(source.sections) ? structuredClone(source.sections) : structuredClone(DEFAULT_LAYOUT.sections))
    .map((section) => ({ ...section, sourceVariant: SOURCE_VARIANTS.includes(section.sourceVariant) ? section.sourceVariant : "B" }));
  if (!sections.some((section) => section.id === "throughput")) {
    sections.unshift({ id: "throughput", sourceVariant: "B", enabled: true });
  } else sections.find((section) => section.id === "throughput").enabled = true;
  return { shellVariant: SOURCE_VARIANTS.includes(source.shellVariant) ? source.shellVariant : "B", sections };
}

const SECTION_TARGETS = [
  [".mux-classic-host > .masthead", "classic-header", "Classic machine identity and Ollama controls"],
  [".mux-classic-host .telemetry-readouts", "classic-readouts", "Classic resident model, CPU demand, and Ollama RAM readouts"],
  [".mux-classic-host .telemetry-dials", "classic-dials", "Classic CPU, memory, swap, and budget dials"],
  [".mux-classic-host .core-observatory", "classic-core-scheduler", "Classic hardware scheduler and core activity rack"],
  [".mux-classic-host .timeline-prototype", "usage-timeline", "Classic usage timeline and month comparison"],
  [".mux-classic-host .stream-panel", "request-evidence", "Classic AI communication wire"],
  [".mux-classic-host .side-panel", "classic-throughput-budget", "Classic throughput, budget, velocity, and token price panel"],
  [".mux-throughput", "throughput", "Throughput and live request counts"],
  [".mux-head, .mux-c-head, .mux-e-head, .mux-i-head", "header", "Header, period, and total"],
  [".mux-controls, .mux-c-controls, .mux-e-toolbar", "controls", "Filters and inspection controls"],
  [".mux-system-strip, .mux-c-machine, .mux-e-machine", "system-state", "Live system state"],
  [".mux-a0-timeline, .mux-b-scope, .mux-c-usage, .mux-e-horizon, .mux-i-game", "usage-timeline", "Usage-over-time visualization"],
  [".mux-b-quakes, .mux-e-ranking", "spike-ranking", "Spike and anomaly ranking"],
  [".mux-evidence, .mux-b-proof, .mux-e-selected, .mux-i-evidence", "request-evidence", "Prompt and request evidence"],
  [".mux-manual", "manual-github-readings", "Manual GitHub credit checkpoints"],
  [".mux-course", "course-control", "Credit target and future pace simulator"],
  [".mux-prompt-coach", "prompt-coach", "Automatic prompt-practice guidance"],
  [".mux-history", "accumulated-usage", "Accumulated usage navigator"],
  [".mux-resources", "resource-correlation", "Usage and resource correlation"],
  [".mux-sessions", "session-lanes", "Parallel session lanes"],
  [".mux-truth", "provider-evidence", "Provider capability and evidence"],
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formatDuration(milliseconds) {
  const minutes = Math.round((Number(milliseconds) || 0) / 60_000);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function request(path = "", options = {}) {
  const response = await fetch(`${API}${path}`, { cache: "no-store", ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

function download(filename, content, type = "application/json") {
  if (globalThis.webkit?.messageHandlers?.prototypeExport) {
    globalThis.webkit.messageHandlers.prototypeExport.postMessage({ filename, content });
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2_000);
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const field = document.createElement("textarea");
    field.value = value;
    field.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }
}

function activitySummary(state, variant, targetId = null) {
  const matching = (state.activity || []).filter((item) => item.variant === variant && (!targetId || item.targetId === targetId));
  return {
    count: matching.reduce((sum, item) => sum + (item.count || 0), 0),
    activeMs: matching.reduce((sum, item) => sum + (item.activeMs || 0), 0),
    visits: matching.filter((item) => item.feature === "variant.view").reduce((sum, item) => sum + (item.count || 0), 0),
  };
}

function featureName(value) {
  return String(value || "").replace(/^control\./, "").replace(/^select\./, "select ").replaceAll(".", " · ");
}

export async function createPrototypeFeedbackLab({ prototypeRoot, variants, getContext, changeVariant, activatePreference, initialState }) {
  let state = initialState || await request();
  let currentVariant = getContext().variant;
  let reviewMode = false;
  let comparisonOpen = new URLSearchParams(location.search).get("review") === "compare";
  let commentSortDirection = globalThis.SaxjaxDateTimeSort.normalize(new URLSearchParams(location.search).get("sort"));
  let composerTarget = null;
  let defaultMenuOpen = false;
  let studioOpen = false;
  let draftLayout = normalizeLayout(state.preferredView?.layout);
  let status = "";
  let lastActiveAt = performance.now();
  let lastActivityAt = performance.now();
  let pending = new Map();
  let dockPosition = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DOCK_POSITION_KEY));
      return Number.isFinite(saved?.left) && Number.isFinite(saved?.top) ? saved : null;
    } catch {
      return null;
    }
  })();

  const labRoot = document.createElement("div");
  labRoot.id = "prototype-feedback-lab-root";
  document.body.appendChild(labRoot);

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function persistDockPosition() {
    try {
      if (dockPosition) localStorage.setItem(DOCK_POSITION_KEY, JSON.stringify(dockPosition));
      else localStorage.removeItem(DOCK_POSITION_KEY);
    } catch {
      // A movable dock still works for this page when storage is unavailable.
    }
  }

  function positionDockPopover() {
    const dock = labRoot.querySelector(".pfl-toolbar");
    const menu = labRoot.querySelector(".pfl-default-menu");
    if (!dock || !menu) return;
    const dockRect = dock.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = clamp(dockRect.right - width, 14, Math.max(14, innerWidth - width - 14));
    let top = dockRect.top - height - 10;
    if (top < 14) top = dockRect.bottom + 10;
    top = clamp(top, 14, Math.max(14, innerHeight - height - 14));
    Object.assign(menu.style, { left: `${left}px`, top: `${top}px`, right: "auto", bottom: "auto" });
  }

  function setDockPosition(left, top, persist = false) {
    const dock = labRoot.querySelector(".pfl-toolbar");
    if (!dock) return;
    const safeLeft = clamp(left, 8, Math.max(8, innerWidth - dock.offsetWidth - 8));
    const safeTop = clamp(top, 8, Math.max(8, innerHeight - dock.offsetHeight - 8));
    dockPosition = { left: Math.round(safeLeft), top: Math.round(safeTop) };
    dock.classList.add("is-moved");
    Object.assign(dock.style, { left: `${safeLeft}px`, top: `${safeTop}px`, right: "auto", bottom: "auto", transform: "none" });
    positionDockPopover();
    if (persist) persistDockPosition();
  }

  function applyDockPosition() {
    const dock = labRoot.querySelector(".pfl-toolbar");
    if (!dock) return;
    if (!dockPosition) {
      dock.classList.remove("is-moved");
      dock.removeAttribute("style");
      positionDockPopover();
      return;
    }
    setDockPosition(dockPosition.left, dockPosition.top);
  }

  function resetDockPosition() {
    dockPosition = null;
    persistDockPosition();
    applyDockPosition();
  }

  function bindDock() {
    const grip = labRoot.querySelector('[data-lab-action="drag-dock"]');
    const dock = labRoot.querySelector(".pfl-toolbar");
    if (!grip || !dock) return;
    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const start = dock.getBoundingClientRect();
      const offsetX = event.clientX - start.left;
      const offsetY = event.clientY - start.top;
      grip.setPointerCapture(event.pointerId);
      dock.classList.add("is-dragging");
      const move = (moveEvent) => setDockPosition(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
      const finish = () => {
        dock.classList.remove("is-dragging");
        persistDockPosition();
        grip.removeEventListener("pointermove", move);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", finish, { once: true });
      grip.addEventListener("pointercancel", finish, { once: true });
      event.preventDefault();
    });
    grip.addEventListener("dblclick", resetDockPosition);
    grip.addEventListener("keydown", (event) => {
      if (event.key === "Home") { event.preventDefault(); resetDockPosition(); return; }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const rect = dock.getBoundingClientRect();
      const distance = event.shiftKey ? 24 : 8;
      const horizontal = event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
      const vertical = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
      event.preventDefault();
      setDockPosition(rect.left + horizontal, rect.top + vertical, true);
    });
  }

  function queueActivity(feature, targetId = null, count = 1, activeMs = 0) {
    const key = `${currentVariant}:${feature}:${targetId || "all"}`;
    const entry = pending.get(key) || { variant: currentVariant, feature, targetId, count: 0, activeMs: 0 };
    entry.count += count;
    entry.activeMs += activeMs;
    pending.set(key, entry);
    if (count > 0) lastActivityAt = performance.now();
  }

  function measureActiveTime() {
    const now = performance.now();
    const elapsed = Math.max(0, Math.min(30_000, now - lastActiveAt));
    lastActiveAt = now;
    if (!document.hidden && now - lastActivityAt < 120_000) queueActivity("variant.view", null, 0, Math.round(elapsed));
  }

  async function flush() {
    measureActiveTime();
    if (!pending.size) return;
    const entries = [...pending.values()];
    pending = new Map();
    try {
      state = await request("/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries }),
        keepalive: true,
      });
    } catch (error) {
      for (const entry of entries) {
        const key = `${entry.variant}:${entry.feature}:${entry.targetId || "all"}`;
        const queued = pending.get(key) || { ...entry, count: 0, activeMs: 0 };
        queued.count += entry.count;
        queued.activeMs += entry.activeMs;
        pending.set(key, queued);
      }
      status = error.message;
    }
  }

  function actionTarget(element) {
    const action = element.dataset.action;
    if (!action) return null;
    if (action === "day") return { id: `day:${element.dataset.day}`, kind: "item", label: `Day ${element.dataset.day}` };
    if (action === "slot") return { id: `slot:${element.dataset.slot}`, kind: "item", label: `30-minute interval ${element.dataset.slot?.replace(":", " / ")}` };
    if (action === "session") return { id: `session:${element.dataset.session}`, kind: "item", label: `Session ${element.dataset.session}` };
    if (action === "unit") return { id: `unit:${element.dataset.unit}`, kind: "control", label: `${element.dataset.unit} display mode` };
    if (action === "filter") return { id: `filter:${element.dataset.filter}`, kind: "control", label: `${element.dataset.filter} filter` };
    if (action === "reference") return { id: "reference-month", kind: "control", label: "Reference month comparison" };
    if (action === "anomaly") return { id: "anomaly-ranking", kind: "control", label: "Spike ranking method" };
    if (action === "zoom") return { id: "inspection-scale", kind: "control", label: "Inspection scale" };
    const names = {
      month: "Month navigation", search: "Prompt and session search", threshold: "Minimum-usage threshold",
      "ollama-power": "Ollama power switch", "copy-source": "Copy source reference", "variant-step": "Prototype navigation",
      "layout-studio": "Edit mixed layout", "exit-custom": "Browse prototype variants",
    };
    return { id: action, kind: "control", label: names[action] || featureName(action) };
  }

  function decorate() {
    for (const [selector, id, label] of SECTION_TARGETS) {
      prototypeRoot.querySelectorAll(selector).forEach((element) => {
        if (element.dataset.feedbackId) return;
        element.dataset.feedbackId = id;
        element.dataset.feedbackKind = "section";
        element.dataset.feedbackLabel = label;
      });
    }
    prototypeRoot.querySelectorAll("[data-action]").forEach((element) => {
      const target = actionTarget(element);
      if (!target) return;
      element.dataset.feedbackId = target.id;
      element.dataset.feedbackKind = target.kind;
      element.dataset.feedbackLabel = target.label;
    });
    for (const element of prototypeRoot.querySelectorAll("[data-feedback-id]")) {
      const count = state.comments.filter((comment) => comment.variant === currentVariant && comment.target.id === element.dataset.feedbackId).length;
      element.dataset.feedbackComments = String(count);
      element.classList.toggle("has-feedback", count > 0);
    }
    prototypeRoot.classList.toggle("prototype-review-mode", reviewMode);
  }

  function openComposer(element) {
    composerTarget = {
      id: element.dataset.feedbackId,
      kind: element.dataset.feedbackKind || "section",
      label: element.dataset.feedbackLabel || element.dataset.feedbackId,
    };
    queueActivity("review.target-open", composerTarget.id);
    renderLab();
  }

  function commentCard(comment, deletable = false) {
    const context = Object.entries(comment.context || {}).filter(([, value]) => value).map(([key, value]) => `${key} ${value}`).join(" · ");
    return `<article class="pfl-comment" data-tone="${comment.sentiment}">
      <header><b>${escapeHtml(SENTIMENTS[comment.sentiment] || comment.sentiment)}</b><span>${escapeHtml(comment.author?.name || "Anonymous reviewer")}${comment.author?.team ? ` · ${escapeHtml(comment.author.team)}` : ""}</span><time>${escapeHtml(formatDate(comment.createdAt))}</time></header>
      <p>${escapeHtml(comment.body)}</p><small>${escapeHtml(comment.target.label)}${context ? ` · ${escapeHtml(context)}` : ""}</small>
      ${deletable ? `<button data-lab-action="delete-comment" data-comment="${escapeHtml(comment.id)}">Delete</button>` : ""}
    </article>`;
  }

  function composer() {
    if (!composerTarget) return "";
    const matching = state.comments
      .filter((comment) => comment.variant === currentVariant && comment.target.id === composerTarget.id)
      .sort((left, right) => globalThis.SaxjaxDateTimeSort.compareDateTimes(left, right, commentSortDirection, (comment) => comment.createdAt));
    return `<div class="pfl-scrim" data-lab-action="close-composer"></div><aside class="pfl-composer" aria-label="Comment on prototype">
      <header><div><span>COMMENT ON ${currentVariant}</span><h2>${escapeHtml(composerTarget.label)}</h2></div><button data-lab-action="close-composer" aria-label="Close">×</button></header>
      <p class="pfl-context">${escapeHtml(Object.values(getContext()).filter(Boolean).join(" · "))}</p>
      <form id="pfl-comment-form"><fieldset><legend>What kind of feedback is this?</legend>${Object.entries(SENTIMENTS).map(([key, label]) => `<label><input type="radio" name="sentiment" value="${key}" ${key === "idea" ? "checked" : ""}><span>${label}</span></label>`).join("")}</fieldset><textarea name="body" required maxlength="4000" placeholder="What worked, what slowed you down, or what should we borrow elsewhere?"></textarea><div><button type="button" data-lab-action="close-composer">Cancel</button><button type="submit">Save comment</button></div></form>
      <section class="pfl-existing"><h3>${matching.length} comment${matching.length === 1 ? "" : "s"} here</h3>${matching.map((item) => commentCard(item, item.author?.id === state.reviewer.id)).join("") || "<p>No comments on this target yet.</p>"}</section>
    </aside>`;
  }

  function variantMetrics(variant) {
    const comments = state.comments.filter((comment) => comment.variant === variant);
    const activity = activitySummary(state, variant);
    const features = (state.activity || []).filter((item) => item.variant === variant && item.feature !== "variant.view")
      .reduce((map, item) => map.set(item.feature, (map.get(item.feature) || 0) + item.count), new Map());
    const top = [...features].sort((left, right) => right[1] - left[1]).slice(0, 4);
    return { comments, activity, top };
  }

  function preferredSummary() {
    const preferred = state.preferredView || { mode: "classic", variant: "A", layout: DEFAULT_LAYOUT };
    if (preferred.mode === "variant") return `${preferred.variant} · ${variants[preferred.variant]}`;
    if (preferred.mode === "custom") return "My mixed view";
    return "Classic monitor";
  }

  async function savePreferredView(preferred, activate = true) {
    state = await request("/preferred-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(preferred),
    });
    draftLayout = normalizeLayout(state.preferredView.layout);
    status = `${preferredSummary()} is now the startup view`;
    defaultMenuOpen = false;
    studioOpen = false;
    if (activate) {
      comparisonOpen = false;
      const url = new URL(location.href);
      url.searchParams.delete("review");
      history.replaceState(null, "", url);
    }
    queueActivity("preference.save", preferred.mode);
    if (activate) activatePreference?.(state.preferredView);
    renderLab();
  }

  function defaultMenu() {
    if (!defaultMenuOpen) return "";
    const context = getContext();
    return `<div class="pfl-scrim" data-lab-action="close-default"></div><aside class="pfl-default-menu" aria-label="Choose default monitor view">
      <header><span>STARTUP VIEW</span><h2>${escapeHtml(preferredSummary())}</h2><button data-lab-action="close-default" aria-label="Close">×</button></header>
      <p>Choose what opens from Spotlight, the Dock, and a plain monitor URL. This stays on this Mac and is not included in review exports.</p>
      <div class="pfl-default-options">
        ${context.custom ? `<button data-lab-action="use-custom"><b>Use this mixed view</b><small>Keep the current section recipe as your default.</small></button>` : `<button data-lab-action="use-variant" data-variant="${currentVariant}"><b>Use ${currentVariant} · ${escapeHtml(variants[currentVariant])}</b><small>Open this complete prototype by default.</small></button>`}
        <button data-lab-action="open-studio"><b>Build a mixed view</b><small>Choose and order sections from A0–E.</small></button>
        <button data-lab-action="use-classic"><b>Use the classic monitor</b><small>Return startup to the existing production dashboard.</small></button>
      </div>
      <footer><span>Current default</span><strong>${escapeHtml(preferredSummary())}</strong>${status ? `<small>${escapeHtml(status)}</small>` : ""}</footer>
    </aside>`;
  }

  function layoutStudio() {
    if (!studioOpen) return "";
    const sections = draftLayout.sections || DEFAULT_LAYOUT.sections;
    return `<section class="pfl-studio" aria-label="Build a mixed monitor view">
      <header><div><span>MY MONITOR / COMPOSITION STUDIO</span><h1>Take the useful parts with you.</h1><p>Choose the character of the outer frame, then decide which prototype supplies each instrument. The usage timeline, evidence, and system state stay required so the result remains a working monitor.</p></div><button data-lab-action="close-studio">Cancel</button></header>
      <div class="pfl-shell-picker"><div><span>OUTER FRAME</span><h2>Which world should hold the pieces?</h2></div>${SOURCE_VARIANTS.map((key) => `<button data-lab-action="studio-shell" data-variant="${key}" class="${draftLayout.shellVariant === key ? "is-active" : ""}" aria-pressed="${draftLayout.shellVariant === key}"><b>${key}</b><span>${escapeHtml(variants[key])}</span></button>`).join("")}</div>
      <main class="pfl-section-builder"><header><span>ORDER</span><span>SECTION</span><span>SOURCE PROTOTYPE</span><span>IN VIEW</span></header>${sections.map((section, index) => {
        const definition = SECTION_LIBRARY[section.id];
        return `<article data-section-row="${section.id}" class="${section.enabled ? "" : "is-disabled"}"><div class="pfl-order"><b>${String(index + 1).padStart(2, "0")}</b><button data-lab-action="move-section" data-section="${section.id}" data-direction="-1" aria-label="Move ${escapeHtml(definition.label)} earlier" ${index === 0 ? "disabled" : ""}>↑</button><button data-lab-action="move-section" data-section="${section.id}" data-direction="1" aria-label="Move ${escapeHtml(definition.label)} later" ${index === sections.length - 1 ? "disabled" : ""}>↓</button></div><div><h3>${escapeHtml(definition.label)}</h3><p>${escapeHtml(definition.description)}</p>${definition.required ? "<small>REQUIRED</small>" : ""}</div><label><select data-lab-action="section-source" data-section="${section.id}" aria-label="Source prototype for ${escapeHtml(definition.label)}">${SOURCE_VARIANTS.map((key) => `<option value="${key}" ${section.sourceVariant === key ? "selected" : ""}>${key} · ${escapeHtml(variants[key])} — ${escapeHtml(SECTION_FLAVOURS[key])}</option>`).join("")}</select></label><label class="pfl-include"><input data-lab-action="section-enabled" data-section="${section.id}" type="checkbox" aria-label="Show ${escapeHtml(definition.label)}" ${section.enabled ? "checked" : ""} ${definition.required ? "disabled" : ""}><i></i><span>${section.enabled ? "Shown" : "Hidden"}</span></label></article>`;
      }).join("")}</main>
      <footer><button data-lab-action="restore-layout">Restore useful mix</button><div><span>${sections.filter((item) => item.enabled).length} sections · shell ${draftLayout.shellVariant}</span><button data-lab-action="save-layout">Save and use this view</button></div></footer>
    </section>`;
  }

  function comparison() {
    if (!comparisonOpen) return "";
    const targetRows = [...new Map(state.comments.map((comment) => [comment.target.id, comment.target.label])).entries()];
    const allComments = [...state.comments].sort((left, right) =>
      globalThis.SaxjaxDateTimeSort.compareDateTimes(left, right, commentSortDirection, (comment) => comment.createdAt),
    );
    return `<section class="pfl-comparison" aria-label="Prototype comparison">
      <header class="pfl-compare-head"><div><span>SAXJAX / DESIGN RESEARCH</span><h1>Prototype evidence room</h1><p>Compare what people said with what they actually tried. Exports omit captured prompt/response bodies and the usage timeline; they include comments and the selected section or item identifiers.</p></div><button data-lab-action="close-compare">Return to prototype</button></header>
      <div class="pfl-reviewer"><label>Your name<input id="pfl-reviewer-name" value="${escapeHtml(state.reviewer.name)}" placeholder="Shown in exported comments"></label><label>Team<input id="pfl-reviewer-team" value="${escapeHtml(state.reviewer.team)}" placeholder="Optional"></label><button data-lab-action="save-reviewer">Save identity</button><small>${state.importedBundles.length} colleague bundle${state.importedBundles.length === 1 ? "" : "s"} merged on this Mac</small></div>
      <nav class="pfl-compare-actions"><button data-lab-action="export">Export review bundle</button><label>Import colleague bundles<input data-lab-action="import" type="file" accept="application/json,.json" multiple></label><button data-lab-action="copy-ai">Copy AI design brief</button><span>${escapeHtml(status)}</span></nav>
      <div class="pfl-variant-grid">${Object.entries(variants).map(([key, name]) => {
        const metric = variantMetrics(key);
        const tones = Object.keys(SENTIMENTS).map((tone) => `${metric.comments.filter((item) => item.sentiment === tone).length} ${SENTIMENTS[tone].toLowerCase()}`).join(" · ");
        return `<article><header><span>${key}</span><div><h2>${escapeHtml(name)}</h2><div><button data-lab-action="open-variant" data-variant="${key}">Open</button><button data-lab-action="use-variant" data-variant="${key}">Use as default</button></div></div></header><dl><div><dt>Comments</dt><dd>${metric.comments.length}</dd></div><div><dt>Visits</dt><dd>${metric.activity.visits}</dd></div><div><dt>Active use</dt><dd>${formatDuration(metric.activity.activeMs)}</dd></div><div><dt>Actions</dt><dd>${metric.activity.count}</dd></div></dl><p>${tones}</p><ol>${metric.top.map(([feature, count]) => `<li><span>${escapeHtml(featureName(feature))}</span><b>${count}</b></li>`).join("") || "<li>No interactions recorded yet</li>"}</ol></article>`;
      }).join("")}</div>
      <section class="pfl-matrix"><header><div><span>SECTION-BY-SECTION</span><h2>Where the variants disagree</h2></div><p>Counts are comments; colour shows the balance of keep/problem/idea/question notes.</p></header><div class="pfl-table"><div class="pfl-table-row is-head"><b>Feature or item</b>${Object.keys(variants).map((key) => `<b>${key}</b>`).join("")}</div>${targetRows.map(([targetId, label]) => `<div class="pfl-table-row"><span>${escapeHtml(label)}</span>${Object.keys(variants).map((key) => { const comments = state.comments.filter((item) => item.variant === key && item.target.id === targetId); return `<button data-lab-action="matrix-filter" data-variant="${key}" data-target="${escapeHtml(targetId)}" title="Show these comments">${comments.length || "—"}<i>${comments.map((item) => `<em data-tone="${item.sentiment}"></em>`).join("")}</i></button>`; }).join("")}</div>`).join("") || "<p>No section comments yet. Turn on Comment mode and click a marked part of a prototype.</p>"}</div></section>
      <section class="pfl-comment-feed"><header><div><span>REVIEW TRANSCRIPT</span><h2>All comments · ${globalThis.SaxjaxDateTimeSort.label(commentSortDirection).toLowerCase()}</h2></div><button data-lab-action="comment-sort" aria-label="Reverse comment date and time order">${commentSortDirection === "desc" ? "Newest first ↓" : "Oldest first ↑"}</button></header><div>${allComments.map((comment) => `<div class="pfl-feed-item"><strong>${comment.variant}</strong>${commentCard(comment, comment.author?.id === state.reviewer.id)}</div>`).join("") || "<p>No comments have been collected yet.</p>"}</div></section>
      <section class="pfl-ai"><span>AI HANDOFF</span><h2>Evidence is packaged for the next design round</h2><p>The exported JSON includes variant names, comments, aggregate feature use, and an analysis brief. Give it to an AI coding agent with this repository and ask it to propose new variants—without treating click count as approval.</p><button data-lab-action="copy-ai">Copy analysis prompt</button></section>
    </section>`;
  }

  function toolbar() {
    const context = getContext();
    const custom = context.custom === true;
    const navigation = custom
      ? `<button data-lab-action="browse-variants" class="pfl-nav-button" aria-label="Browse prototype variants">A0–I</button><div class="pfl-dock-current"><small>MY MIXED VIEW</small><strong>${state.preferredView?.layout?.sections?.filter((item) => item.enabled !== false).length || 0} sections</strong></div><button data-lab-action="open-studio" class="pfl-nav-button" aria-label="Edit mixed layout">✦</button>`
      : `<button data-lab-action="previous-variant" class="pfl-nav-button" aria-label="Previous prototype">←</button><div class="pfl-dock-current"><small>PROTOTYPE ${currentVariant}</small><strong>${escapeHtml(variants[currentVariant] || "Monitor direction")}</strong></div><button data-lab-action="next-variant" class="pfl-nav-button" aria-label="Next prototype">→</button>`;
    return `<nav class="pfl-toolbar" aria-label="Movable prototype lab dock"><button data-lab-action="drag-dock" class="pfl-dock-grip" aria-label="Move prototype lab dock. Double-click or press Home to reset." title="Drag to move · double-click to reset">⠿</button><div class="pfl-dock-navigation">${navigation}</div><div class="pfl-dock-actions"><button data-lab-action="toggle-review" class="${reviewMode ? "is-active" : ""}"><i class="pfl-comment-dot"></i>${reviewMode ? "Pick a section" : "Comment"}</button><button data-lab-action="compare">Compare <b class="pfl-count">${state.comments.length}</b></button><button data-lab-action="export">Export</button><button data-lab-action="default-menu" class="pfl-default-trigger"><span>Default</span><b>${escapeHtml(preferredSummary())}</b></button></div></nav>`;
  }

  function renderLab() {
    labRoot.innerHTML = `${toolbar()}${composer()}${defaultMenu()}${comparison()}${layoutStudio()}`;
    bindLab();
    bindDock();
    applyDockPosition();
  }

  function aiBrief() {
    const lines = [
      "# Saxjax Monitor prototype synthesis brief",
      "",
      "Design goal: make usage explosions immediately visible, reveal the sessions/prompts that caused them, and show whether the local system is overloaded or using resources well.",
      "",
      "Treat comments as qualitative evidence and interaction counts as attention/attempts—not votes. Preserve provider-neutral tokens/provider-units/money modes, month comparison, zoom, keyboard navigation, prompt evidence, parallel sessions, resource state, and Ollama power control.",
      "",
    ];
    for (const [variant, name] of Object.entries(variants)) {
      const metric = variantMetrics(variant);
      lines.push(`## ${variant} — ${name}`, `Usage: ${metric.activity.visits} visits, ${formatDuration(metric.activity.activeMs)} active, ${metric.activity.count} actions.`);
      for (const comment of metric.comments) lines.push(`- [${SENTIMENTS[comment.sentiment]}] ${comment.target.label}: ${comment.body} — ${comment.author?.name || "anonymous"}`);
      if (!metric.comments.length) lines.push("- No comments yet.");
      lines.push("");
    }
    lines.push("## Requested output", "", "1. Identify agreements, contradictions, and high-attention areas.", "2. Propose 2–3 structurally different next prototypes, citing the evidence behind each major choice.", "3. State which existing elements are retained, combined, changed, or discarded.", "4. Keep every required function available in every prototype.", "5. Implement them behind new prototype variant keys and retain this review workflow.");
    return lines.join("\n");
  }

  async function exportBundle() {
    await flush();
    const bundle = await request("/export");
    bundle.variantCatalog = variants;
    bundle.productQuestion = "How can usage explosions and their causes be spotted fastest while preserving clear local-system health monitoring?";
    bundle.aiAnalysisBrief = aiBrief();
    const owner = (bundle.reviewer?.name || "anonymous").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    download(`saxjax-prototype-review-${owner || "anonymous"}-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(bundle, null, 2)}\n`);
    status = "Review bundle exported";
    renderLab();
  }

  async function importFiles(files) {
    for (const file of files) {
      const bundle = JSON.parse(await file.text());
      state = await request("/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bundle) });
    }
    status = `${files.length} bundle${files.length === 1 ? "" : "s"} merged`;
    decorate();
    renderLab();
  }

  function bindLab() {
    labRoot.querySelectorAll("[data-lab-action]").forEach((element) => element.addEventListener("click", async (event) => {
      const action = element.dataset.labAction;
      if (action === "previous-variant" || action === "next-variant") {
        const keys = Object.keys(variants);
        const index = Math.max(0, keys.indexOf(currentVariant));
        const step = action === "previous-variant" ? -1 : 1;
        queueActivity("navigation.variant");
        changeVariant(keys[(index + step + keys.length) % keys.length]);
      }
      if (action === "browse-variants") changeVariant(state.preferredView?.layout?.shellVariant || "A");
      if (action === "toggle-review") { reviewMode = !reviewMode; composerTarget = null; queueActivity("review.mode"); decorate(); renderLab(); }
      if (action === "compare") { comparisonOpen = true; queueActivity("review.compare"); const url = new URL(location.href); url.searchParams.set("review", "compare"); history.replaceState(null, "", url); renderLab(); }
      if (action === "close-compare") { comparisonOpen = false; const url = new URL(location.href); url.searchParams.delete("review"); history.replaceState(null, "", url); renderLab(); }
      if (action === "comment-sort") { commentSortDirection = commentSortDirection === "desc" ? "asc" : "desc"; const url = new URL(location.href); if (commentSortDirection === "asc") url.searchParams.set("sort", "asc"); else url.searchParams.delete("sort"); history.replaceState(null, "", url); renderLab(); window.dispatchEvent(new CustomEvent("saxjax-date-sort-change", { detail: { direction: commentSortDirection } })); }
      if (action === "close-composer") { composerTarget = null; renderLab(); }
      if (action === "default-menu") { defaultMenuOpen = !defaultMenuOpen; composerTarget = null; renderLab(); }
      if (action === "close-default") { defaultMenuOpen = false; renderLab(); }
      if (action === "use-variant") await savePreferredView({ ...state.preferredView, mode: "variant", variant: element.dataset.variant });
      if (action === "use-custom") await savePreferredView({ ...state.preferredView, mode: "custom", layout: draftLayout });
      if (action === "use-classic") await savePreferredView({ ...state.preferredView, mode: "classic" });
      if (action === "open-studio") { defaultMenuOpen = false; comparisonOpen = false; const url = new URL(location.href); url.searchParams.delete("review"); history.replaceState(null, "", url); studioOpen = true; draftLayout = normalizeLayout(state.preferredView?.layout); renderLab(); }
      if (action === "close-studio") { studioOpen = false; renderLab(); }
      if (action === "studio-shell") { draftLayout.shellVariant = element.dataset.variant; renderLab(); }
      if (action === "move-section") {
        const index = draftLayout.sections.findIndex((item) => item.id === element.dataset.section);
        const next = Math.max(0, Math.min(draftLayout.sections.length - 1, index + Number(element.dataset.direction)));
        if (index >= 0 && index !== next) [draftLayout.sections[index], draftLayout.sections[next]] = [draftLayout.sections[next], draftLayout.sections[index]];
        renderLab();
      }
      if (action === "restore-layout") { draftLayout = structuredClone(DEFAULT_LAYOUT); renderLab(); }
      if (action === "save-layout") await savePreferredView({ mode: "custom", variant: currentVariant, layout: draftLayout });
      if (action === "export") await exportBundle();
      if (action === "copy-ai") { await flush(); await copyText(aiBrief()); status = "AI design brief copied"; renderLab(); }
      if (action === "save-reviewer") {
        state = await request("/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: labRoot.querySelector("#pfl-reviewer-name").value, team: labRoot.querySelector("#pfl-reviewer-team").value }) });
        status = "Reviewer identity saved"; renderLab();
      }
      if (action === "open-variant") { comparisonOpen = false; changeVariant(element.dataset.variant); }
      if (action === "delete-comment") {
        state = await request(`/comment?id=${encodeURIComponent(element.dataset.comment)}`, { method: "DELETE" });
        decorate(); renderLab();
      }
      if (action === "matrix-filter") {
        const card = [...labRoot.querySelectorAll(".pfl-feed-item")].find((item) => item.querySelector("strong")?.textContent === element.dataset.variant && item.textContent.includes(element.closest(".pfl-table-row")?.querySelector("span")?.textContent));
        card?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      event.stopPropagation();
    }));
    labRoot.querySelectorAll('select[data-lab-action="section-source"]').forEach((select) => select.addEventListener("change", () => {
      const section = draftLayout.sections.find((item) => item.id === select.dataset.section);
      if (section) section.sourceVariant = select.value;
      queueActivity("preference.section-source", select.dataset.section);
    }));
    labRoot.querySelectorAll('input[data-lab-action="section-enabled"]').forEach((input) => input.addEventListener("change", () => {
      const section = draftLayout.sections.find((item) => item.id === input.dataset.section);
      if (section) section.enabled = input.checked;
      renderLab();
    }));
    labRoot.querySelectorAll('input[data-lab-action="import"]').forEach((input) => input.addEventListener("change", async () => {
      try { await importFiles([...input.files]); } catch (error) { status = error.message; renderLab(); }
    }));
    labRoot.querySelector("#pfl-comment-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await flush();
      const context = getContext();
      const variantUsage = activitySummary(state, currentVariant);
      const targetUsage = activitySummary(state, currentVariant, composerTarget.id);
      context.variantVisits = String(variantUsage.visits);
      context.variantActiveMs = String(variantUsage.activeMs);
      context.targetUses = String(targetUsage.count);
      const result = await request("/comment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        variant: currentVariant, target: composerTarget, context, sentiment: form.get("sentiment"), body: form.get("body"),
      }) });
      state = result.snapshot;
      queueActivity("review.comment", composerTarget.id);
      status = "Comment saved locally";
      decorate(); renderLab();
    });
  }

  prototypeRoot.addEventListener("click", (event) => {
    const target = event.target.closest("[data-feedback-id]");
    if (!target || !prototypeRoot.contains(target)) return;
    if (reviewMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openComposer(target);
      return;
    }
    if (target.dataset.action) queueActivity(`control.${target.dataset.action}`, target.dataset.feedbackId);
  }, true);

  queueActivity("variant.view", null, 1, 0);
  const timer = setInterval(() => void flush(), 10_000);
  document.addEventListener("visibilitychange", () => { measureActiveTime(); if (document.hidden) void flush(); });
  window.addEventListener("resize", applyDockPosition);
  window.addEventListener("saxjax-date-sort-change", (event) => {
    const direction = globalThis.SaxjaxDateTimeSort.normalize(event.detail?.direction);
    if (direction === commentSortDirection) return;
    commentSortDirection = direction;
    if (comparisonOpen) renderLab();
  });
  window.addEventListener("pagehide", () => { clearInterval(timer); void flush(); });

  renderLab();
  return {
    decorate,
    track(feature, targetId = null) { queueActivity(feature, targetId); },
    variantChanged(nextVariant) {
      measureActiveTime();
      currentVariant = nextVariant;
      lastActiveAt = performance.now();
      lastActivityAt = performance.now();
      queueActivity("variant.view", null, 1, 0);
      composerTarget = null;
      decorate();
      renderLab();
    },
    update(snapshot) {
      state = snapshot;
      if (!studioOpen) draftLayout = normalizeLayout(state.preferredView?.layout);
      decorate();
      if (!composerTarget && !labRoot.querySelector("input:focus, textarea:focus")) renderLab();
    },
    openStudio() { defaultMenuOpen = false; comparisonOpen = false; studioOpen = true; draftLayout = normalizeLayout(state.preferredView?.layout); renderLab(); },
    preferredView() { return structuredClone(state.preferredView); },
  };
}
