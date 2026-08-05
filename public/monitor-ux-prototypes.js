// PROTOTYPE — eight disposable full-monitor directions, switchable with
// /monitor/?prototype=monitor&variant=A. Monitor data stays read-only; the
// separate prototype review layer persists only comments and aggregate usage.

import { concurrentSessionCounts } from "/monitor/usage-timeline-view-model.mjs";

const params = new URLSearchParams(location.search);
const prototypeEnabled = params.get("prototype") === "monitor";
const labEnabled = prototypeEnabled && params.get("surface") !== "default";

const VARIANTS = {
  A0: "Classic monitor",
  A: "Flight recorder",
  B: "Cost seismograph",
  C: "Machine room",
  D: "Month contact sheet",
  E: "Incident ledger",
  F: "Credit garden",
  H: "Prompt loom",
  I: "Run the month",
  G: "Build your own",
};

const VISUAL_VARIANTS = ["A0", "A", "B", "C", "D", "E", "F", "H", "I"];
const PROTOTYPE_DETAIL_KEY = "saxjax.prototype-detail-level.v1";

function initialDetailLevel() {
  try {
    const saved = localStorage.getItem(PROTOTYPE_DETAIL_KEY);
    if (saved === "essential" || saved === "full") return saved;
  } catch {}
  return matchMedia("(max-width: 760px)").matches ? "essential" : "full";
}

let prototypeDetailLevel = initialDetailLevel();

function detailToggle() {
  const full = prototypeDetailLevel === "full";
  return `<button class="mux-detail-toggle" data-action="detail-level" aria-pressed="${full}" title="${full ? "Hide" : "Show"} optional explanations"><i aria-hidden="true"></i><span>Reading detail</span><b>${full ? "Full" : "Essential"}</b></button>`;
}

const FAMILY_COLORS = {
  claude: "#e7654b",
  gpt: "#3168d6",
  gemini: "#d29a22",
  llama: "#2f9b78",
  other: "#7d7781",
};

const FAMILY_LABELS = {
  claude: "Claude",
  gpt: "GPT / OpenAI",
  gemini: "Gemini",
  llama: "Llama / local",
  other: "Other",
};

const ORIGIN_COLORS = {
  "vscode-insiders": "#e7654b",
  vscode: "#3168d6",
  "copilot-cli": "#d29a22",
  ollama: "#2f9b78",
  api: "#8b6bc1",
  other: "#7d7781",
};

const ORIGIN_LABELS = {
  "vscode-insiders": "VS Code Insiders",
  vscode: "VS Code",
  "copilot-cli": "Copilot CLI",
  ollama: "Ollama gateway",
  api: "API",
  other: "Other source",
};

const PROVIDER_RULES = {
  "github-copilot": { label: "GitHub Copilot", nativeLabel: "AI credits", usdPerNative: 0.01, billingReads: false },
  ollama: { label: "Ollama", nativeLabel: null, usdPerNative: null, billingReads: false },
  anthropic: { label: "Anthropic", nativeLabel: null, usdPerNative: null, billingReads: false },
  openai: { label: "OpenAI", nativeLabel: null, usdPerNative: null, billingReads: false },
};

const formatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const monthFormatter = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
const shortMonthFormatter = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function localParts(value) {
  const parts = formatter.formatToParts(new Date(value));
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return {
    month: `${read("year")}-${read("month")}`,
    day: `${read("year")}-${read("month")}-${read("day")}`,
    minute: Number(read("hour")) * 60 + Number(read("minute")),
  };
}

function familyOf(event) {
  const family = String(event.model?.family || event.model?.exactLabel || "other").toLowerCase();
  if (family.includes("claude")) return "claude";
  if (family.includes("gpt") || family.includes("openai")) return "gpt";
  if (family.includes("gemini")) return "gemini";
  if (family.includes("llama") || family.includes("ollama")) return "llama";
  return "other";
}

function calendarDays(month) {
  const safeMonth = /^\d{4}-\d{2}$/.test(month || "") ? month : localParts(new Date().toISOString()).month;
  const [year, monthNumber] = safeMonth.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${safeMonth}-${String(index + 1).padStart(2, "0")}`);
}

function formatMonth(month, short = false) {
  const safeMonth = /^\d{4}-\d{2}$/.test(month || "") ? month : localParts(new Date().toISOString()).month;
  const [year, monthNumber] = safeMonth.split("-").map(Number);
  return (short ? shortMonthFormatter : monthFormatter).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function normalizeEvents(snapshot) {
  const profiles = new Map((snapshot?.profiles || []).map((profile) => [profile.id, profile]));
  return (snapshot?.usageEvents || []).flatMap((event, index) => {
    const instant = event?.timing?.usageAt;
    if (!instant || !Number.isFinite(Date.parse(instant))) return [];
    const point = localParts(instant);
    const started = localParts(event.timing?.startedAt || instant);
    const totalTokens = Number.isFinite(event.measurements?.totalTokens)
      ? event.measurements.totalTokens
      : [event.measurements?.inputTokens, event.measurements?.outputTokens].filter(Number.isFinite).reduce((sum, value) => sum + value, 0) || null;
    const native = Number.isFinite(event.measurements?.nativeUnit?.value) ? event.measurements.nativeUnit.value : null;
    const source = event.sourceReference || {};
    const profile = profiles.get(event.profileId) || {};
    const provider = event.providerId || profile.providerId || "unknown";
    const origin = event.clientSource || profile.clientSource || "other";
    const providerRule = PROVIDER_RULES[provider] || {};
    return [{
      id: event.id || `event-${index}`,
      at: instant,
      startedAt: event.timing?.startedAt || instant,
      month: point.month,
      day: point.day,
      minute: started.minute,
      bucket: Math.floor(point.minute / 30),
      durationMinutes: Math.max(1, Math.round((event.timing?.durationMs || 0) / 60000)),
      family: familyOf(event),
      model: event.model?.exactLabel || event.model?.family || "Unknown model",
      provider,
      providerLabel: providerRule.label || provider,
      origin,
      originLabel: ORIGIN_LABELS[origin] || source.client || origin,
      profile: profile.label || event.profileId || "Unverified profile",
      credits: native,
      tokens: totalTokens,
      inputTokens: Number.isFinite(event.measurements?.inputTokens) ? event.measurements.inputTokens : null,
      outputTokens: Number.isFinite(event.measurements?.outputTokens) ? event.measurements.outputTokens : null,
      dollars: native == null || !Number.isFinite(providerRule.usdPerNative) ? null : native * providerRule.usdPerNative,
      prompt: event.promptExcerpt || "Prompt excerpt was cleared or not supplied.",
      source: [source.client || "Local client", source.journalSessionId ? `session ${source.journalSessionId}` : null, source.requestStartedAt || event.timing?.startedAt || instant].filter(Boolean).join(" · "),
      sessionId: source.journalSessionId || event.sessionId || event.id || `event-${index}`,
      journalSessionId: source.journalSessionId || null,
      journalName: source.journalName || null,
      requestId: source.requestId || event.identity?.requestId || null,
      responseId: source.responseId || event.identity?.responseId || null,
      captureClient: origin === "vscode-insiders" ? "vscode-insiders" : origin === "vscode" ? "vscode" : null,
      evidenceSource: event.evidence?.source || "unknown",
      evidenceStatus: event.evidence?.status || "unverified",
      identityStrength: event.identity?.strength || "unknown",
      nativeLabel: providerRule.nativeLabel || "provider units",
    }];
  }).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

// Gateway traffic is available immediately, while provider journal imports
// can arrive later. Keep that live observation deliberately separate from the
// durable timeline; provider imports remain the authoritative long-term record
// and a reload removes any provisional point that was not durably imported.
function normalizeLiveRequest(item) {
  const startedAt = item?.startedAt;
  if (!startedAt || !Number.isFinite(Date.parse(startedAt))) return null;
  const finishedAt = item.finishedAt && Number.isFinite(Date.parse(item.finishedAt)) ? item.finishedAt : null;
  const metrics = item.metrics || {};
  const inputTokens = Number.isFinite(metrics.promptTokens) ? metrics.promptTokens : null;
  const outputTokens = Number.isFinite(metrics.outputTokens) ? metrics.outputTokens : null;
  const totalTokens = Number.isFinite(metrics.totalTokens)
    ? metrics.totalTokens
    : inputTokens != null || outputTokens != null ? (inputTokens || 0) + (outputTokens || 0) : null;
  const instant = finishedAt || startedAt;
  const point = localParts(instant);
  const source = item.sourceLabel || item.client || item.source || "Gateway";
  return {
    id: `live:${item.id}`,
    at: instant,
    startedAt,
    month: point.month,
    day: point.day,
    minute: localParts(startedAt).minute,
    bucket: Math.floor(point.minute / 30),
    durationMinutes: Math.max(1, Math.round((Number(metrics.totalDurationNs) || 0) / 60_000_000_000)),
    family: item.model || "unknown",
    model: item.model || "Unknown model",
    provider: item.provider || item.source || "unknown",
    providerLabel: item.provider || item.source || "Unknown provider",
    origin: item.source || "other",
    originLabel: source,
    profile: source,
    credits: null,
    tokens: totalTokens,
    inputTokens,
    outputTokens,
    dollars: null,
    prompt: item.prompt || item.submittedPrompt || "Live request (prompt excerpt unavailable)",
    source: `${source} · ${item.clientAddress || "local"} · ${startedAt}`,
    sessionId: item.session?.id || item.id,
    evidenceSource: "gateway-traffic",
    evidenceStatus: "provisional",
    identityStrength: "request-id",
    nativeLabel: "provider units",
  };
}

function unitValue(event, unit) {
  return Number.isFinite(event[unit]) ? event[unit] : 0;
}

function unitLabel(unit) {
  if (unit === "credits") return "credits";
  if (unit === "tokens") return "tokens";
  return "estimated USD";
}

function formatLabeledValue(value, unit, compact = false) {
  const formatted = formatValue(value, unit, compact);
  if (formatted === "—") return `— ${unitLabel(unit)}`;
  if (unit === "dollars") return `${formatted} estimated USD`;
  return `${formatted} ${unitLabel(unit)}`;
}

function formatValue(value, unit, compact = false) {
  if (!Number.isFinite(value)) return "—";
  if (unit === "dollars") return `${compact ? "≈" : "≈ "}$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (unit === "tokens") {
    if (compact && value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
    if (compact && value >= 1_000) return `${Math.round(value / 1_000)}k`;
    return Math.round(value).toLocaleString();
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: compact ? 0 : 1 });
}

function clock(minute) {
  const safe = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function sortLabel(direction) {
  return globalThis.SaxjaxDateTimeSort.label(direction);
}

function sortSlotsByDateTime(slots, direction) {
  return [...slots].sort((left, right) => globalThis.SaxjaxDateTimeSort.compareValues(
    Date.parse(`${left.day}T${clock(left.bucket * 30)}:00`),
    Date.parse(`${right.day}T${clock(right.bucket * 30)}:00`),
    direction,
  ));
}

function sortedDays(model) {
  return [...model.view.daily].sort((left, right) =>
    globalThis.SaxjaxDateTimeSort.compareDateTimes(left.day, right.day, model.sortDirection),
  );
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function buildView(events, month, unit, anomalyMode = "value", threshold = 0) {
  const monthEvents = events.filter((event) => event.month === month);
  const days = calendarDays(month);
  const dayMap = new Map(days.map((day) => [day, { day, total: 0, events: [], byOrigin: {}, missing: 0 }]));
  const slots = days.flatMap((day) => Array.from({ length: 48 }, (_, bucket) => ({
    id: `${day}:${bucket}`, day, bucket, total: 0, events: [], byOrigin: {}, concurrent: 0, missing: 0,
  })));
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  for (const event of monthEvents) {
    const value = unitValue(event, unit);
    const day = dayMap.get(event.day);
    const slot = slotMap.get(`${event.day}:${event.bucket}`);
    if (!day || !slot) continue;
    day.events.push(event);
    if (!Number.isFinite(event[unit])) day.missing += 1;
    day.total += value;
    day.byOrigin[event.origin] = (day.byOrigin[event.origin] || 0) + value;
    slot.events.push(event);
    if (!Number.isFinite(event[unit])) slot.missing += 1;
    slot.total += value;
    slot.byOrigin[event.origin] = (slot.byOrigin[event.origin] || 0) + value;
  }
  // Populate concurrency while walking the events instead of scanning the
  // complete month once for every half-hour slot. Large imported journals can
  // contain tens of thousands of events, so the former slots × events pass
  // could leave the browser's main thread unresponsive before first paint.
  const concurrentSessions = concurrentSessionCounts(monthEvents);
  for (const slot of slots) slot.concurrent = concurrentSessions.get(slot.id) || 0;
  const daily = [...dayMap.values()];
  const measuredEvents = monthEvents.filter((event) => Number.isFinite(event[unit]));
  const total = measuredEvents.reduce((sum, event) => sum + event[unit], 0);
  const peakDay = daily.reduce((peak, day) => day.total > peak.total ? day : peak, daily[0] || { total: 0, events: [] });
  const peakSlot = slots.reduce((peak, slot) => slot.total > peak.total ? slot : peak, slots[0] || { total: 0, events: [] });
  const nonZero = slots.map((slot) => slot.total).filter(Boolean).sort((a, b) => a - b);
  const occupiedMedian = nonZero[Math.floor(nonZero.length / 2)] || 1;
  const bucketBaselines = Array.from({ length: 48 }, (_, bucket) => median(slots.filter((slot) => slot.bucket === bucket && slot.total > 0).map((slot) => slot.total)) || occupiedMedian);
  const ranked = slots.filter((slot) => slot.total > 0 && slot.total >= threshold).map((slot) => {
    const index = slots.indexOf(slot);
    const previous = slots[index - 1]?.total || 0;
    const multiple = slot.total / Math.max(1, bucketBaselines[slot.bucket]);
    const jump = Math.max(0, slot.total - previous);
    const jumpPercent = (slot.total - previous) / Math.max(1, previous) * 100;
    const score = anomalyMode === "jump" ? jumpPercent : anomalyMode === "unusual" ? multiple : slot.total;
    return { ...slot, multiple, jump, jumpPercent, score };
  }).sort((left, right) => right.score - left.score);
  const topSlots = ranked.slice(0, 12).map((slot, rank) => ({ ...slot, rank: rank + 1 }));
  let running = 0;
  const cumulative = slots.map((slot) => (running += slot.total));
  const origins = [...new Set(monthEvents.map((event) => event.origin))];
  const originTotals = origins.map((origin) => ({
    origin,
    total: monthEvents.filter((event) => event.origin === origin).reduce((sum, event) => sum + unitValue(event, unit), 0),
  })).sort((left, right) => right.total - left.total);
  const sessions = [...new Set(monthEvents.map((event) => event.sessionId))];
  return { monthEvents, days, daily, slots, total, peakDay, peakSlot, topSlots, cumulative, originTotals, measured: measuredEvents.length, missing: monthEvents.length - measuredEvents.length, median: occupiedMedian, sessions };
}

function systemView(state) {
  const metrics = state?.metrics || {};
  const system = metrics.system || {};
  const ollama = metrics.ollama || {};
  const server = metrics.server || {};
  const requests = metrics.requests || {};
  const cpu = Number.isFinite(system.cpuUsed) ? system.cpuUsed : 0;
  const memory = Number.isFinite(system.memoryFree) ? 100 - system.memoryFree : 0;
  const swap = system.swapTotalMB ? (system.swapUsedMB / system.swapTotalMB) * 100 : 0;
  const loadRatio = system.logicalCores && system.load?.[0] != null ? system.load[0] / system.logicalCores : 0;
  const flags = [cpu >= 85, memory >= 90, loadRatio >= 1, swap >= 70];
  const severity = flags.some(Boolean) ? "pressure" : cpu >= 65 || memory >= 78 || loadRatio >= .75 ? "busy" : "clear";
  const model = ollama.models?.[0];
  return {
    cpu, memory, swap, loadRatio, severity,
    online: Boolean(server.online),
    version: server.version || "—",
    cores: system.cores || [],
    coreCount: system.logicalCores || system.cores?.length || 0,
    ollamaCpu: Number.isFinite(ollama.cpu) ? ollama.cpu : 0,
    ollamaRam: Number.isFinite(ollama.rssGB) ? ollama.rssGB : 0,
    model: model?.name || "No local model resident",
    modelSize: model?.size || "—",
    processor: model?.processor || "—",
    context: model?.context || null,
    active: requests.active ?? state?.active?.length ?? 0,
    total: requests.total ?? state?.counters?.total ?? 0,
    errors: requests.errors ?? state?.counters?.errors ?? 0,
  };
}

function commonHeader(model, concept, subtitle) {
  const { view, unit, month } = model;
  const capability = model.capabilities[unit];
  return `<header class="mux-head">
    <div class="mux-brand"><span>SAXJAX / EXPERIMENT ${model.variant}</span><h1>${concept}</h1><p>${subtitle}</p></div>
    <div class="mux-period">
      <label>Period<select data-action="month">${model.months.map((item) => `<option value="${item}" ${item === month ? "selected" : ""}>${formatMonth(item)}</option>`).join("")}</select></label>
      <div class="mux-unit" aria-label="Usage unit">${[["tokens", "Tokens"], ["credits", "Provider units"], ["dollars", "Money"]].map(([key, label]) => `<button data-action="unit" data-unit="${key}" class="${unit === key ? "is-active" : ""}" ${model.capabilities[key].available ? "" : `disabled title="${escapeHtml(model.capabilities[key].note)}"`}>${label}</button>`).join("")}</div>
    </div>
    <div class="mux-total"><span>${formatMonth(month)} total</span><strong>${capability.available ? formatLabeledValue(view.total, unit) : `${unitLabel(unit)} unavailable`}</strong><small>${view.measured.toLocaleString()} of ${view.monthEvents.length.toLocaleString()} requests measured · ${escapeHtml(capability.confidence)}</small>${powerSwitch(model)}</div>
  </header>`;
}

function powerSwitch(model) {
  const online = model.system.online;
  return `<button class="mux-power ${online ? "is-online" : ""}" data-action="ollama-power" role="switch" aria-checked="${online}" ${model.powerPending ? "disabled aria-busy=\"true\"" : ""}>
    <i><em></em></i><span><b>${model.powerPending ? (online ? "Stopping…" : "Starting…") : online ? "Ollama online" : "Ollama offline"}</b><small>${model.powerError ? escapeHtml(model.powerError) : "Local service power"}</small></span>
  </button>`;
}

function selectOptions(values, current, labels = {}) {
  return `<option value="all">All</option>${values.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(labels[value] || value)}</option>`).join("")}`;
}

function controlDeck(model) {
  const activeFilters = [model.filters.provider, model.filters.origin, model.filters.model].filter((value) => value !== "all").length + (model.filters.search ? 1 : 0);
  const planningVariant = ["F", "H", "I"].includes(model.variant);
  const referenceControl = planningVariant
    ? `<label class="mux-reference-select">Reference month<select data-action="reference-select"><option value="">No comparison</option>${model.months.filter((item) => item !== model.month).map((item) => `<option value="${item}" ${model.referenceMonth === item ? "selected" : ""}>${formatMonth(item)}</option>`).join("")}</select></label>`
    : `<div><span>Reference month</span>${model.months.filter((item) => item !== model.month).map((item) => `<button data-action="reference" data-month="${item}" class="${model.referenceMonth === item ? "is-active" : ""}">${formatMonth(item, true)}</button>`).join("")}</div>`;
  const compactSummary = [
    `${model.filteredEvents.length.toLocaleString()} events`,
    activeFilters ? `${activeFilters} filter${activeFilters === 1 ? "" : "s"}` : "all sources",
    model.referenceMonth ? `vs ${formatMonth(model.referenceMonth, true)}` : `${model.zoom} view`,
  ].join(" · ");
  return `<section class="mux-controls ${model.controlsOpen ? "is-open" : ""}" aria-label="Timeline controls">
    <button class="mux-control-disclosure" data-action="controls-toggle" aria-expanded="${model.controlsOpen}"><span>Investigation controls</span><strong>${escapeHtml(compactSummary)}</strong><b>${model.controlsOpen ? "Close ↑" : "Open ↓"}</b></button>
    <div class="mux-control-body"><div class="mux-filters">
      <label>Provider<select data-action="filter" data-filter="provider">${selectOptions(model.options.providers, model.filters.provider, model.options.providerLabels)}</select></label>
      <label>Source<select data-action="filter" data-filter="origin">${selectOptions(model.options.origins, model.filters.origin, ORIGIN_LABELS)}</select></label>
      <label>Model<select data-action="filter" data-filter="model">${selectOptions(model.options.models, model.filters.model)}</select></label>
      <label class="mux-search">Prompt or session<input data-action="search" value="${escapeHtml(model.filters.search)}" placeholder="Search locally captured evidence" /></label>
    </div>
    <div class="mux-control-row">
      ${referenceControl}
      <div><span>Rank spikes by</span>${[["value", "Total"], ["jump", "% jump"], ["unusual", "Unusual for time"]].map(([key, label]) => `<button data-action="anomaly" data-mode="${key}" class="${model.anomalyMode === key ? "is-active" : ""}">${label}</button>`).join("")}<label class="mux-threshold">Minimum <input data-action="threshold" type="number" min="0" step="1" value="${model.threshold || ""}" placeholder="0" /></label></div>
      <div><span>Inspection scale</span>${[["month", "Month"], ["day", "Day"], ["slot", "30 min"], ["session", "Session"]].map(([key, label]) => `<button data-action="zoom" data-zoom="${key}" class="${model.zoom === key ? "is-active" : ""}" ${key === "session" && !model.selectedSessionId ? "disabled" : ""}>${label}</button>`).join("")}</div>
      <div><span>Table date/time</span>${[["desc", "Newest first ↓"], ["asc", "Oldest first ↑"]].map(([key, label]) => `<button data-action="sort" data-sort="${key}" class="${model.sortDirection === key ? "is-active" : ""}" aria-pressed="${model.sortDirection === key}">${label}</button>`).join("")}</div>
    </div>
    <p class="mux-filter-summary">${model.filteredEvents.length.toLocaleString()} matching events · ${model.view.sessions.length.toLocaleString()} sessions · ${model.referenceMonth ? `locked comparison against ${formatMonth(model.referenceMonth)}` : "adaptive scale"} · URL preserves this investigation</p>
    </div></section>`;
}

function systemStrip(model, compact = false) {
  const system = model.system;
  const metric = (label, value, percent, live) => `<div class="mux-vital"><span>${label}</span><b data-live="${live}">${value}</b><i><em data-live-bar="${live}" style="--fill:${Math.max(0, Math.min(100, percent))}%"></em></i></div>`;
  return `<section class="mux-system-strip ${compact ? "is-compact" : ""}" data-severity="${system.severity}">
    <div class="mux-system-verdict"><i></i><span>Machine state</span><strong data-live="verdict">${system.severity === "clear" ? "HEADROOM" : system.severity === "busy" ? "BUSY" : "PRESSURE"}</strong><small data-live="server">Ollama ${system.online ? "online" : "offline"}</small></div>
    ${metric("CPU", `${Math.round(system.cpu)}%`, system.cpu, "cpu")}
    ${metric("Unified memory", `${Math.round(system.memory)}%`, system.memory, "memory")}
    ${metric("Scheduler", `${Math.round(system.loadRatio * 100)}%`, system.loadRatio * 100, "load")}
    ${metric("Ollama CPU", `${Math.round(system.ollamaCpu)}%`, system.ollamaCpu, "ollamaCpu")}
    <div class="mux-model"><span>Resident model</span><b data-live="model">${escapeHtml(system.model)}</b><small data-live="modelMeta">${escapeHtml(system.modelSize)} · ${escapeHtml(system.processor)}</small></div>
  </section>`;
}

function copilotNumber(value, suffix = "") {
  return Number.isFinite(value) ? `${value.toLocaleString(undefined, { maximumFractionDigits: suffix ? 1 : 0 })}${suffix}` : "—";
}

function burnDecisionPanel(model, treatment) {
  const usage = model.copilot || {};
  const forecast = usage.forecast || {};
  const velocity = Number(forecast.creditsPerDay);
  const factor = Number(forecast.sustainableParallelFactor);
  const budget = Number(usage.monthlyBudgetUsd);
  const spent = Number(usage.estimatedCost);
  const hasBudget = Number.isFinite(budget) && budget > 0;
  const hasVelocity = Number.isFinite(velocity) && velocity > 0;
  const hasFactor = hasBudget && Number.isFinite(factor);
  const state = !hasBudget ? "unconfigured" : !hasVelocity ? "quiet" : factor < .9 ? "over" : factor > 1.15 ? "under" : "aligned";
  const stateLabel = state === "over" ? "Burning too fast" : state === "under" ? "Capacity available" : state === "aligned" ? "On a safe pace" : state === "quiet" ? "No recent paid burn" : "Set a budget target";
  const targetVelocity = hasFactor ? Math.max(0, velocity * factor) : null;
  const pacePercent = hasFactor ? Math.min(180, (1 / Math.max(.01, factor)) * 100) : 0;
  const targetPercent = hasFactor ? 100 : 0;
  const projection = Number.isFinite(forecast.projectedMonthCredits) ? forecast.projectedMonthCredits : null;
  const price = Number.isFinite(usage.tokenPriceUsdPerMillion) ? `$${usage.tokenPriceUsdPerMillion.toLocaleString()}/1M` : "Per-model rates";
  const action = state === "over"
    ? `Reduce paid Copilot work to about ${Math.max(0, factor).toFixed(1)}× today’s pace. Move suitable work to Ollama, use a lower-cost model, or shrink repeated context.`
    : state === "under"
      ? `You can raise paid velocity to about ${factor.toFixed(1)}× while preserving the current budget trajectory. Add parallel work gradually and watch the projection.`
      : state === "aligned"
        ? "Hold near the current paid velocity. Trade parallel work, model price, and context size without pushing the target marker into the red."
        : state === "quiet"
          ? "The budget has no recent paid velocity to extrapolate. Start a paid session to establish a useful pace signal."
          : "Set a monthly budget first. Token price is an estimate input—not a throttle—while model choice, context size, and paid parallelism change real burn.";
  return `<section class="mux-burn-decision mux-burn-${treatment}" data-burn-state="${state}" style="--pace:${pacePercent}%;--target:${targetPercent}%">
    <header><div><span>PRIMARY DECISION / PAID TOKEN VELOCITY</span><h3>${stateLabel}</h3></div><strong>${hasFactor ? `${factor.toFixed(1)}×` : "—"}<small>${hasFactor ? "safe/current pace" : "pace ratio"}</small></strong></header>
    <div class="mux-burn-instrument" aria-label="Current burn pace compared with sustainable budget pace"><i class="mux-burn-safe"></i><i class="mux-burn-current"></i><b></b><em></em><span>Current ${hasVelocity ? `≈${velocity.toFixed(1)} credits/day` : "—"}</span><span>Safe target ${Number.isFinite(targetVelocity) ? `≈${targetVelocity.toFixed(1)} credits/day` : "—"}</span></div>
    <div class="mux-burn-readouts"><div><span>Month projection</span><b>${projection == null ? "—" : `≈${projection.toFixed(0)} credits`}</b></div><div><span>Budget runway</span><b>${Number.isFinite(forecast.daysUntilExhausted) ? `≈${Math.max(0, forecast.daysUntilExhausted).toFixed(1)} days` : "—"}</b></div><div><span>Budget position</span><b>${hasBudget ? `${Number.isFinite(spent) ? `≈$${spent.toFixed(2)}` : "—"} / $${budget.toFixed(2)}` : "Not set"}</b></div><div><span>Token price model</span><b>${escapeHtml(price)}</b></div></div>
    <p><b>How to tune it:</b> ${escapeHtml(action)}</p>
  </section>`;
}

function copilotAccountPanel(model, treatment = "ledger") {
  const usage = model.copilot || {};
  const forecast = usage.forecast || {};
  const estimated = Boolean(usage.usageEstimate || usage.status === "estimated");
  const source = usage.status === "ready"
    ? usage.scope === "organization"
      ? `GitHub billing API · organization ${usage.owner || "—"} · user ${usage.user || "—"}`
      : `GitHub billing API · personal account ${usage.user || usage.owner || "—"}`
    : usage.status === "estimated"
      ? "Local captured Copilot requests · GitHub billing unavailable"
      : "Not available until GitHub billing is configured";
  const updated = usage.updatedAt ? new Date(usage.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
  const budget = Number.isFinite(usage.monthlyBudgetUsd) ? `$${usage.monthlyBudgetUsd.toFixed(2)}` : "Not set";
  const budgetValue = Number.isFinite(usage.estimatedCost) ? `$${usage.estimatedCost.toFixed(2)}` : "—";
  const costLabel = estimated ? "estimated" : "billed";
  const creditValue = Number.isFinite(usage.usedCredits) ? `${estimated ? "≈" : ""}${copilotNumber(usage.usedCredits)}` : "—";
  const form = (label, placeholder, note) => `<div class="mux-copilot-form"><label>${label}<div><span>$</span><input placeholder="${placeholder}" aria-label="${label}" /><button type="button">Save</button></div><small>${note}</small></label></div>`;
  const inputPrefix = usage.observedInputTokensEstimated ? "≈" : "";
  const outputPrefix = usage.observedOutputTokensEstimated ? "≈" : "";
  return `<section class="mux-copilot-overview mux-copilot-${treatment}" aria-label="GitHub Copilot account details">
    <header class="mux-copilot-head"><div><span>PAID ACCOUNT / THROUGHPUT</span><h2>GitHub Copilot</h2><p>${escapeHtml(source)}</p></div><div class="mux-copilot-total"><strong>${creditValue}</strong><span>AI credits · ${estimated ? "local estimate" : escapeHtml(usage.period || "current period")}</span><small>${estimated ? "Not the GitHub account total" : "Authoritative billing value"}</small></div></header>
    ${burnDecisionPanel(model, treatment)}
    <div class="mux-copilot-meta"><span><b>${estimated ? "≈" : ""}${Number.isFinite(usage.estimatedCost) ? `$${usage.estimatedCost.toFixed(2)}` : "—"}</b> ${costLabel}</span><span><b>${updated}</b> updated</span><span><b>${escapeHtml(usage.user || usage.owner || "—")}</b> account identity</span></div>
    <div class="mux-copilot-token-grid"><div><strong>PAID · GITHUB COPILOT</strong><b>${inputPrefix}${copilotNumber(usage.observedInputTokens, "")}</b><span>input tokens${usage.observedInputTokensEstimated ? " · estimated" : ""}</span><b>${outputPrefix}${copilotNumber(usage.observedOutputTokens, "")}</b><span>output tokens${usage.observedOutputTokensEstimated ? " · estimated" : ""}</span></div><div class="mux-copilot-local"><strong>LOCAL / FREE · OLLAMA</strong><b>${copilotNumber(usage.ollamaInputTokens)}</b><span>input tokens</span><b>${copilotNumber(usage.ollamaOutputTokens)}</b><span>output tokens</span></div></div>
    <p class="mux-copilot-explanation">${escapeHtml(usage.detail || (estimated ? "GitHub billing is unavailable; showing a local token-priced estimate." : "GitHub billing is the source for this credit total."))} ${estimated ? "This number is an estimate, not the GitHub account total." : ""}</p>
    <div class="mux-copilot-forecast"><header><span>${estimated ? "LOCAL VELOCITY / SCENARIO" : "GITHUB BASELINE + LOCAL VELOCITY"}</span><b>${forecast.requestCount || 0} locally observed requests</b></header><div><span>Velocity<b>≈${Number.isFinite(forecast.creditsPerDay) ? forecast.creditsPerDay.toFixed(1) : "—"} credits/day</b></span><span>Month projection<b>≈${Number.isFinite(forecast.projectedMonthCredits) ? forecast.projectedMonthCredits.toFixed(0) : "—"} credits</b></span><span>Budget runway<b>${Number.isFinite(forecast.daysUntilExhausted) ? `≈${forecast.daysUntilExhausted.toFixed(1)} days` : "Set a budget"}</b></span><span>Parallel capacity<b>${Number.isFinite(forecast.sustainableParallelFactor) ? `Up to ≈${forecast.sustainableParallelFactor.toFixed(1)}× velocity` : "Set a budget"}</b></span></div><small>${escapeHtml(estimated ? "Billing and velocity are locally estimated because GitHub usage is unavailable." : "Runway starts from GitHub's authoritative billed spend; velocity comes from local Copilot traffic.")} ${forecast.estimatedRecords ? `${forecast.estimatedRecords} requests use estimated tokens or conservative model pricing.` : ""} Ollama tokens are excluded. Parallel work is a paid Copilot burn-rate scenario, not a concurrency guarantee.</small></div>
    <div class="mux-copilot-settings">${form("Monthly budget (USD)", budget === "Not set" ? "200.00" : budget.replace("$", ""), "Stored only on this Mac. Enter 0 to remove.")}${form("Custom Copilot token price (USD / 1M tokens)", "Use model rates", "Overrides pricing for local paid-Copilot velocity estimates only. Enter 0 to use model rates.")}<div class="mux-copilot-links"><a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noreferrer">Review token status</a><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Create replacement</a></div></div>
    <footer class="mux-copilot-policy"><span>CAPTURE POLICY</span><p>Full Ollama and Copilot content is copied into private local monitor files until you choose Clear view.</p></footer>
  </section>`;
}

function throughputPanel(model, compact = false, sourceVariant = model.variant) {
  const system = model.system;
  const requestTotal = Math.max(0, system.total);
  const activeShare = requestTotal ? Math.min(100, (system.active / requestTotal) * 100) : 0;
  const errorShare = requestTotal ? Math.min(100, (system.errors / requestTotal) * 100) : 0;
  return `<section class="mux-throughput ${compact ? "is-compact" : ""}" aria-label="Throughput">
    <header><div><span>01 / Burn control & throughput</span><h2>Am I using the paid budget at the right speed?</h2></div><small>Velocity first · live gateway activity and evidence below</small></header>
    <div class="mux-throughput-counters">
      <div><b>${system.active.toLocaleString()}</b><span>Active</span><i><em style="--fill:${activeShare}%"></em></i></div>
      <div><b>${system.total.toLocaleString()}</b><span>Total observed</span><i><em style="--fill:${requestTotal ? 100 : 0}%"></em></i></div>
      <div><b>${system.errors.toLocaleString()}</b><span>Errors</span><i><em class="is-error" style="--fill:${errorShare}%"></em></i></div>
    </div>
    <div class="mux-throughput-facts"><span>Gateway <b>LOCAL :11435</b></span><span>Ollama <b>${system.online ? "ONLINE" : "OFFLINE"}</b></span><span>Host <b>${system.coreCount.toLocaleString()} cores · ${Math.round(system.loadRatio * 100)}% load</b></span><span>Resident <b>${escapeHtml(system.model)}</b></span></div>
    ${copilotAccountPanel(model, sourceVariant === "A0" ? "classic" : sourceVariant === "A" ? "flight" : sourceVariant === "B" ? "seismograph" : sourceVariant === "C" ? "control" : sourceVariant === "D" ? "contact" : sourceVariant === "E" ? "ledger" : "overview")}
  </section>`;
}

function legend(model) {
  return `<div class="mux-legend">${model.view.originTotals.map(({ origin }) => `<span><i style="--swatch:${ORIGIN_COLORS[origin] || ORIGIN_COLORS.other}"></i>${escapeHtml(ORIGIN_LABELS[origin] || origin)}</span>`).join("")}</div>`;
}

function truthPanel(model) {
  const capabilities = ["tokens", "credits", "dollars"].map((unit) => [unit, model.capabilities[unit]]).map(([unit, item]) => `<div><span>${unit === "credits" ? "Provider units" : unit}</span><b>${item.available ? item.confidence : "Unavailable"}</b><small>${escapeHtml(item.note)}</small></div>`).join("");
  return `<section class="mux-truth"><header><span>Evidence & provider capability</span><strong>${model.view.missing ? `${model.view.missing.toLocaleString()} missing measurements` : "Complete for selected unit"}</strong></header><div>${capabilities}<div><span>Billing meter reads</span><b>${model.billingReads ? "Supported" : "Not supplied"}</b><small>${model.billingReads ? "Provider can supply before/after meter observations." : "This profile supplies completion records, not account-meter snapshots."}</small></div><div><span>Evidence</span><b>Client record · durable identity</b><small>Unknown measurements are striped and excluded from totals; they are never treated as measured zero.</small></div></div></section>`;
}

function dailyChart(model, height = 240) {
  const { daily } = model.view;
  const referenceDaily = model.referenceView?.daily || [];
  const width = 1040;
  const left = 44;
  const plotWidth = width - left - 10;
  const bottom = height - 28;
  const peak = Math.max(1, ...daily.map((day) => day.total), ...referenceDaily.map((day) => day.total));
  const column = plotWidth / Math.max(1, daily.length);
  return `<svg class="mux-chart mux-daily-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily usage. Select a day to inspect its time slots.">
    <g class="mux-grid"><line x1="${left}" y1="12" x2="${width - 10}" y2="12"/><line x1="${left}" y1="${(bottom + 12) / 2}" x2="${width - 10}" y2="${(bottom + 12) / 2}"/><line x1="${left}" y1="${bottom}" x2="${width - 10}" y2="${bottom}"/></g>
    <text x="2" y="18">PEAK · ${escapeHtml(formatLabeledValue(peak, model.unit, true))}</text><text x="2" y="${bottom + 4}">BASE · 0 ${escapeHtml(unitLabel(model.unit))}</text>
    ${daily.map((day, index) => {
      const x = left + index * column + 1;
      let used = 0;
      const referenceHeight = ((referenceDaily[index]?.total || 0) / peak) * (bottom - 12);
      const shadow = referenceHeight ? `<rect class="mux-reference-mark" x="${x - 1}" y="${bottom - referenceHeight}" width="${Math.max(3, column - 1)}" height="${referenceHeight}"/>` : "";
      const pieces = model.view.originTotals.map(({ origin }) => {
        const value = day.byOrigin[origin] || 0;
        const piece = (value / peak) * (bottom - 12);
        used += piece;
        return piece ? `<rect x="${x}" y="${bottom - used}" width="${Math.max(2, column - 3)}" height="${piece}" fill="${ORIGIN_COLORS[origin] || ORIGIN_COLORS.other}"/>` : "";
      }).join("");
      const missing = day.missing ? `<line class="mux-missing-mark" x1="${x}" x2="${x + Math.max(2, column - 3)}" y1="${bottom - used - 4}" y2="${bottom - used - 4}"/>` : "";
      return `${shadow}${pieces}${missing}<rect class="mux-hit ${day.day === model.selectedDay ? "is-selected" : ""}" data-action="day" data-day="${day.day}" x="${x - 1}" y="10" width="${Math.max(4, column - 1)}" height="${bottom - 8}"/><text x="${x + column / 2 - 4}" y="${height - 7}">${index + 1}</text>`;
    }).join("")}
  </svg>`;
}

function slotChart(model, day = model.selectedDay, height = 220, monthly = false) {
  const source = monthly ? model.view.slots : model.view.slots.filter((slot) => slot.day === day);
  const referenceSource = model.referenceView ? (monthly ? model.referenceView.slots : model.referenceView.slots.filter((slot) => slot.day.slice(-2) === day.slice(-2))) : [];
  const width = 1120;
  const left = 48;
  const bottom = height - 28;
  const plotWidth = width - left - 12;
  const column = plotWidth / Math.max(1, source.length);
  const peak = Math.max(1, ...source.map((slot) => slot.total), ...referenceSource.map((slot) => slot.total));
  return `<svg class="mux-chart mux-slot-chart" tabindex="0" data-timeline-keyboard="true" viewBox="0 0 ${width} ${height}" role="img" aria-label="${monthly ? "Month" : "Selected day"} usage in 30-minute slots. Use arrow keys to move the selection.">
    <g class="mux-grid"><line x1="${left}" y1="12" x2="${width - 12}" y2="12"/><line x1="${left}" y1="${(bottom + 12) / 2}" x2="${width - 12}" y2="${(bottom + 12) / 2}"/><line x1="${left}" y1="${bottom}" x2="${width - 12}" y2="${bottom}"/></g>
    <text x="1" y="18">PEAK · ${escapeHtml(formatLabeledValue(peak, model.unit, true))}</text><text x="1" y="${bottom + 4}">BASE · 0 ${escapeHtml(unitLabel(model.unit))}</text>
    ${source.map((slot, index) => {
      const x = left + index * column;
      let used = 0;
      const referenceHeight = ((referenceSource[index]?.total || 0) / peak) * (bottom - 12);
      const shadow = referenceHeight ? `<rect class="mux-reference-mark" x="${x}" y="${bottom - referenceHeight}" width="${Math.max(.8, column)}" height="${referenceHeight}"/>` : "";
      const pieces = model.view.originTotals.map(({ origin }) => {
        const value = slot.byOrigin[origin] || 0;
        const piece = (value / peak) * (bottom - 12);
        used += piece;
        return piece ? `<rect x="${x}" y="${bottom - used}" width="${Math.max(.7, column - (monthly ? .15 : 2))}" height="${piece}" fill="${ORIGIN_COLORS[origin] || ORIGIN_COLORS.other}"/>` : "";
      }).join("");
      const missing = slot.missing ? `<line class="mux-missing-mark" x1="${x}" x2="${x + Math.max(.7, column)}" y1="${bottom - used - 3}" y2="${bottom - used - 3}"/>` : "";
      return `${shadow}${pieces}${missing}<rect class="mux-hit ${slot.id === model.selectedSlotId ? "is-selected" : ""}" data-action="slot" data-slot="${slot.id}" x="${x}" y="10" width="${Math.max(.7, column)}" height="${bottom - 8}"/>`;
    }).join("")}
    ${monthly ? model.view.days.map((date, index) => index % 3 === 0 || index === model.view.days.length - 1 ? `<text x="${left + index * 48 * column}" y="${height - 7}">${index + 1}</text>` : "").join("") : `<text x="${left}" y="${height - 7}">00</text><text x="${left + plotWidth / 2 - 8}" y="${height - 7}">12</text><text x="${width - 30}" y="${height - 7}">24</text>`}
  </svg>`;
}

function dominantOrigin(item) {
  return Object.entries(item.byOrigin || {}).sort((left, right) => right[1] - left[1])[0]?.[0] || "other";
}

// Each experimental direction owns a visual grammar. These renderers are kept
// separate on purpose so the composition studio can borrow an instrument
// without collapsing the prototypes back into one generic chart component.
function flightPathChart(model, height = 280, monthly = true) {
  const source = monthly ? model.view.daily : model.view.slots.filter((slot) => slot.day === model.selectedDay);
  const referenceSource = monthly ? model.referenceView?.daily || [] : [];
  const width = 1060;
  const left = 52;
  const right = 18;
  const top = 20;
  const bottom = height - 34;
  const span = width - left - right;
  const peak = Math.max(1, ...source.map((item) => item.total), ...referenceSource.map((item) => item.total));
  const step = span / Math.max(1, source.length - 1);
  const point = (item, index) => ({
    x: left + index * step,
    y: bottom - (item.total / peak) * (bottom - top),
  });
  const points = source.map(point);
  const path = points.map(({ x, y }, index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = points.length ? `${path} L${points.at(-1).x.toFixed(2)} ${bottom} L${points[0].x.toFixed(2)} ${bottom} Z` : "";
  const referencePath = referenceSource.map(point).map(({ x, y }, index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const knots = source.map((item, index) => {
    const { x, y } = points[index];
    const selected = monthly ? item.day === model.selectedDay : item.id === model.selectedSlotId;
    const action = monthly ? "day" : "slot";
    const key = monthly ? item.day : item.id;
    const attribute = monthly ? "data-day" : "data-slot";
    const radius = Math.max(2.5, Math.min(9, 2.5 + Math.sqrt(item.events.length || 0) * 1.7));
    return `<g class="mux-flight-knot ${selected ? "is-selected" : ""}" data-action="${action}" ${attribute}="${key}"><line x1="${x}" y1="${y}" x2="${x}" y2="${bottom}"/><circle cx="${x}" cy="${y}" r="${radius}" fill="${ORIGIN_COLORS[dominantOrigin(item)] || ORIGIN_COLORS.other}"/><title>${monthly ? item.day : clock(item.bucket * 30)} · ${formatLabeledValue(item.total, model.unit)} · ${item.events.length} recorded requests</title></g>`;
  }).join("");
  const labels = monthly
    ? source.map((item, index) => index % 3 === 0 || index === source.length - 1 ? `<text x="${left + index * step - 4}" y="${height - 8}">${item.day.slice(-2)}</text>` : "").join("")
    : `<text x="${left}" y="${height - 8}">00</text><text x="${left + span / 2 - 8}" y="${height - 8}">12</text><text x="${width - right - 15}" y="${height - 8}">24</text>`;
  return `<svg class="mux-chart mux-flight-chart" tabindex="0" data-timeline-keyboard="true" viewBox="0 0 ${width} ${height}" role="img" aria-label="Flight path of usage altitude. Knots select a ${monthly ? "day" : "30-minute interval"}.">
    <defs><linearGradient id="mux-flight-wash-${monthly ? "month" : "day"}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".18"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <g class="mux-flight-levels"><line x1="${left}" y1="${top}" x2="${width - right}" y2="${top}"/><line x1="${left}" y1="${(top + bottom) / 2}" x2="${width - right}" y2="${(top + bottom) / 2}"/><line x1="${left}" y1="${bottom}" x2="${width - right}" y2="${bottom}"/></g>
    ${referencePath ? `<path class="mux-flight-reference" d="${referencePath}"/>` : ""}
    ${area ? `<path class="mux-flight-area" d="${area}" fill="url(#mux-flight-wash-${monthly ? "month" : "day"})"/><path class="mux-flight-line" d="${path}"/>` : ""}${knots}${labels}
    <text x="2" y="${top + 4}">PEAK · ${escapeHtml(formatLabeledValue(peak, model.unit, true))}</text><text x="2" y="${bottom + 4}">BASE · 0 ${escapeHtml(unitLabel(model.unit))}</text>
  </svg>`;
}

function seismographChart(model, height = 330) {
  const source = model.zoom === "month" ? model.view.slots : model.view.slots.filter((slot) => slot.day === model.selectedDay);
  const width = 1060;
  const left = 48;
  const right = 12;
  const center = height / 2;
  const span = width - left - right;
  const peak = Math.max(1, ...source.map((slot) => slot.total));
  const step = span / Math.max(1, source.length - 1);
  const trace = source.map((slot, index) => {
    const x = left + index * step;
    const amplitude = (slot.total / peak) * (height * .36);
    const direction = index % 2 ? 1 : -1;
    return `${index ? "L" : "M"}${x.toFixed(2)} ${(center + direction * amplitude).toFixed(2)}`;
  }).join(" ");
  const springs = source.map((slot, index) => {
    if (!slot.total) return "";
    const x = left + index * step;
    const amplitude = (slot.total / peak) * (height * .36);
    const selected = slot.id === model.selectedSlotId;
    return `<g class="mux-seismic-spring ${selected ? "is-selected" : ""}" data-action="slot" data-slot="${slot.id}"><line x1="${x}" y1="${center - amplitude}" x2="${x}" y2="${center + amplitude}"/><circle cx="${x}" cy="${center}" r="${selected ? 5 : 2.2}"/><title>${slot.day} ${clock(slot.bucket * 30)} · ${formatLabeledValue(slot.total, model.unit)}</title></g>`;
  }).join("");
  return `<svg class="mux-chart mux-seismograph-chart" tabindex="0" data-timeline-keyboard="true" viewBox="0 0 ${width} ${height}" role="img" aria-label="Seismograph trace. Vertical springs are exact interval contributions.">
    <g class="mux-seismic-grid"><line x1="${left}" y1="${center}" x2="${width - right}" y2="${center}"/><line x1="${left}" y1="${height * .14}" x2="${width - right}" y2="${height * .14}"/><line x1="${left}" y1="${height * .86}" x2="${width - right}" y2="${height * .86}"/></g>
    <path class="mux-seismic-trace" d="${trace}"/>${springs}
    <text x="2" y="${height * .14 + 4}">MAX SHOCK · ${escapeHtml(formatLabeledValue(peak, model.unit, true))}</text><text x="2" y="${center + 4}">REST · 0 ${escapeHtml(unitLabel(model.unit))}</text>
  </svg>`;
}

function orbitChart(model, height = 440) {
  const monthly = model.zoom === "month";
  const source = monthly ? model.view.daily : model.view.slots.filter((slot) => slot.day === model.selectedDay);
  const width = 1080;
  const cx = 540;
  const cy = height / 2;
  const orbit = Math.min(168, height * .37);
  const peak = Math.max(1, ...source.map((item) => item.total));
  const nodes = source.map((item, index) => {
    const angle = -Math.PI / 2 + (index / source.length) * Math.PI * 2;
    const activity = item.total / peak;
    const radius = orbit + (activity - .35) * 46;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const nodeRadius = item.total ? 4 + Math.sqrt(activity) * 12 : 2;
    const action = monthly ? "day" : "slot";
    const attribute = monthly ? "data-day" : "data-slot";
    const key = monthly ? item.day : item.id;
    const selected = monthly ? item.day === model.selectedDay : item.id === model.selectedSlotId;
    return `<g class="mux-orbit-node ${item.total ? "is-live" : ""} ${selected ? "is-selected" : ""}" data-action="${action}" ${attribute}="${key}"><path d="M${cx} ${cy} L${x.toFixed(2)} ${y.toFixed(2)}"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${nodeRadius.toFixed(2)}" fill="${item.total ? ORIGIN_COLORS[dominantOrigin(item)] || ORIGIN_COLORS.other : "currentColor"}"/><title>${monthly ? item.day : clock(item.bucket * 30)} · ${formatLabeledValue(item.total, model.unit)} · ${item.events.length} recorded requests</title></g>`;
  }).join("");
  return `<svg class="mux-chart mux-orbit-chart" tabindex="0" data-timeline-keyboard="true" viewBox="0 0 ${width} ${height}" role="img" aria-label="Orbital usage network. Distance and node size encode usage.">
    <g class="mux-orbit-rings"><circle cx="${cx}" cy="${cy}" r="${orbit - 46}"/><circle cx="${cx}" cy="${cy}" r="${orbit}"/><circle cx="${cx}" cy="${cy}" r="${orbit + 46}"/></g>${nodes}
    <g class="mux-orbit-hub"><circle cx="${cx}" cy="${cy}" r="62"/><circle cx="${cx}" cy="${cy}" r="49"/><text x="${cx}" y="${cy - 15}" text-anchor="middle">${monthly ? formatMonth(model.month, true).toUpperCase() : model.selectedDay}</text><text class="mux-orbit-total" x="${cx}" y="${cy + 7}" text-anchor="middle">${escapeHtml(formatValue(model.view.total, model.unit, true))}</text><text x="${cx}" y="${cy + 23}" text-anchor="middle">${escapeHtml(unitLabel(model.unit).toUpperCase())}</text><text x="${cx}" y="${cy + 38}" text-anchor="middle">${monthly ? `${source.length} DAY NODES` : "48 HALF-HOUR NODES"}</text></g>
    <text x="${cx}" y="20" text-anchor="middle">${monthly ? "01" : "00:00"}</text><text x="${width - 330}" y="${cy + 4}">${monthly ? String(Math.ceil(source.length * .25)).padStart(2, "0") : "06:00"}</text><text x="${cx}" y="${height - 8}" text-anchor="middle">${monthly ? String(Math.ceil(source.length * .5)).padStart(2, "0") : "12:00"}</text><text x="290" y="${cy + 4}" text-anchor="end">${monthly ? String(Math.ceil(source.length * .75)).padStart(2, "0") : "18:00"}</text>
  </svg>`;
}

function bubbleTimeline(model, day = model.selectedDay, height = 190) {
  const source = model.view.slots.filter((slot) => slot.day === day);
  const origins = model.view.originTotals.map(({ origin }) => origin);
  const width = 1040;
  const left = 48;
  const right = 18;
  const peak = Math.max(1, ...source.map((slot) => slot.total));
  const row = (height - 42) / Math.max(1, origins.length);
  const circles = source.flatMap((slot) => Object.entries(slot.byOrigin).filter(([, value]) => value > 0).map(([origin, value]) => {
    const originIndex = Math.max(0, origins.indexOf(origin));
    const x = left + (slot.bucket / 47) * (width - left - right);
    const y = 18 + row * (originIndex + .5);
    const radius = 3 + Math.sqrt(value / peak) * 15;
    return `<circle class="mux-bubble ${slot.id === model.selectedSlotId ? "is-selected" : ""}" data-action="slot" data-slot="${slot.id}" cx="${x}" cy="${y}" r="${radius}" fill="${ORIGIN_COLORS[origin] || ORIGIN_COLORS.other}"><title>${clock(slot.bucket * 30)} · ${ORIGIN_LABELS[origin] || origin} · ${formatLabeledValue(value, model.unit)}</title></circle>`;
  })).join("");
  return `<svg class="mux-chart mux-bubble-chart" tabindex="0" data-timeline-keyboard="true" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bubble constellation by source and time.">
    ${origins.map((origin, index) => `<line x1="${left}" y1="${18 + row * (index + .5)}" x2="${width - right}" y2="${18 + row * (index + .5)}"/><text x="2" y="${22 + row * (index + .5)}">${escapeHtml((ORIGIN_LABELS[origin] || origin).slice(0, 7).toUpperCase())}</text>`).join("")}${circles}
    <text x="${left}" y="${height - 5}">00</text><text x="${left + (width - left - right) / 2 - 7}" y="${height - 5}">12</text><text x="${width - right - 14}" y="${height - 5}">24</text>
  </svg>`;
}

function usageFlowChart(model, height = 320) {
  const candidates = (model.zoom === "month" ? model.view.slots : model.view.slots.filter((slot) => slot.day === model.selectedDay)).filter((slot) => slot.total > 0);
  const slots = [...candidates].sort((left, right) => right.total - left.total).slice(0, 8).sort((left, right) => left.day.localeCompare(right.day) || left.bucket - right.bucket);
  const origins = [...new Set(slots.flatMap((slot) => Object.keys(slot.byOrigin)))];
  const width = 1120;
  const leftX = 120;
  const middleX = 600;
  const sinkX = 1020;
  const top = 30;
  const usable = height - 60;
  const peak = Math.max(1, ...slots.map((slot) => slot.total));
  const selectedTotal = slots.reduce((sum, slot) => sum + slot.total, 0);
  if (!slots.length) return `<div class="mux-flow-empty">No measured flow in this selection.</div>`;
  const originY = new Map(origins.map((origin, index) => [origin, top + usable * ((index + .5) / origins.length)]));
  const slotY = new Map(slots.map((slot, index) => [slot.id, top + usable * ((index + .5) / slots.length)]));
  const links = slots.flatMap((slot) => Object.entries(slot.byOrigin).filter(([, value]) => value > 0).map(([origin, value]) => {
    const y1 = originY.get(origin);
    const y2 = slotY.get(slot.id);
    const thickness = Math.max(1.5, (value / peak) * 22);
    return `<path class="mux-flow-link" d="M${leftX} ${y1} C${leftX + 170} ${y1},${middleX - 170} ${y2},${middleX} ${y2}" stroke="${ORIGIN_COLORS[origin] || ORIGIN_COLORS.other}" stroke-width="${thickness}"/>`;
  })).join("");
  const exits = slots.map((slot) => {
    const y = slotY.get(slot.id);
    return `<path class="mux-flow-exit" d="M${middleX} ${y} C${middleX + 160} ${y},${sinkX - 170} ${height / 2},${sinkX} ${height / 2}" stroke-width="${Math.max(2, slot.total / peak * 24)}"/>`;
  }).join("");
  return `<svg class="mux-chart mux-flow-chart" tabindex="0" data-timeline-keyboard="true" viewBox="0 0 ${width} ${height}" role="img" aria-label="Flow from source through expensive intervals into the selected total.">
    ${links}${exits}
    ${origins.map((origin) => `<g class="mux-flow-origin"><circle cx="${leftX}" cy="${originY.get(origin)}" r="8" fill="${ORIGIN_COLORS[origin] || ORIGIN_COLORS.other}"/><text x="${leftX - 15}" y="${originY.get(origin) + 4}" text-anchor="end">${escapeHtml(ORIGIN_LABELS[origin] || origin)}</text></g>`).join("")}
    ${slots.map((slot) => `<g class="mux-flow-incident ${slot.id === model.selectedSlotId ? "is-selected" : ""}" data-action="slot" data-slot="${slot.id}"><rect x="${middleX - 8}" y="${slotY.get(slot.id) - 8}" width="16" height="16"/><text x="${middleX + 17}" y="${slotY.get(slot.id) + 4}">${slot.day.slice(-2)} · ${clock(slot.bucket * 30)} · ${escapeHtml(formatLabeledValue(slot.total, model.unit, true))}</text><title>${slot.events.length} contributing requests</title></g>`).join("")}
    <g class="mux-flow-sink"><circle cx="${sinkX}" cy="${height / 2}" r="46"/><text x="${sinkX}" y="${height / 2 - 12}" text-anchor="middle">VISIBLE FLOW</text><text x="${sinkX}" y="${height / 2 + 8}" text-anchor="middle">${escapeHtml(formatValue(selectedTotal, model.unit, true))}</text><text x="${sinkX}" y="${height / 2 + 23}" text-anchor="middle">${escapeHtml(unitLabel(model.unit).toUpperCase())}</text></g>
  </svg>`;
}

function cumulativeChart(model, height = 240) {
  const values = model.view.cumulative;
  let referenceRunning = 0;
  const referenceByAlignedSlot = new Map((model.referenceView?.slots || []).map((slot) => [`${slot.day.slice(-2)}:${slot.bucket}`, slot.total]));
  const referenceValues = model.referenceView ? model.view.slots.map((slot) => (referenceRunning += referenceByAlignedSlot.get(`${slot.day.slice(-2)}:${slot.bucket}`) || 0)) : [];
  const width = 1060;
  const left = 48;
  const bottom = height - 30;
  const plotWidth = width - left - 12;
  const peak = Math.max(1, values.at(-1) || 0, referenceValues.at(-1) || 0);
  const step = plotWidth / Math.max(1, values.length - 1);
  const path = values.map((value, index) => `${index ? "L" : "M"} ${left + index * step} ${bottom - (value / peak) * (bottom - 14)}`).join(" ");
  const referenceStep = plotWidth / Math.max(1, referenceValues.length - 1);
  const referencePath = referenceValues.map((value, index) => `${index ? "L" : "M"} ${left + index * referenceStep} ${bottom - (value / peak) * (bottom - 14)}`).join(" ");
  const contributions = model.view.slots.map((slot, index) => slot.total ? `<line data-action="slot" data-slot="${slot.id}" x1="${left + index * step}" y1="${bottom}" x2="${left + index * step}" y2="${bottom - (slot.total / model.view.peakSlot.total) * 42}"/>` : "").join("");
  return `<svg class="mux-chart mux-cumulative" tabindex="0" data-timeline-keyboard="true" viewBox="0 0 ${width} ${height}" role="img" aria-label="Accumulated usage with each contributing time slot visible.">
    ${referencePath ? `<path class="mux-cumulative-reference" d="${referencePath}"/>` : ""}<path class="mux-cumulative-line" d="${path}"/><g class="mux-contribution-sticks">${contributions}</g>
    <text x="2" y="18">MONTH TOTAL · ${escapeHtml(formatLabeledValue(peak, model.unit, true))}</text><text x="2" y="${bottom + 4}">START · 0 ${escapeHtml(unitLabel(model.unit))}</text>
  </svg>`;
}

function incidentList(model, limit = 7) {
  const score = (slot) => model.anomalyMode === "jump" ? `${Math.round(slot.jumpPercent).toLocaleString()}% vs previous slot` : model.anomalyMode === "unusual" ? `${slot.multiple.toFixed(1)}× normal for this time` : `${slot.multiple.toFixed(1)}× occupied-slot median`;
  const slots = sortSlotsByDateTime(model.view.topSlots.slice(0, limit), model.sortDirection);
  return `<ol class="mux-incidents" aria-label="Top usage intervals, ${sortLabel(model.sortDirection).toLowerCase()}">${slots.map((slot) => `<li class="${slot.id === model.selectedSlotId ? "is-selected" : ""}">
    <button data-action="slot" data-slot="${slot.id}"><span>Rank ${String(slot.rank).padStart(2, "0")}</span><time>Day ${slot.day.slice(-2)} · ${clock(slot.bucket * 30)}</time><strong>${formatLabeledValue(slot.total, model.unit)}</strong><small>${slot.events.length} request${slot.events.length === 1 ? "" : "s"} · ${score(slot)}</small></button>
  </li>`).join("")}</ol>`;
}

function evidence(model, limit = 24) {
  const selected = model.view.slots.find((slot) => slot.id === model.selectedSlotId) || model.view.peakSlot;
  const session = model.selectedSessionId ? model.view.monthEvents.filter((event) => event.sessionId === model.selectedSessionId) : null;
  const events = [...(session?.length ? session : selected?.events || [])]
    .sort((left, right) => globalThis.SaxjaxDateTimeSort.compareDateTimes(left, right, model.sortDirection, (event) => event.startedAt));
  const value = events.filter((event) => Number.isFinite(event[model.unit])).reduce((sum, event) => sum + event[model.unit], 0);
  const missing = events.filter((event) => !Number.isFinite(event[model.unit])).length;
  return `<section class="mux-evidence" id="mux-forensics">
    <header><div><span>FORENSICS CASE FILE · ${session?.length ? "SELECTED SESSION" : "SELECTED INTERVAL"}</span><h2>${session?.length ? escapeHtml(model.selectedSessionId) : `${selected?.day || "—"} · ${selected ? `${clock(selected.bucket * 30)}–${clock(selected.bucket * 30 + 30)}` : "—"}`}</h2><p>Open a request in FORENSICS to inspect the actual locally retained machinery: complete input, output, reasoning, tools, and source record—not a résumé.</p></div><strong>${events.length && missing === events.length ? `— ${unitLabel(model.unit)} unavailable` : formatLabeledValue(value, model.unit)}</strong><small>${events.length} contributing requests · ${missing ? `${missing} without ${unitLabel(model.unit)} measurement · ` : "all values measured · "}${sortLabel(model.sortDirection)}</small></header>
    <div class="mux-evidence-list">${events.map((event, index) => {
      const exchange = capturedExchange(model, event);
      const incoming = exchange ? readableCapture(exchange.inputContext, readableCapture(exchange.transformedPrompt, readableCapture(exchange.prompt, event.prompt))) : "";
      const outgoing = exchange ? readableCapture(exchange.response, "") : "";
      const reasoning = exchange ? readableCapture(exchange.thinking, "") : "";
      const canLoadJournal = Boolean(event.captureClient && event.journalSessionId && event.requestId);
      const isSelectedPaper = event.id === model.selectedEvidenceEventId;
      return `<article style="--family:${ORIGIN_COLORS[event.origin] || ORIGIN_COLORS.other}"><details class="mux-evidence-paper" data-event-id="${escapeHtml(event.id)}" data-capture-client="${escapeHtml(event.captureClient || "")}" data-capture-session="${escapeHtml(event.journalSessionId || "")}" data-capture-request="${escapeHtml(event.requestId || "")}" data-paper-preview="${escapeHtml(event.prompt)}" data-inline-capture="${exchange ? "true" : "false"}" ${isSelectedPaper ? "open" : ""}><summary><span>Request ${String(index + 1).padStart(2, "0")}</span><div><b>${escapeHtml(event.model)} · ${escapeHtml(event.originLabel)}</b><p>${escapeHtml(event.prompt)}</p><small>${escapeHtml(event.source)}</small><em>${escapeHtml(event.providerLabel)} · ${escapeHtml(event.evidenceStatus)} ${escapeHtml(event.evidenceSource)} · ${escapeHtml(event.identityStrength)} identity${model.unit === "tokens" && (Number.isFinite(event.inputTokens) || Number.isFinite(event.outputTokens)) ? ` · ${event.inputTokens?.toLocaleString() || "—"} input / ${event.outputTokens?.toLocaleString() || "—"} output` : ""}</em></div><strong>${Number.isFinite(event[model.unit]) ? formatLabeledValue(event[model.unit], model.unit) : `— ${unitLabel(model.unit)} not measured`}</strong><i><span>FORENSICS</span><b>OPEN FORENSICS +</b></i></summary><div class="mux-evidence-sheet" data-loaded="${exchange ? "true" : "false"}"><header><span>FORENSICS · FULL LOCAL CAPTURE · REQUEST ${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(event.requestId || "No request identity")}</b><small data-paper-status>${exchange ? "Actual live capture loaded" : canLoadJournal ? "Open FORENSICS to read the original local journal" : "Only the durable timeline excerpt is available"}</small></header><div class="mux-paper-columns"><section><span>IN / COMPLETE LOCALLY AVAILABLE CONTENT</span><pre data-paper-input>${escapeHtml(incoming || event.prompt)}</pre></section><section><span>OUT / COMPLETE LOCALLY AVAILABLE CONTENT</span><pre data-paper-output>${escapeHtml(outgoing || (canLoadJournal ? "Loading when FORENSICS opens…" : "The complete output is not retained in this timeline record."))}</pre></section><section class="mux-paper-reasoning" ${reasoning ? "" : "hidden"}><span>REASONING / LOCALLY RETAINED</span><pre data-paper-reasoning>${escapeHtml(reasoning)}</pre></section></div><footer><button class="mux-copy-source" data-action="copy-source" data-event="${escapeHtml(event.id)}">Copy source reference</button><span>${escapeHtml(event.source)}</span><button class="mux-close-paper" data-action="close-forensics">CLOSE FORENSICS ↑</button></footer></div></details></article>`;
    }).join("") || `<p class="mux-empty">No measured request started in this interval.</p>`}</div>
  </section>`;
}

function coreRack(model) {
  const cores = model.system.cores;
  return `<div class="mux-core-rack">${cores.map((core) => `<i class="${core.type || ""}" style="--core:${Math.max(1, core.utilization || 0)}%"><span>${escapeHtml(core.label || `C${core.index}`)}</span><b>${Math.round(core.utilization || 0)}%</b></i>`).join("") || `<small>Core samples are arriving…</small>`}</div>`;
}

function sessionLanes(model) {
  const dayEvents = model.view.monthEvents.filter((event) => event.day === model.selectedDay);
  const groups = new Map();
  for (const event of dayEvents) {
    const group = groups.get(event.sessionId) || { id: event.sessionId, events: [], start: event.minute, end: event.minute + event.durationMinutes, total: 0, measured: 0, origin: event.origin, provider: event.providerLabel };
    group.events.push(event);
    group.start = Math.min(group.start, event.minute);
    group.end = Math.max(group.end, event.minute + event.durationMinutes);
    group.total += unitValue(event, model.unit);
    if (Number.isFinite(event[model.unit])) group.measured += 1;
    groups.set(event.sessionId, group);
  }
  const lanes = [...groups.values()].sort((left, right) => globalThis.SaxjaxDateTimeSort.compareValues(left.start, right.start, model.sortDirection) || right.total - left.total);
  return `<section class="mux-sessions"><header><div><span>Parallel session lanes · ${model.selectedDay}</span><h2>Who was running together?</h2></div><strong>${lanes.length} recorded sessions</strong><small>${sortLabel(model.sortDirection)} · Horizontal position is prompt start → final response. Colour is source; height never means concurrency.</small></header><div class="mux-session-scale"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div><div class="mux-session-list">${lanes.map((lane) => `<button data-action="session" data-session="${escapeHtml(lane.id)}" class="${lane.id === model.selectedSessionId ? "is-selected" : ""}"><span><b>${clock(lane.start)}–${clock(lane.end)}</b> ${escapeHtml(lane.provider)} · ${lane.events.length} request${lane.events.length === 1 ? "" : "s"}</span><i><em style="--left:${Math.max(0, lane.start / 1440 * 100)}%;--width:${Math.max(.6, (Math.min(1440, lane.end) - lane.start) / 1440 * 100)}%;--source:${ORIGIN_COLORS[lane.origin] || ORIGIN_COLORS.other}"></em></i><strong>${lane.measured ? formatLabeledValue(lane.total, model.unit) : `— ${unitLabel(model.unit)}`}</strong></button>`).join("") || `<p class="mux-empty">No sessions were recorded on this day.</p>`}</div></section>`;
}

function resourceTrack(label, values, unavailable = false) {
  const peak = Math.max(1, ...values.filter(Number.isFinite));
  return `<div class="mux-resource-row ${unavailable ? "is-unavailable" : ""}"><span>${label}</span><i>${values.map((value) => `<em style="--h:${Number.isFinite(value) ? Math.max(2, value / peak * 100) : 0}%"></em>`).join("")}</i><small>${unavailable ? "not recorded for imported history" : "aligned 30-minute samples"}</small></div>`;
}

function resourceCorrelation(model) {
  const daySlots = model.view.slots.filter((slot) => slot.day === model.selectedDay);
  const samples = model.liveSamples.filter((sample) => localParts(sample.at).day === model.selectedDay);
  const sampleBins = (read) => Array.from({ length: 48 }, (_, bucket) => {
    const matches = samples.filter((sample) => Math.floor(localParts(sample.at).minute / 30) === bucket).map(read).filter(Number.isFinite);
    return matches.length ? matches.reduce((sum, value) => sum + value, 0) / matches.length : null;
  });
  const cpu = sampleBins((sample) => sample.system.cpu);
  const memory = sampleBins((sample) => sample.system.memory);
  const ollamaCpu = sampleBins((sample) => sample.system.ollamaCpu);
  const localUsage = daySlots.map((slot) => slot.events.filter((event) => event.provider === "ollama" || event.origin === "ollama").reduce((sum, event) => sum + unitValue(event, model.unit), 0));
  const throughput = daySlots.map((slot) => slot.events.reduce((sum, event) => sum + (Number.isFinite(event.outputTokens) && event.durationMinutes ? event.outputTokens / (event.durationMinutes * 60) : 0), 0));
  return `<section class="mux-resources"><header><div><span>Aligned resource history · ${model.selectedDay}</span><h2>Was the machine under pressure?</h2></div><strong>${samples.length ? `${samples.length} live samples` : "Historical telemetry unavailable"}</strong><small>Imported usage and system telemetry have separate evidence. Hatched rows are missing, not zero.</small></header>${resourceTrack("Usage", daySlots.map((slot) => slot.total))}${resourceTrack("Parallel sessions", daySlots.map((slot) => slot.concurrent))}${resourceTrack("Local LLM usage", localUsage)}${resourceTrack("Output tok/s", throughput)}${resourceTrack("CPU", cpu, !samples.length)}${resourceTrack("Unified memory", memory, !samples.length)}${resourceTrack("Ollama CPU", ollamaCpu, !samples.length)}<footer>GPU / ANE / memory bandwidth: not supplied by the current host sampler · live samples persist only while this prototype is open.</footer></section>`;
}

function cumulativeNavigator(model) {
  return `<section class="mux-history"><header><div><span>Accumulated ${unitLabel(model.unit)} · same month axis</span><h2>Every contribution remains visible</h2></div><strong>${formatLabeledValue(model.view.total, model.unit)}</strong><small>${model.referenceMonth ? `Shadow = ${formatMonth(model.referenceMonth)}; scale locked.` : "Select a reference month above to lock the scale."}</small></header>${cumulativeChart(model, 180)}</section>`;
}

function analysisDock(model, includeCumulative = true) {
  return `<div class="mux-analysis-dock">${includeCumulative ? cumulativeNavigator(model) : ""}${resourceCorrelation(model)}${sessionLanes(model)}${truthPanel(model)}</div>`;
}

function VariantA(model) {
  return `<div class="mux mux-a">
    ${commonHeader(model, "Flight recorder", "Usage becomes altitude: a continuous route, coloured flight knots, and a zoomed approach path for the selected day.")}
    ${controlDeck(model)}
    ${throughputPanel(model)}
    ${systemStrip(model, true)}
    <main class="mux-a-layout">
      <section class="mux-a-chart"><div class="mux-section-title"><span>01 / ${model.zoom === "month" ? "Cost altitude by day" : `${model.selectedDay} investigation`}</span><h2>Trace the month’s flight path</h2>${legend(model)}</div>${flightPathChart(model, 285, model.zoom === "month")}
        <div class="mux-day-slice"><header><span>${model.selectedDay} · approach path / 30-minute knots</span><strong>Peak interval · ${formatLabeledValue(model.view.slots.filter((slot) => slot.day === model.selectedDay).reduce((peak, slot) => slot.total > peak ? slot.total : peak, 0), model.unit)}</strong></header>${flightPathChart(model, 190, false)}</div>
      </section>
      <aside class="mux-a-index"><span>Flight marks</span><h2>Largest jumps</h2><p>Ranked against the median occupied 30-minute interval.</p>${incidentList(model, 8)}</aside>
      ${evidence(model, 18)}
    </main>
    ${analysisDock(model)}
  </div>`;
}

function VariantB(model) {
  const selected = model.view.slots.find((slot) => slot.id === model.selectedSlotId) || model.view.peakSlot;
  return `<div class="mux mux-b">
    ${commonHeader(model, "Cost seismograph", "Read the bill as ground movement: slope is accumulation, downward needles are individual shocks.")}
    ${controlDeck(model)}
    ${throughputPanel(model)}
    <main class="mux-b-layout">
      <aside class="mux-b-quakes"><header><span>Recorded shocks</span><b>${model.view.topSlots.length}</b></header>${incidentList(model, 12)}</aside>
      <section class="mux-b-scope">
        <div class="mux-b-scopehead"><span>Ground displacement / ${unitLabel(model.unit)} shocks</span><strong>${formatLabeledValue(model.view.total, model.unit)}</strong><small>The central trace is time. Every vertical spring opens to the exact 30-minute contribution.</small></div>
        ${seismographChart(model, 330)}
        <div class="mux-b-selected"><span>Selected interval</span><b>Day ${selected.day.slice(-2)} · ${clock(selected.bucket * 30)}</b><strong>${formatLabeledValue(selected.total, model.unit)}</strong><small>${selected.events.length} recorded requests · ${selected.concurrent} parallel session${selected.concurrent === 1 ? "" : "s"}</small></div>
        ${systemStrip(model)}
      </section>
      <aside class="mux-b-proof">${evidence(model, 14)}</aside>
    </main>
    ${analysisDock(model, false)}
  </div>`;
}

function machineRoomPanel(model, includePower = true) {
  const system = model.system;
  return `<aside class="mux-c-machine" data-severity="${system.severity}">
    <div class="mux-c-verdict"><i></i><span>Present condition</span><strong data-live="verdict">${system.severity.toUpperCase()}</strong><p>${system.severity === "pressure" ? "One or more resources are beyond the comfortable operating range." : "The host has capacity for more local work."}</p>${includePower ? powerSwitch(model) : ""}</div>
    <div class="mux-c-gauges"><div style="--g:${system.cpu}%"><span>CPU</span><b data-live="cpu">${Math.round(system.cpu)}%</b></div><div style="--g:${system.memory}%"><span>Memory</span><b data-live="memory">${Math.round(system.memory)}%</b></div><div style="--g:${system.loadRatio * 100}%"><span>Queue</span><b data-live="load">${Math.round(system.loadRatio * 100)}%</b></div></div>
    <section><span>Core dispatch</span>${coreRack(model)}</section>
    <dl><div><dt>Ollama</dt><dd data-live="server">${system.online ? "ONLINE" : "OFFLINE"}</dd></div><div><dt>Resident</dt><dd data-live="model">${escapeHtml(system.model)}</dd></div><div><dt>Allocation</dt><dd data-live="modelMeta">${escapeHtml(system.modelSize)} · ${escapeHtml(system.processor)}</dd></div><div><dt>Ollama CPU</dt><dd data-live="ollamaCpu">${Math.round(system.ollamaCpu)}%</dd></div><div><dt>Requests</dt><dd>${system.active} active / ${system.total} total</dd></div></dl>
  </aside>`;
}

function VariantC(model) {
  return `<div class="mux mux-c">
    <header class="mux-c-head"><div><span>LOCAL INFERENCE / CONTROL ROOM</span><h1>Machine room</h1></div><div class="mux-c-clock">${formatMonth(model.month)}<b>${formatValue(model.view.total, model.unit)}</b><small>${unitLabel(model.unit)}</small></div><div class="mux-c-controls">${commonHeader(model, "", "").match(/<div class="mux-period">[\s\S]*?<\/div>\s*<div class="mux-total">/)?.[0].replace('<div class="mux-total">', '') || ""}</div></header>
    ${controlDeck(model)}
    ${throughputPanel(model, true)}
    <main class="mux-c-layout">
      ${machineRoomPanel(model)}
      <section class="mux-c-usage"><header><span>${model.zoom === "month" ? "Month orbital network" : `${model.selectedDay} orbital network`} · ${model.zoom === "month" ? "day" : "30-minute"} nodes</span><h2>Inference orbit</h2><p>Distance and circle size encode usage; radial spokes preserve time, and colour identifies the dominant source.</p>${legend(model)}</header>${orbitChart(model, 440)}
        <div class="mux-c-ruler"><span>Inner orbit / quiet</span><i></i><b>Selected ${model.selectedSlotId.replace(":", " / ")}</b><i></i><span>Outer orbit / intense</span></div>
        ${evidence(model, 20)}
      </section>
    </main>
    ${analysisDock(model)}
  </div>`;
}

function dayFilm(day, model) {
  const slots = model.view.slots.filter((slot) => slot.day === day.day);
  const peak = Math.max(1, model.view.peakSlot.total);
  return `<button class="mux-film-day ${day.day === model.selectedDay ? "is-selected" : ""}" data-action="day" data-day="${day.day}">
    <span><small>${new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${day.day}T12:00:00`))}</small><b>${day.day.slice(-2)}</b></span>
    <svg class="mux-film-wave" viewBox="0 0 240 54" aria-hidden="true">${slots.map((slot, index) => {
      const radius = slot.total ? 1.7 + Math.sqrt(slot.total / peak) * 6.5 : .75;
      const y = 27 + Math.sin(index * .92) * 11;
      return `<circle cx="${5 + index * 4.9}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${ORIGIN_COLORS[dominantOrigin(slot)] || ORIGIN_COLORS.other}" data-action="slot" data-slot="${slot.id}"></circle>`;
    }).join("")}</svg>
    <strong>${formatLabeledValue(day.total, model.unit, true)}</strong><small>${day.events.length} recorded exposures</small>
  </button>`;
}

function VariantD(model) {
  return `<div class="mux mux-d">
    ${commonHeader(model, "Month contact sheet", "Every day is a separate exposure. Bubble grain reveals rhythm and intensity before you pull a frame into the loupe.")}
    ${controlDeck(model)}
    ${throughputPanel(model)}
    <main class="mux-d-layout">
      <section class="mux-d-film"><header><span>${formatMonth(model.month)} / contact exposures · ${sortLabel(model.sortDirection)}</span><div>${legend(model)}</div></header><div class="mux-contact-grid">${sortedDays(model).filter((day) => model.zoom === "month" || day.day === model.selectedDay).map((day) => dayFilm(day, model)).join("")}</div></section>
      <aside class="mux-d-report"><span>Pulled frame / source constellation</span><h2>${model.selectedDay}</h2>${bubbleTimeline(model, model.selectedDay, 205)}${evidence(model, 12)}</aside>
      <footer>${systemStrip(model)}</footer>
    </main>
    ${analysisDock(model)}
  </div>`;
}

function VariantE(model) {
  const selected = model.view.slots.find((slot) => slot.id === model.selectedSlotId) || model.view.peakSlot;
  return `<div class="mux mux-e">
    <header class="mux-e-head"><div><b>SAXJAX MONITOR / INCIDENT DESK</b><span>${new Date().toLocaleDateString([], { dateStyle: "full" })}</span></div><h1>Usage & capacity ledger</h1><div class="mux-e-status"><span data-live="server">OLLAMA ${model.system.online ? "UP" : "DOWN"}</span><b data-live="verdict">${model.system.severity.toUpperCase()}</b>${powerSwitch(model)}</div></header>
    <div class="mux-e-toolbar">${commonHeader(model, "", "").match(/<div class="mux-period">[\s\S]*?<\/div>\s*<div class="mux-total">/)?.[0].replace('<div class="mux-total">', '') || ""}<span>${model.view.sessions.length.toLocaleString()} sessions examined</span><strong>${model.capabilities[model.unit].available ? formatValue(model.view.total, model.unit) : "Unavailable"} ${unitLabel(model.unit)}</strong></div>
    ${controlDeck(model)}
    ${throughputPanel(model, true)}
    <main class="mux-e-layout">
      <section class="mux-e-horizon"><header><span>${model.zoom === "month" ? "MONTH" : "DAY"} FLOW REGISTER</span><h2>Source → incident → ledger</h2><p>Ribbon width is measured usage. Each square is an expensive interval; open it to audit the contributors below.</p></header>${usageFlowChart(model, 320)}</section>
      <aside class="mux-e-ranking"><header><span>RANK</span><span>TIME</span><span>VALUE / CAUSE</span></header>${incidentList(model, 10)}</aside>
      <section class="mux-e-selected"><header><span>SELECTED INCIDENT</span><strong>${selected.day} · ${clock(selected.bucket * 30)}</strong><b>${formatLabeledValue(selected.total, model.unit)}</b></header>${evidence(model, 30)}</section>
      <aside class="mux-e-machine"><header><span>HOST LEDGER</span><b data-live="verdict">${model.system.severity.toUpperCase()}</b></header>${systemStrip(model, true)}${coreRack(model)}</aside>
    </main>
    ${analysisDock(model)}
  </div>`;
}

function monthPlanning(model) {
  const [year, monthNumber] = model.month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const now = new Date();
  const currentMonth = localParts(now.toISOString()).month;
  const readings = model.manualReadings
    .filter((reading) => reading.date.startsWith(model.month) && reading.unit === model.unit)
    .sort((left, right) => left.date.localeCompare(right.date));
  const latest = readings.at(-1) || null;
  const previous = readings.at(-2) || null;
  const copilot = model.copilot || {};
  const localValue = model.unit === "credits"
    ? copilot.usedCredits == null ? Number.NaN : Number(copilot.usedCredits)
    : model.unit === "dollars"
      ? copilot.estimatedCost == null ? Number.NaN : Number(copilot.estimatedCost)
      : Number(copilot.observedInputTokens || 0) + Number(copilot.observedOutputTokens || 0);
  const timelineValue = model.capabilities[model.unit].available ? model.view.total : Number.NaN;
  const fallbackValue = model.month === currentMonth && Number.isFinite(localValue) ? localValue : timelineValue;
  const used = latest ? latest.value : Number.isFinite(fallbackValue) ? fallbackValue : 0;
  const latestDay = latest ? Number(latest.date.slice(-2)) : model.month === currentMonth ? now.getDate() : daysInMonth;
  const elapsed = Math.max(1, Math.min(daysInMonth, latestDay));
  const remainingDays = Math.max(0, daysInMonth - elapsed);
  const forecast = copilot.forecast || {};
  const capturedVelocity = model.unit === "credits"
    ? Number(forecast.creditsPerDay)
    : model.unit === "dollars"
      ? Number(forecast.creditsPerDay) / 100
      : (Number(forecast.inputTokens || 0) + Number(forecast.outputTokens || 0)) / Math.max(1, Number(forecast.observationHours || 0) / 24);
  const completedDays = model.view.daily.slice(0, elapsed);
  const timelineObserved = completedDays.reduce((sum, day) => sum + day.total, 0);
  const recentDays = completedDays.slice(-Math.min(7, completedDays.length));
  const recentWeight = recentDays.reduce((sum, _day, index) => sum + index + 1, 0);
  const weightedTimelineVelocity = recentWeight
    ? recentDays.reduce((sum, day, index) => sum + day.total * (index + 1), 0) / recentWeight
    : 0;
  const timelineScale = timelineObserved > 0 ? used / timelineObserved : 1;
  const observedVelocity = weightedTimelineVelocity > 0 ? weightedTimelineVelocity * timelineScale : used / elapsed;
  let velocity = Number.isFinite(capturedVelocity) && capturedVelocity > 0 ? capturedVelocity : observedVelocity;
  let velocitySource = Number.isFinite(capturedVelocity) && capturedVelocity > 0 ? "captured request velocity" : "weighted recent daily usage";
  if (latest && previous) {
    const span = Math.max(1, (Date.parse(`${latest.date}T12:00:00`) - Date.parse(`${previous.date}T12:00:00`)) / 86_400_000);
    velocity = Math.max(0, (latest.value - previous.value) / span);
    velocitySource = "provider reading delta";
  } else if (!Number.isFinite(velocity) || velocity <= 0) {
    velocity = used / elapsed;
    velocitySource = latest ? "provider reading ÷ elapsed days" : "month average";
  }
  const additions = model.budgetAdditions
    .filter((addition) => addition.month === model.month && addition.unit === model.unit)
    .sort((left, right) => left.date.localeCompare(right.date));
  const baseBudget = Math.max(model.unit === "dollars" ? .01 : 1, model.baseBudgets[model.unit]);
  const addedBudget = additions.reduce((sum, addition) => sum + addition.value, 0);
  const target = baseBudget + addedBudget;
  const sustainable = remainingDays ? Math.max(0, target - used) / remainingDays : 0;
  const scenarioVelocity = Math.max(0, velocity) * model.paceScenario / 100;
  const isFinal = remainingDays === 0;
  const projection = isFinal ? used : used + scenarioVelocity * remainingDays;
  const finishValue = isFinal ? used : projection;
  const ratio = sustainable > 0 ? velocity / sustainable : velocity > 0 ? Infinity : 0;
  const state = finishValue > target * 1.05 ? "over" : finishValue < target * .78 ? "under" : "aligned";
  const delta = latest && Number.isFinite(localValue) ? latest.value - localValue : null;
  const budgetDifference = target - finishValue;
  const originalDifference = finishValue - baseBudget;
  const distanceRatio = Math.abs(originalDifference) / Math.max(1, baseBudget);
  const accuracyScore = Math.max(0, Math.round(100 - distanceRatio * 100));
  const usedBooster = additions.length > 0;
  const boosterPenalty = usedBooster
    ? Math.min(25, 4 + additions.length * 3 + Math.round(addedBudget / Math.max(1, baseBudget) * 8))
    : 0;
  const unapprovedOverrun = Math.max(0, finishValue - target);
  const unapprovedOverrunRatio = unapprovedOverrun / Math.max(1, target);
  const overrunPenalty = unapprovedOverrun > 0
    ? Math.min(50, 10 + Math.round(unapprovedOverrun / Math.max(1, target) * 40))
    : 0;
  const ratingScore = Math.max(0, accuracyScore - boosterPenalty - overrunPenalty);
  const ratingGrade = ratingScore >= 95 ? "S" : ratingScore >= 85 ? "A" : ratingScore >= 70 ? "B" : ratingScore >= 50 ? "C" : ratingScore >= 25 ? "D" : "F";
  const ratingLabel = unapprovedOverrun > 0
    ? `${isFinal ? "Final" : "Projected"} unapproved overrun`
    : finishValue < baseBudget * .8
      ? "Underused"
      : usedBooster && finishValue > baseBudget * 1.05
        ? "Booster finish"
        : distanceRatio <= .05
          ? usedBooster ? "Boosted bullseye" : "Budget bullseye"
          : finishValue < baseBudget ? "Below target" : "Over original budget";
  const performanceTone = unapprovedOverrun > 0
    ? unapprovedOverrunRatio >= 3
      ? "over-catastrophic"
      : unapprovedOverrunRatio >= .5
        ? "over-major"
        : "over-mild"
    : finishValue < baseBudget * .8
      ? "under"
      : usedBooster
        ? "boosted"
        : ratingScore >= 85 ? "aligned" : "warning";
  const ratingVerdict = ratingScore >= 95
    ? "LEGENDARY"
    : ratingScore >= 85
      ? "NAILED IT"
      : ratingScore >= 70
        ? "GOOD"
        : ratingScore >= 50
          ? "WOBBLY"
          : ratingScore >= 25
            ? "BAD"
            : "TERRIBLE";
  const message = unapprovedOverrun > 0
    ? `${isFinal ? "The month closed" : `At ${formatLabeledValue(scenarioVelocity, model.unit)}/day, you are projected to finish`} at ${formatLabeledValue(finishValue, model.unit)}—${formatLabeledValue(unapprovedOverrun, model.unit)} beyond every approved budget.`
    : finishValue < baseBudget * .8
      ? `${isFinal ? "The month closed" : `At ${formatLabeledValue(scenarioVelocity, model.unit)}/day, you are projected to finish`} at ${formatLabeledValue(finishValue, model.unit)}—${formatLabeledValue(baseBudget - finishValue, model.unit)} below the original budget.`
      : usedBooster
        ? `${isFinal ? "The final cost" : "The current velocity forecast"} is approved, but ${additions.length} booster${additions.length === 1 ? "" : "s"} subtract ${boosterPenalty} rating points.`
        : distanceRatio <= .05
          ? `${isFinal ? "The final cost lands" : "Current velocity lands you"} within 5% of the original budget without using a booster.`
          : `${isFinal ? "The final cost is" : `At ${formatLabeledValue(scenarioVelocity, model.unit)}/day, month end is projected`} ${formatLabeledValue(Math.abs(originalDifference), model.unit)} from the original budget.`;
  const dramaEyebrow = unapprovedOverrun > 0
    ? unapprovedOverrunRatio >= 3
      ? "🚨 CATASTROPHIC · UNAPPROVED OVERRUN"
      : unapprovedOverrunRatio >= .5
        ? "🔥 DANGER · SERIOUS OVERRUN"
        : unapprovedOverrunRatio >= .1
          ? "⚠️ OVER BUDGET · RECOVERABLE"
          : "🟠 SLIGHT OVERRUN · NEAR MISS"
    : finishValue < baseBudget * .8
      ? isFinal ? "🥶 FINAL · BUDGET LEFT BEHIND" : "🥶 PACE FORECAST · RUNNING TOO COLD"
      : usedBooster
        ? "⚡ APPROVED BOOSTER USED"
        : distanceRatio <= .05
          ? "🏆 ORIGINAL-BUDGET BULLSEYE"
          : "⚠️ WOBBLY FINISH";
  const underRatio = finishValue / Math.max(1, baseBudget);
  const dramaTitle = unapprovedOverrun > 0
    ? unapprovedOverrunRatio >= 3
      ? "ARE YOU MAD?"
      : unapprovedOverrunRatio >= 1
        ? "THE BUDGET IS ON FIRE."
        : unapprovedOverrunRatio >= .5
          ? "THIS GOT AWAY FROM YOU."
          : unapprovedOverrunRatio >= .1
            ? "EASY, CHAMP."
            : "MISSED IT BY A WHISKER."
    : finishValue < baseBudget * .8
      ? underRatio < .45 ? "ICE AGE INCOMING." : underRatio < .7 ? "TOO COLD. FIND USEFUL WORK." : "YOU’RE LEAVING VALUE ON THE TABLE."
      : usedBooster
        ? ratingScore >= 70 ? "LEGAL. NOT ELEGANT." : "BOOSTED. STILL MESSY."
        : distanceRatio <= .05
          ? "SUSPICIOUSLY COMPETENT."
          : finishValue < baseBudget
            ? "TOO SHY. SPEND WITH PURPOSE."
            : "YOU SURVIVED. BARELY.";
  const dramaQuip = unapprovedOverrun > 0
    ? unapprovedOverrunRatio >= 3
      ? isFinal ? `You blasted ${formatLabeledValue(unapprovedOverrun, model.unit)} past every approved limit. Your budget would like a restraining order.` : `Current velocity is blasting you ${formatLabeledValue(unapprovedOverrun, model.unit)} past every approved limit. Your budget is filing paperwork.`
      : unapprovedOverrunRatio >= 1
        ? isFinal ? `You finished ${formatLabeledValue(unapprovedOverrun, model.unit)} over the approved line—more than an entire extra budget. Please put the flamethrower down.` : `Current velocity carries you ${formatLabeledValue(unapprovedOverrun, model.unit)} over the approved line—more than an entire extra budget. Please lower the flamethrower.`
        : unapprovedOverrunRatio >= .5
          ? isFinal ? `You ran ${formatLabeledValue(unapprovedOverrun, model.unit)} over the approved line. This was a real miss, but at least the building is still standing.` : `Current velocity runs ${formatLabeledValue(unapprovedOverrun, model.unit)} over the approved line. This is a real miss, but the brakes still work.`
          : unapprovedOverrunRatio >= .1
            ? isFinal ? `You overshot by ${formatLabeledValue(unapprovedOverrun, model.unit)}. Not madness—just enough enthusiasm to earn an awkward meeting.` : `Current velocity overshoots by ${formatLabeledValue(unapprovedOverrun, model.unit)}. Not madness—just enough enthusiasm to schedule an awkward meeting.`
            : isFinal ? `You slipped ${formatLabeledValue(unapprovedOverrun, model.unit)} over the line. Annoying, fixable, and definitely not a catastrophe.` : `Current velocity slips ${formatLabeledValue(unapprovedOverrun, model.unit)} over the line. Annoying, fixable, and not yet a catastrophe.`
    : finishValue < baseBudget * .8
      ? `${isFinal ? "You finished" : `Current velocity lands you`} ${formatLabeledValue(baseBudget - finishValue, model.unit)} below the original budget. Spend on useful work—not ceremonial idling.`
      : usedBooster
        ? isFinal ? `${additions.length} approved booster${additions.length === 1 ? "" : "s"} kept the finish legal. The scoreboard still charged ${boosterPenalty} points for the rescue.` : `${additions.length} approved booster${additions.length === 1 ? " is" : "s are"} keeping the forecast legal. The scoreboard currently charges ${boosterPenalty} points for the rescue.`
        : distanceRatio <= .05
          ? isFinal ? `You finished within 5% of the original budget: no booster, no excuses. Annoyingly excellent.` : `Current velocity lands within 5% of the original budget: no booster, no excuses. Annoyingly excellent.`
          : finishValue < baseBudget
            ? isFinal ? `You finished ${formatLabeledValue(baseBudget - finishValue, model.unit)} short of the original budget. Caution was not the same as control.` : `Current velocity lands ${formatLabeledValue(baseBudget - projection, model.unit)} short of the original budget. Caution is not the same as control.`
            : isFinal ? `You finished ${formatLabeledValue(finishValue - baseBudget, model.unit)} over the original budget. Close enough to survive, far enough to get side-eye.` : `Current velocity lands ${formatLabeledValue(projection - baseBudget, model.unit)} over the original budget. Close enough to recover, far enough to get side-eye.`;
  const averageVelocity = used / elapsed;
  const velocityTrendRatio = averageVelocity > 0 ? scenarioVelocity / averageVelocity : 1;
  const velocityTrend = velocityTrendRatio <= .65 ? "cooling-fast" : velocityTrendRatio <= .85 ? "cooling" : velocityTrendRatio >= 1.5 ? "accelerating-hard" : velocityTrendRatio >= 1.15 ? "accelerating" : "steady";
  const trendLabel = velocityTrend === "cooling-fast" ? "COOLING FAST" : velocityTrend === "cooling" ? "COOLING" : velocityTrend === "accelerating-hard" ? "ACCELERATING HARD" : velocityTrend === "accelerating" ? "HEATING UP" : "STEADY PACE";
  const forecastRatio = finishValue / Math.max(1, target);
  const paceClimate = forecastRatio < .45 ? "deep-freeze" : forecastRatio < .7 ? "frost" : forecastRatio < .9 ? "cool" : forecastRatio <= 1.05 ? "gold" : forecastRatio <= 1.25 ? "warm" : forecastRatio <= 1.75 ? "hot" : forecastRatio <= 3 ? "inferno" : "meltdown";
  const paceStory = isFinal
    ? `MONTH CLOSED · rating uses the final ${unitLabel(model.unit)} total only.`
    : finishValue > target && velocityTrendRatio < .85
      ? `Still projected over budget, but recent velocity is cooling. Hold the lower pace.`
      : finishValue < baseBudget * .8 && velocityTrendRatio > 1.15
        ? `The forecast is still cold, but velocity is heating up. Do not assume the low finish is secure.`
        : `${trendLabel} · ${formatLabeledValue(scenarioVelocity, model.unit)}/day now points to ${formatLabeledValue(projection, model.unit)} at month end.`;
  const efficiencyWindow = Math.min(7, Math.floor(completedDays.length / 2));
  const efficiencyRecent = efficiencyWindow ? completedDays.slice(-efficiencyWindow) : [];
  const efficiencyPrevious = efficiencyWindow ? completedDays.slice(-efficiencyWindow * 2, -efficiencyWindow) : [];
  const windowStats = (days) => ({ value: days.reduce((sum, day) => sum + day.total, 0), requests: days.reduce((sum, day) => sum + day.events.length, 0) });
  const recentStats = windowStats(efficiencyRecent);
  const previousStats = windowStats(efficiencyPrevious);
  const recentPerRequest = recentStats.requests ? recentStats.value / recentStats.requests : 0;
  const previousPerRequest = previousStats.requests ? previousStats.value / previousStats.requests : 0;
  const efficiencyRatio = previousPerRequest > 0 ? recentPerRequest / previousPerRequest : 1;
  const efficiencySignal = efficiencyWindow >= 2 && recentStats.requests >= 5 && previousStats.requests >= 5 && efficiencyRatio <= .78
    ? { percent: Math.round((1 - efficiencyRatio) * 100), recentPerRequest, previousPerRequest }
    : null;
  const ratingBasis = isFinal ? "FINAL ACTUAL COST" : "CURRENT VELOCITY FORECAST";
  const ratingBasisDetail = isFinal ? "Month closed: score uses actual final cost." : `Month open: score uses projected ${formatLabeledValue(projection, model.unit)} month end.`;
  return { readings, latest, previous, additions, daysInMonth, elapsed, remainingDays, isFinal, used, velocity, velocitySource, averageVelocity, velocityTrendRatio, velocityTrend, trendLabel, paceClimate, paceStory, baseBudget, addedBudget, target, sustainable, scenarioVelocity, projection, finishValue, budgetDifference, originalDifference, distanceRatio, accuracyScore, usedBooster, boosterPenalty, unapprovedOverrun, unapprovedOverrunRatio, overrunPenalty, ratingScore, ratingGrade, ratingLabel, ratingVerdict, ratingBasis, ratingBasisDetail, performanceTone, efficiencySignal, ratio, state, delta, message, dramaEyebrow, dramaTitle, dramaQuip };
}

const PROMPT_RULES = {
  broad: { label: "Unbounded ask", advice: "Name the exact outcome, files, and stopping condition before the agent explores." },
  repeated: { label: "Repeated context", advice: "Remove duplicate lines and point at one canonical source instead of pasting it again." },
  oversized: { label: "Context avalanche", advice: "Split discovery from implementation and carry forward a short verified brief." },
  contract: { label: "No output contract", advice: "Specify the expected artifact, verification, and what a finished answer must contain." },
  ratio: { label: "Input-heavy turn", advice: "Start a clean task or summarize accumulated context when input dwarfs useful output." },
};

function promptHygiene(model) {
  const incidents = [];
  for (const event of model.view.monthEvents.filter((item) => item.provider === "github-copilot" || item.origin.includes("vscode") || item.origin === "copilot-cli")) {
    const prompt = String(event.prompt || "").trim();
    const lines = prompt.split(/\n+/).map((line) => line.trim().toLowerCase()).filter((line) => line.length > 18);
    const duplicateLines = lines.length - new Set(lines).size;
    const rules = [];
    if (/\b(make it better|do everything|fix everything|help me|improve this|whatever is needed)\b/i.test(prompt)) rules.push("broad");
    if (duplicateLines > 0) rules.push("repeated");
    if (prompt.length > 1800 || Number(event.inputTokens) > 12_000) rules.push("oversized");
    if (prompt.length > 120 && !/\b(return|output|produce|create|implement|write|explain|list|verify|test|format|file|component|function)\b/i.test(prompt)) rules.push("contract");
    if (Number(event.inputTokens) > 4_000 && Number(event.inputTokens) > Math.max(1, Number(event.outputTokens) || 0) * 18) rules.push("ratio");
    if (!rules.length) continue;
    incidents.push({ event, rules, score: rules.length * 2 + Math.log10(Math.max(10, Number(event.inputTokens) || prompt.length / 3.4)) });
  }
  incidents.sort((left, right) => right.score - left.score);
  const counts = Object.keys(PROMPT_RULES).map((key) => ({ key, count: incidents.filter((incident) => incident.rules.includes(key)).length }));
  const flaggedUsage = incidents.reduce((sum, incident) => sum + unitValue(incident.event, model.unit), 0);
  return { incidents, counts, flaggedUsage };
}

function capturedExchange(model, event) {
  const traffic = model.traffic || [];
  const exact = traffic.find((item) => item.id === event.id)
    || traffic.find((item) => item.session?.id === event.sessionId && item.startedAt === event.startedAt)
    || traffic.find((item) => item.startedAt === event.startedAt)
    || null;
  if (exact) return exact;
  const sessionMatches = traffic.filter((item) => item.session?.id === event.sessionId || item.sessionId === event.sessionId);
  return sessionMatches.length === 1 ? sessionMatches[0] : null;
}

function readableCapture(value, fallback) {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return fallback;
}

function manualReadingList(model, treatment) {
  const plan = monthPlanning(model);
  const suggestedDate = model.manualReadingDate.startsWith(model.month)
    ? model.manualReadingDate
    : `${model.month}-${String(Math.min(plan.daysInMonth, new Date().getDate())).padStart(2, "0")}`;
  const measurementLabel = model.unit === "dollars" ? "Estimated USD used" : model.unit === "tokens" ? "Tokens used" : "Credits used";
  const step = model.unit === "dollars" ? ".01" : model.unit === "tokens" ? "1" : ".1";
  const rows = plan.readings.map((reading) => `<li><time>${reading.date.slice(-2)}</time><b>${formatValue(reading.value, model.unit)}</b><span>${unitLabel(model.unit)}</span><button data-action="remove-reading" data-reading-id="${reading.id}" aria-label="Remove ${reading.date} reading">×</button></li>`).join("");
  return `<section class="mux-manual mux-manual-${treatment}" data-feedback-id="manual-github-readings" data-feedback-kind="control" data-feedback-label="Manual provider readings">
    <header><span>MANUAL TRUTH / PROVIDER PAGE</span><h2>${treatment === "garden" ? "Rain-gauge calibration" : treatment === "loom" ? "Thread-counter readings" : "Checkpoint scorekeeper"}</h2><p>Enter the provider page’s month-to-date ${unitLabel(model.unit)}. Two readings replace estimated velocity with their measured delta.</p></header>
    <form data-action="manual-reading"><label>Date<input name="date" type="date" value="${suggestedDate}" min="${model.month}-01" max="${model.month}-${String(plan.daysInMonth).padStart(2, "0")}" required></label><label>${measurementLabel}<input name="reading" type="number" min="0" step="${step}" placeholder="Enter ${unitLabel(model.unit)}" required></label><button type="submit">Add reading</button></form>
    <ol>${rows || "<li class=\"is-empty\">No manual readings yet · using local estimates</li>"}</ol>
    <small>Prototype-only: readings stay in memory and disappear when this page closes.</small>
  </section>`;
}

function courseControls(model, treatment) {
  const plan = monthPlanning(model);
  const additionStep = model.unit === "dollars" ? ".01" : "1";
  const suggestedAdditionDate = model.budgetAdditionDate.startsWith(model.month)
    ? model.budgetAdditionDate
    : `${model.month}-${String(Math.min(plan.daysInMonth, new Date().getDate())).padStart(2, "0")}`;
  const additionRows = plan.additions.map((addition, index) => `<li><time>${addition.date.slice(-2)}</time><span>Booster ${index + 1} used</span><b>+${formatValue(addition.value, model.unit, true)}</b><button data-action="remove-budget-addition" data-budget-addition-id="${addition.id}" aria-label="Remove booster added ${addition.date}">×</button></li>`).join("");
  const selectedPace = model.paceScenario === 100 ? "current pace" : `${model.paceScenario}% of current pace`;
  return `<section class="mux-course mux-course-${treatment}" data-course="${treatment === "board" ? plan.performanceTone : plan.state}" data-feedback-id="course-control" data-feedback-kind="control" data-feedback-label="Monthly budget planner">
    <header><span>${escapeHtml(plan.ratingBasis)}</span><div class="mux-course-rating"><b>${plan.ratingScore}</b><span>/100 · GRADE ${plan.ratingGrade}</span><em>${escapeHtml(plan.ratingLabel)}</em></div><strong>${escapeHtml(plan.message)}</strong><small>${escapeHtml(plan.ratingBasisDetail)}</small></header>
    <div class="mux-rating-breakdown"><span>Original-budget accuracy <b>${plan.accuracyScore}</b></span><span>Booster penalty <b>−${plan.boosterPenalty}</b></span><span>Unapproved-overrun penalty <b>−${plan.overrunPenalty}</b></span></div>
    <div class="mux-course-numbers">
      <span><b>${formatValue(plan.used, model.unit, true)}</b>Spent so far<small>Recorded in ${formatMonth(model.month, true)} through day ${plan.elapsed}.</small></span>
      <span><b>${formatValue(plan.velocity, model.unit, true)}</b>Current velocity / day<small>${escapeHtml(plan.velocitySource)}.</small></span>
      <span><b>${formatValue(plan.projection, model.unit, true)}</b>${plan.isFinal ? "Final month cost" : "If this pace continues"}<small>${plan.isFinal ? "The month is closed; this is actual." : `Spent so far plus ${plan.remainingDays} days at ${selectedPace}.`}</small></span>
      <span><b>${formatValue(plan.target, model.unit, true)}</b>Total approved<small>${formatValue(plan.baseBudget, model.unit, true)} original + ${formatValue(plan.addedBudget, model.unit, true)} in boosters.</small></span>
    </div>
    <div class="mux-budget-builder">
      <label><span>Base monthly budget</span><small>The amount approved at the start of the month.</small><input data-action="base-budget" type="number" min="${model.unit === "dollars" ? ".01" : "1"}" max="100000000000" step="${additionStep}" value="${plan.baseBudget}"></label>
      <form data-action="budget-addition"><span>Approved budget booster</span><small>A booster makes extra spending legal, but its use and size reduce the finish rating.</small><label>Date<input name="date" type="date" value="${suggestedAdditionDate}" min="${model.month}-01" max="${model.month}-${String(plan.daysInMonth).padStart(2, "0")}" required></label><label>Amount<input name="amount" type="number" min="${additionStep}" step="${additionStep}" placeholder="Add ${unitLabel(model.unit)}" required></label><button type="submit">Activate booster</button></form>
      <ol>${additionRows || "<li class=\"is-empty\">No boosters used this month.</li>"}</ol>
      <div class="mux-budget-total"><span>Total approved this month</span><b>${formatValue(plan.target, model.unit, true)}</b></div>
    </div>
    <label class="mux-course-scenario">Forecast scenario <b>${model.paceScenario}%</b><input data-action="pace-scenario" type="range" min="20" max="180" step="5" value="${model.paceScenario}"><small>Adjust this only to ask “what if my future usage changes?” It does not change your budget.</small></label>
    <footer><b>${escapeHtml(plan.paceStory)}</b>${plan.efficiencySignal ? `<span>EFFICIENCY CLUE · recent ${unitLabel(model.unit)} per request fell ${plan.efficiencySignal.percent}%. Something in the setup or prompting may have become cheaper—inspect FORENSICS before taking credit.</span>` : ""}${plan.delta == null ? "" : `<span>The provider is ${formatLabeledValue(Math.abs(plan.delta), model.unit)} ${plan.delta >= 0 ? "above" : "below"} the local count.</span>`}</footer>
  </section>`;
}

function promptCoach(model, treatment, limit = 5) {
  const hygiene = promptHygiene(model);
  return `<section class="mux-prompt-coach mux-prompt-${treatment}" data-feedback-id="prompt-coach" data-feedback-kind="section" data-feedback-label="Automatic prompt practice coach">
    <header><div><span>PROMPT COST & PRACTICE COACH</span><h2>${hygiene.incidents.length ? `${hygiene.incidents.length} prompts may be inflating context, cost, or rework` : "No obvious costly prompt habits in this view"}</h2><p>Heuristics surface prompts worth improving. Open one for the coaching view, then use FORENSICS for the actual machine record.</p></div><strong><span>Recorded usage of flagged requests</span><b>${hygiene.flaggedUsage ? formatValue(hygiene.flaggedUsage, model.unit, true) : "—"}</b><small>This is usage attached to those requests—not waste or predicted savings.</small></strong></header>
    <div class="mux-prompt-signals">${hygiene.counts.map((item) => `<span data-active="${item.count > 0}"><b>${item.count}</b>${PROMPT_RULES[item.key].label}</span>`).join("")}</div>
    <ol>${hygiene.incidents.slice(0, limit).map((incident) => {
      const exchange = capturedExchange(model, incident.event);
      const incoming = readableCapture(exchange?.inputContext, readableCapture(exchange?.transformedPrompt, readableCapture(exchange?.prompt, incident.event.prompt)));
      const outgoing = readableCapture(exchange?.response, "The complete output is not retained in the normalized historic timeline for this request.");
      return `<li><details class="mux-prompt-case" data-prompt-event="${escapeHtml(incident.event.id)}" ${model.openPromptEventId === incident.event.id ? "open" : ""}><summary><span>${incident.rules.map((rule) => PROMPT_RULES[rule].label).join(" + ")}</span><b>${escapeHtml(incident.event.prompt.slice(0, 150))}</b><small>${escapeHtml(PROMPT_RULES[incident.rules[0]].advice)}</small><i aria-hidden="true">+</i></summary><div class="mux-prompt-exchange"><section><span>IN / LOCALLY AVAILABLE COACHING VIEW</span><pre>${escapeHtml(incoming)}</pre></section><section><span>OUT / LOCALLY AVAILABLE COACHING VIEW</span><pre>${escapeHtml(outgoing)}</pre></section>${exchange?.thinking ? `<section><span>REASONING</span><pre>${escapeHtml(readableCapture(exchange.thinking, ""))}</pre></section>` : ""}<button data-action="session" data-session="${escapeHtml(incident.event.sessionId)}" data-event="${escapeHtml(incident.event.id)}" data-jump="forensics">Open this actual request in FORENSICS ↓</button></div></details></li>`;
    }).join("") || "<li class=\"is-empty\">The heuristic only sees locally captured excerpts and request proportions. It will stay quiet rather than invent a problem.</li>"}</ol>
  </section>`;
}

function planningNavigator(model) {
  return `<div class="mux-plan-nav"><div class="mux-view-month"><span>Viewed month</span><div>${model.months.map((item) => `<button data-action="view-month" data-month="${item}" class="${item === model.month ? "is-active" : ""}" aria-pressed="${item === model.month}">${formatMonth(item, true)}</button>`).join("")}</div></div><div class="mux-plan-units" role="group" aria-label="Usage unit">${[["credits", "Credits"], ["tokens", "Tokens"], ["dollars", "Money"]].map(([key, label]) => `<button data-action="unit" data-unit="${key}" class="${model.unit === key ? "is-active" : ""}" ${model.capabilities[key].available ? "" : `disabled title="${escapeHtml(model.capabilities[key].note)}"`}>${label}</button>`).join("")}</div></div>`;
}

function gardenChart(model, height = 520) {
  const plan = monthPlanning(model);
  const hygiene = promptHygiene(model);
  const width = 1180;
  const left = 46;
  const right = 190;
  const ground = height - 56;
  const plotWidth = width - left - right;
  const source = model.view.daily;
  const peak = Math.max(1, ...source.map((day) => day.total), plan.scenarioVelocity, plan.sustainable);
  const step = plotWidth / Math.max(1, source.length);
  const latestDay = plan.latest ? Number(plan.latest.date.slice(-2)) : plan.elapsed;
  const weedsByDay = Object.fromEntries(hygiene.incidents.map((incident) => [incident.event.day, (hygiene.incidents.filter((item) => item.event.day === incident.event.day).length)]));
  const plants = source.map((day, index) => {
    const dayNumber = index + 1;
    const future = dayNumber > latestDay;
    const value = future ? plan.scenarioVelocity : day.total;
    const h = 14 + Math.sqrt(value / peak) * 180;
    const x = left + step * (index + .5);
    const color = ORIGIN_COLORS[dominantOrigin(day)] || "#6da86b";
    const selected = day.day === model.selectedDay;
    const weeds = weedsByDay[day.day] || 0;
    return `<g class="mux-garden-plant ${future ? "is-future" : ""} ${selected ? "is-selected" : ""}" data-action="day" data-day="${day.day}"><path class="mux-garden-stem" d="M${x} ${ground} C${x - 5} ${ground - h * .45},${x + 7} ${ground - h * .72},${x} ${ground - h}" stroke="${color}"/><ellipse cx="${x - 7}" cy="${ground - h * .56}" rx="7" ry="3.5" fill="${color}" transform="rotate(-28 ${x - 7} ${ground - h * .56})"/><ellipse cx="${x + 7}" cy="${ground - h * .72}" rx="7" ry="3.5" fill="${color}" transform="rotate(28 ${x + 7} ${ground - h * .72})"/><circle cx="${x}" cy="${ground - h}" r="${3 + Math.sqrt(value / peak) * 9}" fill="${color}"/>${weeds ? `<path class="mux-garden-weed" d="M${x + 5} ${ground} q8 -14 13 -4 q-2 -16 9 -20"/><text x="${x + 24}" y="${ground - 22}">${weeds}</text>` : ""}<text x="${x}" y="${ground + 19}" text-anchor="middle">${String(dayNumber).padStart(2, "0")}</text><title>${day.day} · ${formatLabeledValue(day.total, model.unit)}${future ? ` · scenario ${formatLabeledValue(plan.scenarioVelocity, model.unit)} / day` : ""}</title></g>`;
  }).join("");
  const safeY = ground - (14 + Math.sqrt(Math.min(peak, plan.sustainable) / peak) * 180);
  const readings = plan.readings.map((reading) => {
    const index = Number(reading.date.slice(-2)) - 1;
    const x = left + step * (index + .5);
    return `<g class="mux-garden-rain"><path d="M${x} 36 C${x - 9} 49 ${x - 8} 59 ${x} 62 C${x + 8} 59 ${x + 9} 49 ${x} 36Z"/><text x="${x}" y="78" text-anchor="middle">${escapeHtml(formatValue(reading.value, model.unit, true))}</text></g>`;
  }).join("");
  return `<svg class="mux-garden-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="A usage garden: actual daily usage grows solid plants, simulated future usage grows outlined plants, and prompt-practice flags grow as weeds."><defs><pattern id="garden-soil" width="20" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 Q5 1 10 6 T20 6" fill="none" stroke="currentColor" opacity=".12"/></pattern></defs><rect x="0" y="${ground}" width="${width}" height="${height - ground}" fill="url(#garden-soil)"/><path class="mux-garden-canopy" d="M${left} ${safeY} H${width - right}"/><text class="mux-garden-safe" x="${width - right + 8}" y="${safeY + 4}">SAFE DAILY CANOPY · ${escapeHtml(formatValue(plan.sustainable, model.unit, true))}</text>${readings}${plants}<g class="mux-garden-reservoir"><circle cx="${width - 92}" cy="${ground - 108}" r="67"/><path d="M${width - 151} ${ground - 108 + 58 * Math.max(-1, Math.min(1, plan.used / plan.target * 2 - 1))} A59 59 0 0 0 ${width - 33} ${ground - 108 + 58 * Math.max(-1, Math.min(1, plan.used / plan.target * 2 - 1))} L${width - 33} ${ground - 49} L${width - 151} ${ground - 49}Z"/><text x="${width - 92}" y="${ground - 117}" text-anchor="middle">${escapeHtml(formatValue(plan.used, model.unit, true))} / ${escapeHtml(formatValue(plan.target, model.unit, true))}</text><text x="${width - 92}" y="${ground - 96}" text-anchor="middle">${escapeHtml(unitLabel(model.unit).toUpperCase())}</text></g></svg>`;
}

function VariantF(model) {
  return `<div class="mux mux-f">
    <header class="mux-f-head"><div><span>SAXJAX / LIVING BUDGET</span><h1>Credit garden</h1><p>The month grows in front of you. Solid plants are history, outlined plants are your simulated future, and prompt smells surface as weeds.</p>${planningNavigator(model)}</div><div>${powerSwitch(model)}</div></header>
    ${controlDeck(model)}
    <main class="mux-f-layout"><section class="mux-f-garden"><header><span>${formatMonth(model.month)} · ${model.view.monthEvents.length} requests</span><h2>Will this pace outgrow the greenhouse?</h2><div>${legend(model)}</div></header>${gardenChart(model)}</section><aside class="mux-f-sidebar">${courseControls(model, "garden")}${manualReadingList(model, "garden")}</aside>${promptCoach(model, "garden", 6)}</main>
    <footer class="mux-f-roots">${systemStrip(model, true)}${evidence(model, 8)}</footer>
  </div>`;
}

function loomChart(model, height = 510) {
  const plan = monthPlanning(model);
  const hygiene = promptHygiene(model);
  const width = 1180;
  const left = 125;
  const top = 54;
  const origins = model.view.originTotals.map((item) => item.origin);
  if (!origins.length) origins.push("other");
  const rowHeight = (height - top - 55) / origins.length;
  const column = (width - left - 24) / model.view.daily.length;
  const peak = Math.max(1, ...model.view.daily.flatMap((day) => Object.values(day.byOrigin)));
  const threads = model.view.daily.flatMap((day, dayIndex) => origins.map((origin, originIndex) => {
    const value = day.byOrigin[origin] || 0;
    const x = left + dayIndex * column;
    const y = top + originIndex * rowHeight;
    return `<rect class="mux-loom-weft ${day.day === model.selectedDay ? "is-selected" : ""}" data-action="day" data-day="${day.day}" x="${x}" y="${y + 4}" width="${Math.max(2, column - 1)}" height="${Math.max(4, rowHeight - 8)}" fill="${ORIGIN_COLORS[origin] || ORIGIN_COLORS.other}" opacity="${value ? (.12 + value / peak * .88).toFixed(2) : .035}"><title>${day.day} · ${ORIGIN_LABELS[origin] || origin} · ${formatLabeledValue(value, model.unit)}</title></rect>`;
  })).join("");
  const knots = hygiene.incidents.slice(0, 18).map((incident, index) => {
    const dayIndex = Math.max(0, Number(incident.event.day.slice(-2)) - 1);
    const originIndex = Math.max(0, origins.indexOf(incident.event.origin));
    const x = left + (dayIndex + .5) * column;
    const y = top + (originIndex + .5) * rowHeight;
    return `<g class="mux-loom-knot" data-action="session" data-session="${escapeHtml(incident.event.sessionId)}"><circle cx="${x}" cy="${y}" r="${7 + Math.min(5, incident.rules.length * 2)}"/><text x="${x}" y="${y + 3}" text-anchor="middle">${index + 1}</text><title>${incident.rules.map((rule) => PROMPT_RULES[rule].label).join(", ")}</title></g>`;
  }).join("");
  const readings = plan.readings.map((reading) => {
    const x = left + (Number(reading.date.slice(-2)) - .5) * column;
    return `<g class="mux-loom-reading"><path d="M${x - 7} 11 H${x + 7} L${x} 31Z"/><line x1="${x}" y1="31" x2="${x}" y2="${height - 26}"/><text x="${x}" y="9" text-anchor="middle">${escapeHtml(formatValue(reading.value, model.unit, true))}</text></g>`;
  }).join("");
  return `<svg class="mux-loom-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Usage woven by source across days. Saturation is usage, numbered knots are possible prompt bad practices, and gold needles are manual GitHub readings."><g class="mux-loom-warp">${model.view.daily.map((day, index) => `<line x1="${left + (index + .5) * column}" y1="${top - 12}" x2="${left + (index + .5) * column}" y2="${height - 28}"/>`).join("")}</g>${threads}${origins.map((origin, index) => `<text x="${left - 12}" y="${top + (index + .5) * rowHeight + 4}" text-anchor="end">${escapeHtml(ORIGIN_LABELS[origin] || origin)}</text>`).join("")}${model.view.daily.map((day, index) => index % 2 === 0 ? `<text x="${left + (index + .5) * column}" y="${height - 8}" text-anchor="middle">${day.day.slice(-2)}</text>` : "").join("")}${readings}${knots}<g class="mux-loom-shuttle" transform="translate(${left + Math.min(model.view.daily.length - 1, plan.elapsed - 1) * column},${height - 23})"><path d="M0 0 h58 l13 8 -13 8 H0 l-13 -8Z"/><text x="29" y="11" text-anchor="middle">NOW</text></g></svg>`;
}

function VariantH(model) {
  const plan = monthPlanning(model);
  return `<div class="mux mux-h">
    <header class="mux-h-head"><div><span>SAXJAX / MONTHLY TEXTILE</span><h1>The prompt loom</h1><p>Sources become coloured threads. Daily density becomes fabric. Bad prompt habits become literal knots you can open and untangle.</p>${planningNavigator(model)}</div><div class="mux-h-tension" data-course="${plan.state}"><span>TENSION</span><b>${plan.state === "over" ? "TOO TIGHT" : plan.state === "under" ? "LOOSE" : "BALANCED"}</b><small>${formatValue(plan.projection, model.unit, true)} projected / ${formatValue(plan.target, model.unit, true)} target</small></div>${powerSwitch(model)}</header>
    <div class="mux-h-tools">${controlDeck(model)}</div>
    <main class="mux-h-layout"><section class="mux-h-fabric"><header><div><span>${formatMonth(model.month)} / THREAD DENSITY</span><h2>Where did the month tighten?</h2></div>${legend(model)}</header>${loomChart(model)}</section><aside class="mux-h-bench">${manualReadingList(model, "loom")}${courseControls(model, "loom")}</aside>${promptCoach(model, "loom", 8)}<section class="mux-h-proof">${evidence(model, 10)}</section></main>
  </div>`;
}

function boardPath(model) {
  const plan = monthPlanning(model);
  const hygiene = promptHygiene(model);
  const peak = Math.max(1, ...model.view.daily.map((day) => day.total));
  const trapDays = new Map();
  for (const incident of hygiene.incidents) trapDays.set(incident.event.day, (trapDays.get(incident.event.day) || 0) + 1);
  const readingDays = new Map(plan.readings.map((reading) => [reading.date, reading.value]));
  const finishScale = Math.max(1, plan.baseBudget * 1.5, plan.target * 1.15, plan.projection * 1.05, plan.used * 1.05);
  const finishPercent = (value) => Math.max(0, Math.min(100, value / finishScale * 100)).toFixed(2);
  const finishStyle = `--spent:${finishPercent(plan.used)}%;--forecast:${finishPercent(plan.projection)}%;--goal-start:${finishPercent(plan.baseBudget * .95)}%;--goal-end:${finishPercent(plan.baseBudget * 1.05)}%;--base:${finishPercent(plan.baseBudget)}%;--approved:${finishPercent(plan.target)}%`;
  const finishImpactLabel = plan.unapprovedOverrun > 0
    ? plan.isFinal ? "UNAPPROVED DAMAGE" : "PROJECTED OVERRUN"
    : plan.finishValue < plan.baseBudget
      ? "LEFT UNUSED"
      : plan.usedBooster
        ? "BOOSTER COST"
        : "DISTANCE FROM TARGET";
  const finishImpactValue = plan.unapprovedOverrun > 0
    ? formatValue(plan.unapprovedOverrun, model.unit, true)
    : plan.finishValue < plan.baseBudget
      ? formatValue(plan.baseBudget - plan.finishValue, model.unit, true)
      : plan.usedBooster
        ? `−${plan.boosterPenalty} points`
        : formatValue(Math.abs(plan.originalDifference), model.unit, true);
  const accuracyExplanation = `${plan.isFinal ? "Final cost" : "Your velocity forecast"} lands ${formatValue(Math.abs(plan.originalDifference), model.unit, true)} from the original ${formatValue(plan.baseBudget, model.unit, true)} mission. Start at 100; lose one point for every 1% away.`;
  const boosterExplanation = plan.boosterPenalty
    ? `${plan.additions.length} approved booster${plan.additions.length === 1 ? "" : "s"} kept the extra spend legal, but rescue money costs ${plan.boosterPenalty} points.`
    : "No approved boosters are propping up this run, so nothing is deducted here.";
  const overrunExplanation = plan.overrunPenalty
    ? `${plan.isFinal ? "The final cost crossed" : "Your forecast crosses"} the total approved line by ${formatValue(plan.unapprovedOverrun, model.unit, true)}, costing ${plan.overrunPenalty} points.`
    : `${plan.isFinal ? "The final cost stayed" : "Your forecast stays"} inside the total approved budget, so there is no illegal-overspend penalty.`;
  return `<div class="mux-board" role="img" aria-label="A month board game. Each square is a day, colour is usage intensity, traps are possible prompt bad practices, and flags are manual GitHub readings.">${model.view.daily.map((day, index) => {
    const row = Math.floor(index / 7);
    const naturalColumn = index % 7;
    const column = row % 2 ? 7 - naturalColumn : naturalColumn + 1;
    const traps = trapDays.get(day.day) || 0;
    const reading = readingDays.get(day.day);
    const isNow = index + 1 === plan.elapsed;
    return `<button class="mux-board-space ${day.day === model.selectedDay ? "is-selected" : ""} ${isNow ? "is-now" : ""}" data-action="day" data-day="${day.day}" style="grid-column:${column};grid-row:${row + 1};--heat:${16 + day.total / peak * 64}%;--space:${ORIGIN_COLORS[dominantOrigin(day)] || ORIGIN_COLORS.other}"><span>DAY ${String(index + 1).padStart(2, "0")}</span><b>${formatValue(day.total, model.unit, true)}</b><small>${day.events.length} requests</small>${traps ? `<i class="mux-board-trap">${traps}<em>prompt trap${traps === 1 ? "" : "s"}</em></i>` : ""}${reading != null ? `<i class="mux-board-flag">PROVIDER<br><b>${formatValue(reading, model.unit, true)}</b></i>` : ""}${isNow ? `<i class="mux-board-player">YOU</i>` : ""}</button>`;
  }).join("")}<div class="mux-board-finish" data-finish="${plan.performanceTone}" data-climate="${plan.paceClimate}" data-trend="${plan.velocityTrend}" style="${finishStyle}"><i class="mux-finish-weather" aria-hidden="true"></i><section class="mux-finish-drama"><span>${escapeHtml(plan.dramaEyebrow)}</span><h3>${escapeHtml(plan.dramaTitle)}</h3><p>${escapeHtml(plan.dramaQuip)}</p><strong>${escapeHtml(plan.paceStory)}</strong></section><section class="mux-finish-score"><span>${plan.isFinal ? "FINAL VERDICT" : "PACE VERDICT"}: ${escapeHtml(plan.ratingVerdict)}</span><b>${plan.ratingScore}<small>/100</small></b><em>GRADE ${plan.ratingGrade}</em><small>${escapeHtml(plan.ratingBasis)}</small></section><div class="mux-finish-facts"><span><small>ORIGINAL BUDGET</small><b>${formatValue(plan.baseBudget, model.unit, true)}</b></span><span><small>TOTAL APPROVED</small><b>${formatValue(plan.target, model.unit, true)}</b></span><span><small>SPENT SO FAR</small><b>${formatValue(plan.used, model.unit, true)}</b></span><span><small>${plan.isFinal ? "FINAL MONTH COST" : "IF THIS PACE CONTINUES"}</small><b>${formatValue(plan.projection, model.unit, true)}</b></span><span><small>${finishImpactLabel}</small><b>${finishImpactValue}</b></span></div><div class="mux-finish-legend"><span class="is-good">GOLD ZONE = finish within 5% of original budget</span><span class="is-booster">BOOSTER ZONE = approved overspend, but it costs points</span></div><div class="mux-finish-track" aria-label="Spent so far and velocity forecast compared with original and approved budgets"><i class="mux-finish-approved" aria-hidden="true"></i><i class="mux-finish-goal" aria-hidden="true"></i><i class="mux-finish-target"><span>GOLD MISSION</span><b>${formatValue(plan.baseBudget, model.unit, true)}</b><em>FINISH HERE</em></i><b class="mux-finish-spent">SPENT · ${formatValue(plan.used, model.unit, true)}</b><b class="mux-finish-marker">${plan.isFinal ? "FINAL" : "PACE FORECAST"} · ${formatValue(plan.projection, model.unit, true)}</b></div><div class="mux-finish-math"><header><span>WHY THIS SCORE?</span><b>${plan.ratingScore}/100</b></header><section><article><b>${plan.accuracyScore}</b><span><strong>BUDGET AIM</strong><small>${escapeHtml(accuracyExplanation)}</small></span></article><article><b>−${plan.boosterPenalty}</b><span><strong>BOOSTER COST</strong><small>${escapeHtml(boosterExplanation)}</small></span></article><article><b>−${plan.overrunPenalty}</b><span><strong>UNAPPROVED OVERSPEND</strong><small>${escapeHtml(overrunExplanation)}</small></span></article></section><footer>${plan.accuracyScore} budget aim − ${plan.boosterPenalty} booster − ${plan.overrunPenalty} unapproved overspend = <b>${plan.ratingScore}/100</b><small>${escapeHtml(plan.ratingBasisDetail)}</small></footer></div>${plan.efficiencySignal ? `<div class="mux-finish-efficiency"><b>CHEAPER MACHINERY?</b><span>Recent ${unitLabel(model.unit)} per request fell ${plan.efficiencySignal.percent}%. Something changed in the setup or prompting—open FORENSICS and verify what.</span></div>` : ""}${plan.usedBooster ? `<strong class="mux-finish-booster">⚡ BOOSTER ×${plan.additions.length} USED</strong>` : ""}</div></div>`;
}

function VariantI(model) {
  const plan = monthPlanning(model);
  return `<div class="mux mux-i">
    <header class="mux-i-head"><div><span>SAXJAX / PLAYABLE FORECAST</span><h1>Run the month</h1><p>Your AI usage is a board, not a bill. Move day by day, spot prompt traps, punch in provider checkpoints, and change speed before the finish.</p>${planningNavigator(model)}</div><div class="mux-i-score" data-climate="${plan.paceClimate}"><span>MONTH ${unitLabel(model.unit).toUpperCase()}</span><section><small>SPENT SO FAR</small><b>${formatValue(plan.used, model.unit, true)}</b></section><section><small>${plan.isFinal ? "FINAL MONTH COST" : "IF THIS PACE CONTINUES"}</small><b>${formatValue(plan.projection, model.unit, true)}</b></section><footer>${plan.isFinal ? "MONTH CLOSED" : `${plan.remainingDays} days left · ${formatValue(plan.velocity, model.unit, true)}/day`}</footer></div>${powerSwitch(model)}</header>
    ${controlDeck(model)}
    <main class="mux-i-layout"><section class="mux-i-game"><header><div><span>${formatMonth(model.month)} / CURRENT + HISTORIC ${unitLabel(model.unit).toUpperCase()}</span><h2>${plan.isFinal ? "FINAL" : "PACE"} VERDICT: ${escapeHtml(plan.ratingVerdict)} · ${plan.ratingScore}/100</h2><p>${escapeHtml(plan.ratingBasisDetail)}</p></div><div class="mux-i-forecast" data-climate="${plan.paceClimate}"><span><small>SPENT SO FAR</small><b>${formatValue(plan.used, model.unit, true)}</b></span><span><small>${plan.isFinal ? "FINAL MONTH COST" : "IF THIS PACE CONTINUES"}</small><b>${formatValue(plan.projection, model.unit, true)}</b></span><footer>${escapeHtml(plan.trendLabel)} · ${formatValue(plan.scenarioVelocity, model.unit, true)}/day</footer></div></header>${boardPath(model)}</section><aside class="mux-i-referee">${courseControls(model, "board")}${manualReadingList(model, "board")}</aside>${promptCoach(model, "board", 7)}<section class="mux-i-evidence"><header class="mux-i-forensics-title"><span>ACTUAL MACHINE RECORDS</span><h2>FORENSICS</h2><p>Open the real request papers: complete locally retained IN, OUT, reasoning, tools, and source records.</p></header>${evidence(model, 10)}</section></main>
  </div>`;
}

function classicCalendarHeatmap(model) {
  const days = model.view.daily;
  const peak = Math.max(1, ...days.map((day) => day.total));
  const firstWeekday = new Date(`${days[0]?.day || `${model.month}-01`}T12:00:00`).getDay() + 1;
  const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `<div class="mux-a0-calendar-grid" aria-label="Daily usage calendar; colour intensity represents ${escapeHtml(unitLabel(model.unit))}">
    ${weekdayLabels.map((label) => `<span class="mux-a0-weekday">${label.slice(0, 3)}</span>`).join("")}
    ${days.map((day, index) => {
      const intensity = Math.max(4, day.total / peak * 100);
      const origin = dominantOrigin(day);
      const weekday = weekdayLabels[new Date(`${day.day}T12:00:00`).getDay()];
      const evidence = day.events.length
        ? `${day.events.length} recorded request${day.events.length === 1 ? "" : "s"}${day.missing ? ` · ${day.missing} without ${unitLabel(model.unit)} measurement` : " · all values measured"}`
        : "No recorded requests";
      return `<button class="mux-a0-calendar-day ${day.day === model.selectedDay ? "is-selected" : ""} ${day.events.length ? "has-usage" : "is-empty"}" data-action="day" data-day="${day.day}" style="--intensity:${intensity}%;--day-color:${ORIGIN_COLORS[origin] || ORIGIN_COLORS.other};${index === 0 ? `grid-column:${firstWeekday}` : ""}">
        <time datetime="${day.day}"><b>${day.day.slice(-2)}</b><span>${weekday} · ${formatMonth(model.month, true)}</span></time>
        <strong>${day.events.length ? formatLabeledValue(day.total, model.unit, true) : "No usage"}</strong><small>${evidence}</small><i aria-hidden="true"><em></em></i>
      </button>`;
    }).join("")}
  </div>`;
}

function VariantA0(model) {
  return `<div class="mux mux-a0">
    ${commonHeader(model, "Observatory, rebuilt", "The current default reworked as a burn-first command center: monthly pattern, machine state, and readable communication evidence without unexplained numbers.")}
    ${controlDeck(model)}
    ${throughputPanel(model)}
    <main class="mux-a0-layout">
      <section class="mux-a0-timeline"><header><span>02 / Calendar intensity · each cell names its value and evidence</span><h2>Which days changed the burn?</h2>${legend(model)}</header>${classicCalendarHeatmap(model)}</section>
      <aside class="mux-a0-system"><header><span>03 / Machine condition · live percentages</span><h2>Can local work absorb more?</h2></header>${systemStrip(model)}${truthPanel(model)}</aside>
      <section class="mux-a0-wire"><header><span>04 / AI communication wire · newest evidence first</span><h2>What created the usage?</h2><small>${model.view.monthEvents.length.toLocaleString()} recorded requests · ${formatMonth(model.month)}</small></header>${evidence(model, 18)}</section>
    </main>
    ${analysisDock(model)}
  </div>`;
}

const CUSTOM_SECTION_LABELS = {
  throughput: "Throughput", timeline: "Usage timeline", spikes: "Spike ranking", evidence: "Prompt and request evidence", system: "Live system state",
  sessions: "Parallel session lanes", resources: "Usage and resource correlation", accumulated: "Accumulated usage", "provider-evidence": "Provider evidence",
};

const DEFAULT_CUSTOM_LAYOUT = {
  shellVariant: "A",
  sections: [
    ["throughput", "A"], ["timeline", "A"], ["spikes", "B"], ["evidence", "E"],
    ["system", "C"], ["sessions", "A"], ["resources", "C"], ["accumulated", "B"], ["provider-evidence", "E"],
  ].map(([id, sourceVariant]) => ({ id, sourceVariant, enabled: true })),
};

function normalizedCustomLayout(layout) {
  const source = layout && typeof layout === "object" ? layout : DEFAULT_CUSTOM_LAYOUT;
  const sections = Array.isArray(source.sections) ? structuredClone(source.sections) : structuredClone(DEFAULT_CUSTOM_LAYOUT.sections);
  if (!sections.some((section) => section.id === "throughput")) sections.unshift({ id: "throughput", sourceVariant: "A", enabled: true });
  else sections.find((section) => section.id === "throughput").enabled = true;
  return { shellVariant: ["A0", "A", "B", "C", "D", "E"].includes(source.shellVariant) ? source.shellVariant : "A", sections };
}

function customTimeline(model, source) {
  const selected = model.view.slots.find((slot) => slot.id === model.selectedSlotId) || model.view.peakSlot;
  if (source === "A0") return `<section class="mux-a0-timeline"><header><span>CALENDAR INTENSITY · EVERY CELL NAMES ITS VALUE</span><h2>Which days changed the burn?</h2>${legend(model)}</header>${classicCalendarHeatmap(model)}</section>`;
  if (source === "A") return `<section class="mux-a-chart"><div class="mux-section-title"><span>${model.zoom === "month" ? "COST ALTITUDE BY DAY" : `${model.selectedDay} INVESTIGATION`}</span><h2>Trace the flight path</h2>${legend(model)}</div>${flightPathChart(model, 285, model.zoom === "month")}<div class="mux-day-slice"><header><span>${model.selectedDay} · approach path</span><strong>Peak interval · ${formatLabeledValue(model.view.slots.filter((slot) => slot.day === model.selectedDay).reduce((peak, slot) => Math.max(peak, slot.total), 0), model.unit)}</strong></header>${flightPathChart(model, 190, false)}</div></section>`;
  if (source === "B") return `<section class="mux-b-scope"><div class="mux-b-scopehead"><span>Seismic ${unitLabel(model.unit)}</span><strong>${formatLabeledValue(model.view.total, model.unit)}</strong><small>Every spring is an exact 30-minute contribution.</small></div>${seismographChart(model, 330)}<div class="mux-b-selected"><span>Selected interval</span><b>Day ${selected.day.slice(-2)} · ${clock(selected.bucket * 30)}</b><strong>${formatLabeledValue(selected.total, model.unit)}</strong><small>${selected.events.length} recorded requests</small></div></section>`;
  if (source === "C") return `<section class="mux-c-usage"><header><span>${model.zoom === "month" ? "MONTH ORBIT" : `${model.selectedDay} ORBIT`}</span><h2>Inference orbit</h2><p>Distance and node size are usage; colour is source.</p>${legend(model)}</header>${orbitChart(model, 440)}<div class="mux-c-ruler"><span>Quiet</span><i></i><b>Selected ${model.selectedSlotId.replace(":", " / ")}</b><i></i><span>Intense</span></div></section>`;
  if (source === "D") return `<section class="mux-d-film"><header><span>${formatMonth(model.month)} / contact exposures · ${sortLabel(model.sortDirection)}</span>${legend(model)}</header><div class="mux-contact-grid">${sortedDays(model).filter((day) => model.zoom === "month" || day.day === model.selectedDay).map((day) => dayFilm(day, model)).join("")}</div>${bubbleTimeline(model, model.selectedDay, 205)}</section>`;
  return `<section class="mux-e-horizon"><header><span>${model.zoom === "month" ? "MONTH" : "DAY"} FLOW REGISTER</span><h2>Source → incident → ledger</h2><p>Ribbon width is measured usage.</p></header>${usageFlowChart(model, 320)}</section>`;
}

function customSpikes(model, source) {
  if (source === "A") return `<aside class="mux-a-index"><span>Flight marks</span><h2>Largest jumps</h2><p>Ranked against the median occupied interval.</p>${incidentList(model, 10)}</aside>`;
  if (source === "B") return `<aside class="mux-b-quakes"><header><span>Recorded shocks</span><b>${model.view.topSlots.length}</b></header>${incidentList(model, 12)}</aside>`;
  if (source === "E") return `<aside class="mux-e-ranking"><header><span>RANK</span><span>TIME</span><span>VALUE / CAUSE</span></header>${incidentList(model, 12)}</aside>`;
  return `<aside class="mux-custom-ranking"><span>${source === "C" ? "INSTRUMENT FLAGS" : "PULLED FRAMES"}</span><h2>Intervals worth opening</h2>${incidentList(model, 12)}</aside>`;
}

function customEvidence(model, source) {
  if (source === "B") return `<aside class="mux-b-proof">${evidence(model, 24)}</aside>`;
  if (source === "D") return `<div class="mux-d-report"><span>Pulled evidence</span><h2>${model.selectedDay}</h2>${evidence(model, 24)}</div>`;
  if (source === "E") return `<section class="mux-e-selected">${evidence(model, 30)}</section>`;
  return evidence(model, 30);
}

function customSystem(model, source) {
  if (source === "C") return machineRoomPanel(model, false);
  if (source === "E") return `<aside class="mux-e-machine"><header><span>HOST LEDGER</span><b data-live="verdict">${model.system.severity.toUpperCase()}</b></header>${systemStrip(model, true)}${coreRack(model)}</aside>`;
  return systemStrip(model, source !== "B");
}

function customSection(model, section) {
  const source = section.sourceVariant || "A";
  let content = "";
  if (section.id === "throughput") content = throughputPanel(model, false, source);
  if (section.id === "timeline") content = customTimeline(model, source);
  if (section.id === "spikes") content = customSpikes(model, source);
  if (section.id === "evidence") content = customEvidence(model, source);
  if (section.id === "system") content = customSystem(model, source);
  if (section.id === "sessions") content = sessionLanes(model);
  if (section.id === "resources") content = resourceCorrelation(model);
  if (section.id === "accumulated") content = cumulativeNavigator(model);
  if (section.id === "provider-evidence") content = truthPanel(model);
  return `<section class="mux mux-${source.toLowerCase()} mux-custom-piece" data-piece="${section.id}" data-source-variant="${source}"><header class="mux-piece-label"><span>${escapeHtml(CUSTOM_SECTION_LABELS[section.id] || section.id)}</span><b>FROM ${source} · ${escapeHtml(VARIANTS[source])}</b></header>${content}</section>`;
}

function CustomView(model, layout) {
  const resolvedLayout = normalizedCustomLayout(layout);
  const visible = resolvedLayout.sections.filter((section) => section.enabled !== false);
  const shell = resolvedLayout.shellVariant;
  return `<div class="mux mux-custom" data-shell="${shell}">
    <header class="mux-custom-head"><div><span>MY MONITOR / SHELL ${shell}</span><h1>Usage, assembled.</h1><p>One live monitor composed from the prototype instruments you chose.</p></div><div class="mux-custom-period"><label>Period<select data-action="month">${model.months.map((item) => `<option value="${item}" ${item === model.month ? "selected" : ""}>${formatMonth(item)}</option>`).join("")}</select></label><div class="mux-unit">${[["tokens", "Tokens"], ["credits", "Provider units"], ["dollars", "Money"]].map(([key, label]) => `<button data-action="unit" data-unit="${key}" class="${model.unit === key ? "is-active" : ""}" ${model.capabilities[key].available ? "" : "disabled"}>${label}</button>`).join("")}</div></div><div class="mux-custom-total"><span>${formatMonth(model.month)} total</span><strong>${model.capabilities[model.unit].available ? formatLabeledValue(model.view.total, model.unit) : `${unitLabel(model.unit)} unavailable`}</strong>${powerSwitch(model)}</div></header>
    ${controlDeck(model)}
    <div class="mux-recipe"><span>BUILD YOUR OWN UI · ${visible.length} live sections · frame from ${shell}</span><p>${visible.map((section) => `${CUSTOM_SECTION_LABELS[section.id]} ${section.sourceVariant}`).join(" · ")}</p><button data-action="layout-studio">Edit layout</button></div>
    <main class="mux-custom-grid">${visible.map((section) => customSection(model, section)).join("")}</main>
  </div>`;
}

async function startMonitorPrototype() {
  document.documentElement.classList.add("monitor-ux-prototype-active");
  const root = document.createElement("div");
  root.id = "monitor-ux-prototype-root";
  document.body.prepend(root);

  // A0 is the real monitor, not a reconstruction. Keep the production nodes
  // alive while other throwaway variants are open so app.js and the timeline
  // renderer retain their event listeners and live state.
  const classicParking = document.createElement("div");
  classicParking.id = "monitor-classic-parking";
  classicParking.hidden = true;
  document.body.appendChild(classicParking);
  const classicNodes = [
    document.querySelector("body > .grain"),
    document.querySelector("body > .masthead"),
    document.querySelector("body > main"),
  ].filter(Boolean);
  const parkClassic = () => classicNodes.forEach((node) => classicParking.appendChild(node));
  const mountClassic = (host) => classicNodes.forEach((node) => host.appendChild(node));
  parkClassic();

  const [timelineResponse, stateResponse, feedbackResponse] = await Promise.all([
    fetch("/monitor/api/usage-timeline", { cache: "no-store" }),
    // The durable timeline already supplies historical evidence. Fetch only
    // active gateway traffic here so the same multi-megabyte history is not
    // downloaded and parsed a second time during prototype startup.
    fetch("/monitor/api/state?compact=1", { cache: "no-store" }),
    fetch("/monitor/api/prototype-feedback", { cache: "no-store" }),
  ]);
  const timeline = await timelineResponse.json();
  let feedbackSnapshot = await feedbackResponse.json();
  let liveState = await stateResponse.json();
  let events = normalizeEvents(timeline);
  const liveEvents = new Map();
  const mergeLiveEvents = () => {
    const durableIds = new Set(events.map((event) => event.id));
    events = [...events, ...[...liveEvents.values()].filter((event) => !durableIds.has(event.id))]
      .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  };
  const fallbackMonth = localParts(new Date().toISOString()).month;
  let months = [...new Set(events.map((event) => event.month))].sort();
  if (!months.length) months = [fallbackMonth];
  let preferredView = feedbackSnapshot.preferredView || { mode: "classic", variant: "A", layout: { shellVariant: "A", sections: [] } };
  const openPreferred = params.get("view") === "preferred";
  let customMode = params.get("layout") === "custom" || (openPreferred && preferredView.mode === "custom");
  const requestedVariant = params.get("variant")?.toUpperCase();
  let variant = VARIANTS[requestedVariant] ? requestedVariant : openPreferred && preferredView.mode === "variant" ? preferredView.variant : customMode ? preferredView.layout?.shellVariant || "A" : "A";
  if (requestedVariant === "G") customMode = true;
  let unit = ["tokens", "credits", "dollars"].includes(params.get("unit")) ? params.get("unit") : "credits";
  let month = months.includes(params.get("month")) ? params.get("month") : months.reduce((latest, item) => events.filter((event) => event.month === item).length >= 10 ? item : latest, months.at(-1));
  let referenceMonth = months.includes(params.get("reference")) && params.get("reference") !== month ? params.get("reference") : null;
  let selectedDay = params.get("day");
  let selectedSlotId = params.get("slot");
  let selectedSessionId = params.get("session");
  let selectedEvidenceEventId = params.get("request");
  let openPromptEventId = params.get("prompt");
  let zoom = ["month", "day", "slot", "session"].includes(params.get("zoom")) ? params.get("zoom") : "month";
  let anomalyMode = ["value", "jump", "unusual"].includes(params.get("anomaly")) ? params.get("anomaly") : "value";
  let threshold = Math.max(0, Number(params.get("threshold")) || 0);
  let sortDirection = globalThis.SaxjaxDateTimeSort.normalize(params.get("sort"));
  let controlsOpen = false;
  const filters = {
    provider: params.get("provider") || "all",
    origin: params.get("origin") || "all",
    model: params.get("model") || "all",
    search: params.get("search") || "",
  };
  let powerPending = false;
  let powerError = "";
  let manualReadings = [];
  let manualReadingDate = new Date().toISOString().slice(0, 10);
  const forecastTokenTotal = Number(liveState.copilot?.forecast?.inputTokens || 0) + Number(liveState.copilot?.forecast?.outputTokens || 0);
  const initialTokenTarget = Math.max(1, Math.ceil(Math.max(forecastTokenTotal, Number(liveState.copilot?.observedInputTokens || 0) + Number(liveState.copilot?.observedOutputTokens || 0)) / 10_000) * 10_000);
  let baseBudgets = {
    credits: 20_000,
    dollars: 200,
    tokens: initialTokenTarget,
  };
  let budgetAdditions = [];
  let budgetAdditionDate = new Date().toISOString().slice(0, 10);
  let paceScenario = 100;
  const liveSamples = [];
  let feedbackLab;

  function rememberSystemSample() {
    liveSamples.push({ at: new Date().toISOString(), system: systemView(liveState) });
    if (liveSamples.length > 3600) liveSamples.splice(0, liveSamples.length - 3600);
  }

  rememberSystemSample();

  function capabilityModel(filteredEvents) {
    const selected = filteredEvents.filter((event) => event.month === month);
    const nativeMeasured = selected.filter((event) => Number.isFinite(event.credits));
    const nativeProviders = [...new Set(nativeMeasured.map((event) => event.provider))];
    const tokenMeasured = selected.filter((event) => Number.isFinite(event.tokens));
    const moneyMeasured = selected.filter((event) => Number.isFinite(event.dollars));
    const nativeCompatible = nativeProviders.length <= 1;
    const providers = [...new Set(selected.map((event) => event.provider))];
    const evidenceLabel = (measured) => measured.length === selected.length && measured.length ? "client-reported" : measured.length ? "partial client record" : "not supplied";
    return {
      tokens: { available: tokenMeasured.length > 0, confidence: evidenceLabel(tokenMeasured), note: `${tokenMeasured.length.toLocaleString()} of ${selected.length.toLocaleString()} requests include token evidence.` },
      credits: { available: nativeMeasured.length > 0 && nativeCompatible, confidence: nativeCompatible ? evidenceLabel(nativeMeasured) : "not aggregatable", note: nativeCompatible ? `${nativeMeasured.length.toLocaleString()} of ${selected.length.toLocaleString()} requests include the provider's native unit.` : "Multiple providers use different native units; choose one provider before aggregating." },
      dollars: { available: moneyMeasured.length > 0 && moneyMeasured.length === nativeMeasured.length, confidence: moneyMeasured.length ? "local prototype estimate" : "not supplied", note: moneyMeasured.length ? `${moneyMeasured.length.toLocaleString()} requests use the prototype Copilot rule of 1 credit = $0.01; this is not authoritative billing.` : "No versioned money conversion is available for this selection." },
      providers,
    };
  }

  function filteredTimelineEvents() {
    const search = filters.search.trim().toLocaleLowerCase();
    return events.filter((event) => {
      if (filters.provider !== "all" && event.provider !== filters.provider) return false;
      if (filters.origin !== "all" && event.origin !== filters.origin) return false;
      if (filters.model !== "all" && event.model !== filters.model) return false;
      if (search && !`${event.prompt} ${event.source} ${event.sessionId} ${event.model}`.toLocaleLowerCase().includes(search)) return false;
      return true;
    });
  }

  function model() {
    const filteredEvents = filteredTimelineEvents();
    const capabilities = capabilityModel(filteredEvents);
    const view = buildView(filteredEvents, month, unit, anomalyMode, threshold);
    const referenceView = referenceMonth ? buildView(filteredEvents, referenceMonth, unit, anomalyMode, threshold) : null;
    if (!view.slots.some((slot) => slot.id === selectedSlotId)) selectedSlotId = view.peakSlot.id;
    if (!view.days.includes(selectedDay)) selectedDay = view.slots.find((slot) => slot.id === selectedSlotId)?.day || view.peakDay.day;
    if (selectedSessionId && !view.monthEvents.some((event) => event.sessionId === selectedSessionId)) selectedSessionId = null;
    if (selectedEvidenceEventId && !view.monthEvents.some((event) => event.id === selectedEvidenceEventId)) selectedEvidenceEventId = null;
    const providers = [...new Set(events.map((event) => event.provider))].sort();
    const origins = [...new Set(events.map((event) => event.origin))].sort();
    const models = [...new Set(events.map((event) => event.model))].sort();
    const providerLabels = Object.fromEntries(providers.map((provider) => [provider, PROVIDER_RULES[provider]?.label || provider]));
    const billingReads = capabilities.providers.length > 0 && capabilities.providers.every((provider) => PROVIDER_RULES[provider]?.billingReads === true);
    return {
      variant, customMode, unit, month, months, referenceMonth, view, referenceView, selectedDay, selectedSlotId, selectedSessionId, selectedEvidenceEventId, openPromptEventId, zoom, anomalyMode, threshold, sortDirection, controlsOpen,
      filters, filteredEvents, capabilities, billingReads, copilot: liveState.copilot || {}, system: systemView(liveState), liveSamples, powerPending, powerError,
      manualReadings, manualReadingDate, baseBudgets, budgetAdditions, budgetAdditionDate, paceScenario, traffic: [...(liveState.history || []), ...(liveState.active || [])],
      options: { providers, origins, models, providerLabels },
    };
  }

  function render() {
    const openPaper = root.querySelector(".mux-evidence-paper[open]");
    const openPaperTop = openPaper?.getBoundingClientRect().top;
    const openSheet = openPaper?.querySelector(".mux-evidence-sheet");
    const evidenceSnapshot = openPaper && openSheet?.dataset.loaded === "true" ? {
      eventId: openPaper.dataset.eventId,
      input: openSheet.querySelector("[data-paper-input]")?.textContent || "",
      output: openSheet.querySelector("[data-paper-output]")?.textContent || "",
      reasoning: openSheet.querySelector("[data-paper-reasoning]")?.textContent || "",
      status: openSheet.querySelector("[data-paper-status]")?.textContent || "Actual local journal loaded",
    } : null;
    const scrollSnapshot = { x: window.scrollX, y: window.scrollY };
    const activeField = root.contains(document.activeElement) && document.activeElement.matches("input, textarea, select") ? document.activeElement : null;
    const focusSnapshot = activeField ? {
      formAction: activeField.closest("form[data-action]")?.dataset.action || null,
      name: activeField.getAttribute("name"),
      dataAction: activeField.dataset.action || null,
      value: activeField.value,
      selectionStart: activeField.selectionStart,
      selectionEnd: activeField.selectionEnd,
    } : null;
    const current = model();
    syncUrl();
    const views = { A: VariantA, B: VariantB, C: VariantC, D: VariantD, E: VariantE, F: VariantF, H: VariantH, I: VariantI };
    parkClassic();
    root.className = `monitor-ux-root reading-${prototypeDetailLevel} ${customMode ? "variant-custom" : variant === "A0" ? "variant-a0-native" : `variant-${variant.toLowerCase()}`}`;
    const browserLabEntry = labEnabled ? "" : `<a class="mux-lab-entry" href="/monitor/?prototype=monitor&view=preferred">Prototype lab</a>`;
    const readingDetailControl = detailToggle();
    if (!customMode && variant === "A0") {
      root.innerHTML = `<div class="mux-classic-host" data-feedback-id="classic-monitor" data-feedback-kind="prototype" data-feedback-label="Complete Classic monitor"></div>${browserLabEntry}${readingDetailControl}`;
      mountClassic(root.querySelector(".mux-classic-host"));
    } else {
      const view = customMode ? CustomView(current, preferredView.layout) : views[variant](current);
      root.innerHTML = `${view}${browserLabEntry}${readingDetailControl}`;
    }
    let replacementPaper = null;
    if (evidenceSnapshot) {
      replacementPaper = [...root.querySelectorAll(".mux-evidence-paper")].find((paper) => paper.dataset.eventId === evidenceSnapshot.eventId) || null;
      const replacementSheet = replacementPaper?.querySelector(".mux-evidence-sheet");
      if (replacementSheet) {
        replacementSheet.dataset.loaded = "true";
        const input = replacementSheet.querySelector("[data-paper-input]");
        const output = replacementSheet.querySelector("[data-paper-output]");
        const reasoning = replacementSheet.querySelector("[data-paper-reasoning]");
        const status = replacementSheet.querySelector("[data-paper-status]");
        if (input) input.textContent = evidenceSnapshot.input;
        if (output) output.textContent = evidenceSnapshot.output;
        if (status) status.textContent = evidenceSnapshot.status;
        if (reasoning && evidenceSnapshot.reasoning) {
          reasoning.textContent = evidenceSnapshot.reasoning;
          reasoning.closest("section").hidden = false;
        }
      }
    }
    document.title = customMode ? "My mixed monitor — Saxjax" : `${variant} — ${VARIANTS[variant]} — Saxjax ${labEnabled ? "prototype" : "Monitor"}`;
    bind();
    feedbackLab?.decorate();
    if (replacementPaper && Number.isFinite(openPaperTop)) {
      const replacementTop = replacementPaper.getBoundingClientRect().top;
      window.scrollBy(0, replacementTop - openPaperTop);
    } else {
      window.scrollTo(scrollSnapshot.x, scrollSnapshot.y);
    }
    if (focusSnapshot) {
      const selector = focusSnapshot.formAction && focusSnapshot.name
        ? `form[data-action="${focusSnapshot.formAction}"] [name="${focusSnapshot.name}"]`
        : focusSnapshot.dataAction ? `[data-action="${focusSnapshot.dataAction}"]` : null;
      const replacement = selector ? root.querySelector(selector) : null;
      if (replacement) {
        replacement.value = focusSnapshot.value;
        replacement.focus({ preventScroll: true });
        if (focusSnapshot.selectionStart != null && typeof replacement.setSelectionRange === "function") {
          replacement.setSelectionRange(focusSnapshot.selectionStart, focusSnapshot.selectionEnd);
        }
      }
    }
  }

  function syncUrl() {
    params.set("prototype", "monitor");
    params.set("variant", variant);
    params.delete("view");
    if (customMode) params.set("layout", "custom"); else params.delete("layout");
    params.set("unit", unit);
    params.set("month", month);
    params.set("day", selectedDay);
    params.set("slot", selectedSlotId);
    if (referenceMonth) params.set("reference", referenceMonth); else params.delete("reference");
    if (selectedSessionId) params.set("session", selectedSessionId); else params.delete("session");
    if (selectedEvidenceEventId) params.set("request", selectedEvidenceEventId); else params.delete("request");
    if (openPromptEventId) params.set("prompt", openPromptEventId); else params.delete("prompt");
    params.set("zoom", zoom);
    params.set("anomaly", anomalyMode);
    if (sortDirection === "asc") params.set("sort", "asc"); else params.delete("sort");
    if (threshold > 0) params.set("threshold", String(threshold)); else params.delete("threshold");
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== "all") params.set(key, value); else params.delete(key);
    }
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }

  function stepVariant(step) {
    if (customMode) return;
    const keys = VISUAL_VARIANTS;
    feedbackLab?.track("navigation.variant");
    variant = keys[(keys.indexOf(variant) + step + keys.length) % keys.length];
    syncUrl();
    render();
    feedbackLab?.variantChanged(variant);
  }

  function moveSlot(key) {
    const current = model();
    const index = current.view.slots.findIndex((slot) => slot.id === selectedSlotId);
    const delta = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : key === "ArrowUp" ? -48 : 48;
    const next = current.view.slots[Math.max(0, Math.min(current.view.slots.length - 1, index + delta))];
    if (!next) return;
    selectedSlotId = next.id;
    selectedDay = next.day;
    selectedSessionId = null;
    selectedEvidenceEventId = null;
    zoom = "slot";
    feedbackLab?.track("navigation.timeline-keyboard", "inspection-scale");
    syncUrl();
    render();
    requestAnimationFrame(() => root.querySelector("[data-timeline-keyboard]")?.focus());
  }

  function bind() {
    const keepOneOpen = (details, selector) => {
      if (!details.open) return;
      root.querySelectorAll(selector).forEach((other) => { if (other !== details) other.open = false; });
    };
    const revealEvidencePaper = (details) => requestAnimationFrame(() => {
      if (!details?.open) return;
      const list = details.closest(".mux-evidence-list");
      if (!list) return;
      const listBox = list.getBoundingClientRect();
      const paperBox = details.getBoundingClientRect();
      list.scrollTop = Math.max(0, list.scrollTop + paperBox.top - listBox.top - 12);
    });
    const hydrateEvidencePaper = async (details) => {
      const sheet = details.querySelector(".mux-evidence-sheet");
      if (!sheet || sheet.dataset.loaded === "true" || sheet.dataset.loading === "true") return;
      const status = sheet.querySelector("[data-paper-status]");
      if (!details.dataset.captureClient || !details.dataset.captureSession || !details.dataset.captureRequest) {
        if (status) status.textContent = "Full journal identity is unavailable; showing the durable excerpt.";
        sheet.dataset.loaded = "true";
        return;
      }
      sheet.dataset.loading = "true";
      if (status) status.textContent = "Opening the original local request journal…";
      try {
        const query = new URLSearchParams({ client: details.dataset.captureClient, session: details.dataset.captureSession, request: details.dataset.captureRequest });
        const response = await fetch(`/monitor/api/request-capture?${query}`, { cache: "no-store" });
        const capture = await response.json();
        if (!response.ok) throw new Error(capture.error || `HTTP ${response.status}`);
        const input = sheet.querySelector("[data-paper-input]");
        const output = sheet.querySelector("[data-paper-output]");
        const reasoning = sheet.querySelector("[data-paper-reasoning]");
        if (input) input.textContent = capture.input || capture.submitted || "No locally retained input content.";
        if (output) output.textContent = capture.output || "No locally retained output content.";
        if (reasoning && capture.reasoning) {
          reasoning.textContent = capture.reasoning;
          reasoning.closest("section").hidden = false;
        }
        if (status) status.textContent = `Original local journal loaded · ${capture.inputStatus || "captured"}`;
        sheet.dataset.loaded = "true";
      } catch (error) {
        if (status) status.textContent = `${error.message}. The durable excerpt remains visible.`;
      } finally {
        delete sheet.dataset.loading;
        revealEvidencePaper(details);
      }
    };
    const releaseEvidencePaper = (details) => {
      if (details.dataset.inlineCapture === "true") return;
      const sheet = details.querySelector(".mux-evidence-sheet");
      if (!sheet) return;
      const input = sheet.querySelector("[data-paper-input]");
      const output = sheet.querySelector("[data-paper-output]");
      const reasoning = sheet.querySelector("[data-paper-reasoning]");
      const status = sheet.querySelector("[data-paper-status]");
      if (input) input.textContent = details.dataset.paperPreview || "Durable request excerpt unavailable.";
      if (output) output.textContent = details.dataset.captureRequest ? "Open the paper to load the complete output…" : "The complete output is not retained in this timeline record.";
      if (reasoning) {
        reasoning.textContent = "";
        reasoning.closest("section").hidden = true;
      }
      if (status) status.textContent = details.dataset.captureRequest ? "Open FORENSICS to read the original local journal" : "Only the durable timeline excerpt is available";
      sheet.dataset.loaded = "false";
    };
    root.querySelectorAll(".mux-prompt-case").forEach((details) => details.addEventListener("toggle", () => {
      if (details.open) {
        openPromptEventId = details.dataset.promptEvent || null;
        keepOneOpen(details, ".mux-prompt-case");
      } else if (openPromptEventId === details.dataset.promptEvent) {
        openPromptEventId = null;
      }
      syncUrl();
    }));
    root.querySelectorAll(".mux-evidence-paper").forEach((details) => {
      details.addEventListener("toggle", () => {
        if (details.open) {
          selectedEvidenceEventId = details.dataset.eventId || null;
          syncUrl();
          keepOneOpen(details, ".mux-evidence-paper");
          void hydrateEvidencePaper(details);
        } else {
          if (selectedEvidenceEventId === details.dataset.eventId) {
            selectedEvidenceEventId = null;
            syncUrl();
          }
          releaseEvidencePaper(details);
        }
      });
      if (details.open) void hydrateEvidencePaper(details);
    });
    root.querySelectorAll('[data-action="controls-toggle"]').forEach((button) => button.addEventListener("click", () => { controlsOpen = !controlsOpen; render(); }));
    root.querySelectorAll('[data-action="detail-level"]').forEach((button) => button.addEventListener("click", () => {
      prototypeDetailLevel = prototypeDetailLevel === "full" ? "essential" : "full";
      try { localStorage.setItem(PROTOTYPE_DETAIL_KEY, prototypeDetailLevel); } catch {}
      render();
    }));
    root.querySelectorAll('[data-action="unit"]').forEach((button) => button.addEventListener("click", () => { unit = button.dataset.unit; selectedSlotId = null; selectedSessionId = null; selectedEvidenceEventId = null; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="month"]').forEach((select) => select.addEventListener("change", () => { month = select.value; if (referenceMonth === month) referenceMonth = null; selectedDay = null; selectedSlotId = null; selectedSessionId = null; selectedEvidenceEventId = null; zoom = "month"; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="view-month"]').forEach((button) => button.addEventListener("click", () => { month = button.dataset.month; if (referenceMonth === month) referenceMonth = null; selectedDay = null; selectedSlotId = null; selectedSessionId = null; selectedEvidenceEventId = null; zoom = "month"; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="day"]').forEach((element) => element.addEventListener("click", () => { selectedDay = element.dataset.day; const daySlots = model().view.slots.filter((slot) => slot.day === selectedDay); selectedSlotId = daySlots.reduce((peak, slot) => slot.total > peak.total ? slot : peak, daySlots[0]).id; selectedSessionId = null; selectedEvidenceEventId = null; zoom = "day"; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="slot"]').forEach((element) => element.addEventListener("click", (event) => { event.stopPropagation(); selectedSlotId = element.dataset.slot; selectedDay = selectedSlotId.slice(0, 10); selectedSessionId = null; selectedEvidenceEventId = null; zoom = "slot"; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="session"]').forEach((element) => element.addEventListener("click", () => {
      const jumpToForensics = element.dataset.jump === "forensics";
      selectedSessionId = element.dataset.session;
      selectedEvidenceEventId = element.dataset.event || null;
      const first = model().view.monthEvents.find((event) => event.sessionId === selectedSessionId);
      if (first) { selectedDay = first.day; selectedSlotId = `${first.day}:${first.bucket}`; }
      zoom = "session";
      syncUrl();
      render();
      if (jumpToForensics) requestAnimationFrame(() => {
        const section = root.querySelector("#mux-forensics");
        const paper = root.querySelector(".mux-evidence-paper[open]");
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (!paper) return;
        const revealPaper = () => {
          revealEvidencePaper(paper);
        };
        requestAnimationFrame(revealPaper);
        setTimeout(revealPaper, 240);
      });
    }));
    root.querySelectorAll('[data-action="filter"]').forEach((select) => select.addEventListener("change", () => { filters[select.dataset.filter] = select.value; selectedDay = null; selectedSlotId = null; selectedSessionId = null; selectedEvidenceEventId = null; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="search"]').forEach((input) => input.addEventListener("change", () => { filters.search = input.value; selectedDay = null; selectedSlotId = null; selectedSessionId = null; selectedEvidenceEventId = null; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="reference"]').forEach((button) => button.addEventListener("click", () => { referenceMonth = referenceMonth === button.dataset.month ? null : button.dataset.month; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="reference-select"]').forEach((select) => select.addEventListener("change", () => { referenceMonth = select.value || null; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="anomaly"]').forEach((button) => button.addEventListener("click", () => { anomalyMode = button.dataset.mode; selectedSlotId = null; selectedSessionId = null; selectedEvidenceEventId = null; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="threshold"]').forEach((input) => input.addEventListener("change", () => { threshold = Math.max(0, Number(input.value) || 0); selectedSlotId = null; selectedSessionId = null; selectedEvidenceEventId = null; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="zoom"]').forEach((button) => button.addEventListener("click", () => { zoom = button.dataset.zoom; if (zoom !== "session") { selectedSessionId = null; selectedEvidenceEventId = null; } syncUrl(); render(); }));
    root.querySelectorAll('[data-action="sort"]').forEach((button) => button.addEventListener("click", () => { sortDirection = globalThis.SaxjaxDateTimeSort.normalize(button.dataset.sort); syncUrl(); render(); window.dispatchEvent(new CustomEvent("saxjax-date-sort-change", { detail: { direction: sortDirection } })); }));
    root.querySelectorAll('form[data-action="manual-reading"]').forEach((form) => form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const date = String(data.get("date") || "");
      const value = Number(data.get("reading"));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value) || value < 0) return;
      manualReadingDate = date;
      const id = `${unit}:${date}:${Date.now()}`;
      manualReadings = [...manualReadings.filter((reading) => reading.date !== date || reading.unit !== unit), { id, date, unit, value }];
      feedbackLab?.track("planning.github-reading", "manual-github-readings");
      render();
    }));
    root.querySelectorAll('[data-action="remove-reading"]').forEach((button) => button.addEventListener("click", () => {
      manualReadings = manualReadings.filter((reading) => reading.id !== button.dataset.readingId);
      feedbackLab?.track("planning.github-reading-remove", "manual-github-readings");
      render();
    }));
    root.querySelectorAll('[data-action="base-budget"]').forEach((input) => input.addEventListener("change", () => {
      baseBudgets = { ...baseBudgets, [unit]: Math.max(unit === "dollars" ? .01 : 1, Number(input.value) || 1) };
      feedbackLab?.track("planning.base-budget", "course-control");
      render();
    }));
    root.querySelectorAll('form[data-action="budget-addition"]').forEach((form) => form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const date = String(data.get("date") || "");
      const value = Number(data.get("amount"));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value) || value <= 0) return;
      budgetAdditionDate = date;
      budgetAdditions = [...budgetAdditions, { id: `${unit}:${date}:${Date.now()}`, month, date, unit, value }];
      feedbackLab?.track("planning.budget-addition", "course-control");
      render();
    }));
    root.querySelectorAll('[data-action="remove-budget-addition"]').forEach((button) => button.addEventListener("click", () => {
      budgetAdditions = budgetAdditions.filter((addition) => addition.id !== button.dataset.budgetAdditionId);
      feedbackLab?.track("planning.budget-addition-remove", "course-control");
      render();
    }));
    root.querySelectorAll('[data-action="pace-scenario"]').forEach((input) => input.addEventListener("input", () => {
      paceScenario = Math.max(20, Math.min(180, Number(input.value) || 100));
      render();
    }));
    root.querySelectorAll('[data-action="layout-studio"]').forEach((button) => button.addEventListener("click", () => {
      if (feedbackLab) feedbackLab.openStudio();
      else location.assign("/monitor/?prototype=monitor&view=preferred&studio=layout");
    }));
    root.querySelectorAll('[data-action="ollama-power"]').forEach((button) => button.addEventListener("click", async () => {
      if (powerPending) return;
      const enabled = !systemView(liveState).online;
      powerPending = true;
      powerError = "";
      render();
      try {
        const response = await fetch("/monitor/api/ollama", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        liveState.metrics = result.metrics;
        rememberSystemSample();
      } catch (error) {
        powerError = error.message;
      } finally {
        powerPending = false;
        render();
      }
    }));
    root.querySelectorAll('[data-action="copy-source"]').forEach((button) => button.addEventListener("click", async () => {
      const source = events.find((event) => event.id === button.dataset.event)?.source;
      if (!source) return;
      await navigator.clipboard?.writeText(source);
      button.textContent = "Source copied";
    }));
    root.querySelectorAll('[data-action="close-forensics"]').forEach((button) => button.addEventListener("click", () => {
      const details = button.closest(".mux-evidence-paper");
      if (!details) return;
      details.open = false;
      details.querySelector("summary")?.scrollIntoView({ block: "center" });
    }));
    root.querySelectorAll("[data-timeline-keyboard]").forEach((element) => element.addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); moveSlot(event.key); }));
  }

  function updateLive() {
    const system = systemView(liveState);
    const values = {
      cpu: `${Math.round(system.cpu)}%`, memory: `${Math.round(system.memory)}%`, load: `${Math.round(system.loadRatio * 100)}%`,
      ollamaCpu: `${Math.round(system.ollamaCpu)}%`, model: system.model, modelMeta: `${system.modelSize} · ${system.processor}`,
      verdict: system.severity === "clear" ? "HEADROOM" : system.severity === "busy" ? "BUSY" : "PRESSURE",
      server: `Ollama ${system.online ? "online" : "offline"}`,
    };
    for (const [key, value] of Object.entries(values)) root.querySelectorAll(`[data-live="${key}"]`).forEach((element) => { element.textContent = value; });
    const bars = { cpu: system.cpu, memory: system.memory, load: system.loadRatio * 100, ollamaCpu: system.ollamaCpu };
    for (const [key, value] of Object.entries(bars)) root.querySelectorAll(`[data-live-bar="${key}"]`).forEach((element) => element.style.setProperty("--fill", `${Math.min(100, value)}%`));
    root.querySelectorAll("[data-severity]").forEach((element) => { element.dataset.severity = system.severity; });
    root.querySelectorAll('[data-action="ollama-power"]').forEach((button) => {
      button.classList.toggle("is-online", system.online);
      button.setAttribute("aria-checked", String(system.online));
      const label = button.querySelector("b");
      if (label && !powerPending) label.textContent = system.online ? "Ollama online" : "Ollama offline";
    });
  }

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!labEnabled || customMode || document.querySelector(".pfl-comparison, .pfl-composer, .pfl-default-menu, .pfl-studio")) return;
    if (target.matches("input, textarea, select, [contenteditable], [data-timeline-keyboard]")) return;
    if (event.key === "ArrowLeft") stepVariant(-1);
    if (event.key === "ArrowRight") stepVariant(1);
  });

  window.addEventListener("saxjax-date-sort-change", (event) => {
    const direction = globalThis.SaxjaxDateTimeSort.normalize(event.detail?.direction);
    if (direction === sortDirection) return;
    sortDirection = direction;
    syncUrl();
    render();
  });

  const stream = new EventSource("/monitor/events?compact=1");
  stream.addEventListener("state", (event) => { liveState = JSON.parse(event.data); rememberSystemSample(); updateLive(); });
  stream.addEventListener("metrics", (event) => { liveState.metrics = JSON.parse(event.data); rememberSystemSample(); updateLive(); });
  stream.addEventListener("request-started", (event) => {
    const live = normalizeLiveRequest(JSON.parse(event.data));
    if (!live) return;
    liveEvents.set(live.id, live);
    mergeLiveEvents();
    if (!months.includes(live.month)) months = [...new Set(events.map((item) => item.month))].sort();
    if (!months.length) months = [fallbackMonth];
    if (!month) month = live.month;
    render();
  });
  stream.addEventListener("request-finished", (event) => {
    const live = normalizeLiveRequest(JSON.parse(event.data));
    if (!live) return;
    liveEvents.set(live.id, live);
    mergeLiveEvents();
    months = [...new Set(events.map((item) => item.month))].sort();
    if (!months.length) months = [fallbackMonth];
    if (!months.includes(month)) month = live.month;
    render();
  });
  stream.addEventListener("usage-timeline", (event) => {
    events = normalizeEvents(JSON.parse(event.data));
    mergeLiveEvents();
    months = [...new Set(events.map((item) => item.month))].sort();
    if (!months.length) months = [fallbackMonth];
    if (!months.includes(month)) month = months.at(-1);
    render();
  });
  stream.addEventListener("copilot", (event) => {
    liveState.copilot = JSON.parse(event.data);
    render();
  });

  if (labEnabled) {
    const { createPrototypeFeedbackLab } = await import("/monitor/prototype-feedback-lab.js");
    feedbackLab = await createPrototypeFeedbackLab({
      prototypeRoot: root,
      variants: VARIANTS,
      initialState: feedbackSnapshot,
      getContext: () => ({
        variant: customMode ? "CUSTOM" : variant, custom: customMode, month, unit, zoom, day: selectedDay, slot: selectedSlotId,
        session: selectedSessionId, provider: filters.provider, origin: filters.origin, model: filters.model,
      }),
      changeVariant: (next) => {
        if (!VARIANTS[next]) return;
        customMode = next === "G";
        variant = customMode ? preferredView.layout?.shellVariant || "A" : next;
        syncUrl();
        render();
        feedbackLab?.variantChanged(variant);
      },
      activatePreference: (preferred) => {
        preferredView = preferred;
        location.assign("/monitor/");
      },
    });
    if (params.get("studio") === "layout") feedbackLab.openStudio();
  }
  stream.addEventListener("prototype-feedback", (event) => {
    feedbackSnapshot = JSON.parse(event.data);
    preferredView = feedbackSnapshot.preferredView || preferredView;
    feedbackLab?.update(feedbackSnapshot);
  });

  render();
}

// Top-level await keeps the page's load lifecycle open until the real local
// timeline has painted. It also makes screenshots and the native WebView show a
// complete first frame instead of a black async-loading gap.
if (prototypeEnabled) {
  try {
    await startMonitorPrototype();
  } catch (error) {
    document.documentElement.classList.add("monitor-ux-prototype-active");
    const root = document.querySelector("#monitor-ux-prototype-root") || document.body.appendChild(document.createElement("div"));
    root.id = "monitor-ux-prototype-root";
    root.style.cssText = "display:block;padding:40px;color:#f5d8cf;background:#1b1110;font:16px/1.5 ui-monospace,monospace;min-height:100vh";
    root.innerHTML = `<h1>Prototype failed to render</h1><pre>${escapeHtml(error?.stack || error)}</pre>`;
  }
}
