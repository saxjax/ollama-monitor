// PROTOTYPE — five disposable full-monitor directions, switchable with
// /monitor/?prototype=monitor&variant=A. Monitor data stays read-only; the
// separate prototype review layer persists only comments and aggregate usage.

const params = new URLSearchParams(location.search);
const prototypeEnabled = params.get("prototype") === "monitor";

const VARIANTS = {
  A: "Flight recorder",
  B: "Cost seismograph",
  C: "Machine room",
  D: "Month contact sheet",
  E: "Incident ledger",
};

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
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

function formatMonth(month, short = false) {
  const [year, monthNumber] = month.split("-").map(Number);
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
      evidenceSource: event.evidence?.source || "unknown",
      evidenceStatus: event.evidence?.status || "unverified",
      identityStrength: event.identity?.strength || "unknown",
      nativeLabel: providerRule.nativeLabel || "provider units",
    }];
  }).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function unitValue(event, unit) {
  return Number.isFinite(event[unit]) ? event[unit] : 0;
}

function unitLabel(unit) {
  if (unit === "credits") return "credits";
  if (unit === "tokens") return "tokens";
  return "estimated USD";
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
  for (const slot of slots) {
    const start = slot.bucket * 30;
    const end = start + 30;
    slot.concurrent = new Set(monthEvents
      .filter((event) => event.day === slot.day && event.minute < end && event.minute + event.durationMinutes > start)
      .map((event) => event.sessionId)).size;
  }
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
    <div class="mux-total"><span>${formatMonth(month)} total</span><strong>${capability.available ? formatValue(view.total, unit) : "Unavailable"}</strong><small>${unitLabel(unit)} · ${view.measured.toLocaleString()} / ${view.monthEvents.length.toLocaleString()} measured · ${escapeHtml(capability.confidence)}</small>${powerSwitch(model)}</div>
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
  return `<section class="mux-controls" aria-label="Timeline controls">
    <div class="mux-filters">
      <label>Provider<select data-action="filter" data-filter="provider">${selectOptions(model.options.providers, model.filters.provider, model.options.providerLabels)}</select></label>
      <label>Source<select data-action="filter" data-filter="origin">${selectOptions(model.options.origins, model.filters.origin, ORIGIN_LABELS)}</select></label>
      <label>Model<select data-action="filter" data-filter="model">${selectOptions(model.options.models, model.filters.model)}</select></label>
      <label class="mux-search">Prompt or session<input data-action="search" value="${escapeHtml(model.filters.search)}" placeholder="Search locally captured evidence" /></label>
    </div>
    <div class="mux-control-row">
      <div><span>Reference month</span>${model.months.filter((item) => item !== model.month).map((item) => `<button data-action="reference" data-month="${item}" class="${model.referenceMonth === item ? "is-active" : ""}">${formatMonth(item, true)}</button>`).join("")}</div>
      <div><span>Rank spikes by</span>${[["value", "Total"], ["jump", "% jump"], ["unusual", "Unusual for time"]].map(([key, label]) => `<button data-action="anomaly" data-mode="${key}" class="${model.anomalyMode === key ? "is-active" : ""}">${label}</button>`).join("")}<label class="mux-threshold">Minimum <input data-action="threshold" type="number" min="0" step="1" value="${model.threshold || ""}" placeholder="0" /></label></div>
      <div><span>Inspection scale</span>${[["month", "Month"], ["day", "Day"], ["slot", "30 min"], ["session", "Session"]].map(([key, label]) => `<button data-action="zoom" data-zoom="${key}" class="${model.zoom === key ? "is-active" : ""}" ${key === "session" && !model.selectedSessionId ? "disabled" : ""}>${label}</button>`).join("")}</div>
    </div>
    <p class="mux-filter-summary">${model.filteredEvents.length.toLocaleString()} matching events · ${model.view.sessions.length.toLocaleString()} sessions · ${model.referenceMonth ? `locked comparison against ${formatMonth(model.referenceMonth)}` : "adaptive scale"} · URL preserves this investigation</p>
  </section>`;
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
    <text x="2" y="18">${escapeHtml(formatValue(peak, model.unit, true))}</text><text x="24" y="${bottom + 4}">0</text>
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
    <text x="1" y="18">${escapeHtml(formatValue(peak, model.unit, true))}</text><text x="26" y="${bottom + 4}">0</text>
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
    <text x="2" y="18">${escapeHtml(formatValue(peak, model.unit, true))}</text><text x="24" y="${bottom + 4}">0</text>
  </svg>`;
}

function incidentList(model, limit = 7) {
  const score = (slot) => model.anomalyMode === "jump" ? `${Math.round(slot.jumpPercent).toLocaleString()}% vs previous slot` : model.anomalyMode === "unusual" ? `${slot.multiple.toFixed(1)}× normal for this time` : `${slot.multiple.toFixed(1)}× occupied-slot median`;
  return `<ol class="mux-incidents">${model.view.topSlots.slice(0, limit).map((slot) => `<li class="${slot.id === model.selectedSlotId ? "is-selected" : ""}">
    <button data-action="slot" data-slot="${slot.id}"><span>#${String(slot.rank).padStart(2, "0")}</span><time>${slot.day.slice(-2)} · ${clock(slot.bucket * 30)}</time><strong>${formatValue(slot.total, model.unit)}</strong><small>${slot.events.length} request${slot.events.length === 1 ? "" : "s"} · ${score(slot)}</small></button>
  </li>`).join("")}</ol>`;
}

function evidence(model, limit = 24) {
  const selected = model.view.slots.find((slot) => slot.id === model.selectedSlotId) || model.view.peakSlot;
  const session = model.selectedSessionId ? model.view.monthEvents.filter((event) => event.sessionId === model.selectedSessionId) : null;
  const events = [...(session?.length ? session : selected?.events || [])].sort((left, right) => model.zoom === "session" ? Date.parse(left.at) - Date.parse(right.at) : unitValue(right, model.unit) - unitValue(left, model.unit));
  const value = events.filter((event) => Number.isFinite(event[model.unit])).reduce((sum, event) => sum + event[model.unit], 0);
  const missing = events.filter((event) => !Number.isFinite(event[model.unit])).length;
  return `<section class="mux-evidence">
    <header><div><span>${session?.length ? "Selected session" : "Selected interval"}</span><h2>${session?.length ? escapeHtml(model.selectedSessionId) : `${selected?.day || "—"} · ${selected ? `${clock(selected.bucket * 30)}–${clock(selected.bucket * 30 + 30)}` : "—"}`}</h2></div><strong>${events.length && missing === events.length ? "— unavailable" : formatValue(value, model.unit)}</strong><small>${events.length} contributing requests · ${missing ? `${missing} unmeasured · ` : ""}${model.zoom === "session" ? "prompt in → response out" : "ranked by contribution"}</small></header>
    <div class="mux-evidence-list">${events.map((event, index) => `<article style="--family:${ORIGIN_COLORS[event.origin] || ORIGIN_COLORS.other}">
      <span>${String(index + 1).padStart(2, "0")}</span><div><b>${escapeHtml(event.model)} · ${escapeHtml(event.originLabel)}</b><p>${escapeHtml(event.prompt)}</p><small>${escapeHtml(event.source)}</small><em>${escapeHtml(event.providerLabel)} · ${escapeHtml(event.evidenceStatus)} ${escapeHtml(event.evidenceSource)} · ${escapeHtml(event.identityStrength)} identity${Number.isFinite(event.inputTokens) || Number.isFinite(event.outputTokens) ? ` · ${event.inputTokens?.toLocaleString() || "—"} in / ${event.outputTokens?.toLocaleString() || "—"} out` : ""}</em><button class="mux-copy-source" data-action="copy-source" data-event="${escapeHtml(event.id)}">Copy source reference</button></div><strong>${Number.isFinite(event[model.unit]) ? formatValue(event[model.unit], model.unit) : "— not measured"}</strong>
    </article>`).join("") || `<p class="mux-empty">No measured request started in this interval.</p>`}</div>
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
  const lanes = [...groups.values()].sort((left, right) => left.start - right.start || right.total - left.total);
  return `<section class="mux-sessions"><header><div><span>Parallel session lanes · ${model.selectedDay}</span><h2>Who was running together?</h2></div><strong>${lanes.length} sessions</strong><small>Horizontal position is prompt start → final response. Colour is source; height never means concurrency.</small></header><div class="mux-session-scale"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div><div class="mux-session-list">${lanes.map((lane) => `<button data-action="session" data-session="${escapeHtml(lane.id)}" class="${lane.id === model.selectedSessionId ? "is-selected" : ""}"><span><b>${clock(lane.start)}–${clock(lane.end)}</b> ${escapeHtml(lane.provider)} · ${lane.events.length} request${lane.events.length === 1 ? "" : "s"}</span><i><em style="--left:${Math.max(0, lane.start / 1440 * 100)}%;--width:${Math.max(.6, (Math.min(1440, lane.end) - lane.start) / 1440 * 100)}%;--source:${ORIGIN_COLORS[lane.origin] || ORIGIN_COLORS.other}"></em></i><strong>${lane.measured ? formatValue(lane.total, model.unit) : "—"}</strong></button>`).join("") || `<p class="mux-empty">No sessions were recorded on this day.</p>`}</div></section>`;
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
  return `<section class="mux-history"><header><div><span>Accumulated ${unitLabel(model.unit)} · same month axis</span><h2>Every contribution remains visible</h2></div><strong>${formatValue(model.view.total, model.unit)}</strong><small>${model.referenceMonth ? `Shadow = ${formatMonth(model.referenceMonth)}; scale locked.` : "Select a reference month above to lock the scale."}</small></header>${cumulativeChart(model, 180)}</section>`;
}

function analysisDock(model, includeCumulative = true) {
  return `<div class="mux-analysis-dock">${includeCumulative ? cumulativeNavigator(model) : ""}${resourceCorrelation(model)}${sessionLanes(model)}${truthPanel(model)}</div>`;
}

function VariantA(model) {
  return `<div class="mux mux-a">
    ${commonHeader(model, "Flight recorder", "A calm monthly overview. The red marks are not alerts—they are places worth opening.")}
    ${controlDeck(model)}
    ${systemStrip(model, true)}
    <main class="mux-a-layout">
      <section class="mux-a-chart"><div class="mux-section-title"><span>01 / ${model.zoom === "month" ? "Cost altitude by day" : `${model.selectedDay} investigation`}</span><h2>Where did the month jump?</h2>${legend(model)}</div>${model.zoom === "month" ? dailyChart(model, 285) : slotChart(model, model.selectedDay, 285)}
        <div class="mux-day-slice"><header><span>${model.selectedDay} · 30-minute resolution</span><strong>Peak ${formatValue(model.view.slots.filter((slot) => slot.day === model.selectedDay).reduce((peak, slot) => slot.total > peak ? slot.total : peak, 0), model.unit)}</strong></header>${slotChart(model, model.selectedDay, 190)}</div>
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
    <main class="mux-b-layout">
      <aside class="mux-b-quakes"><header><span>Recorded shocks</span><b>${model.view.topSlots.length}</b></header>${incidentList(model, 12)}</aside>
      <section class="mux-b-scope">
        <div class="mux-b-scopehead"><span>Accumulated ${unitLabel(model.unit)}</span><strong>${formatValue(model.view.total, model.unit)}</strong><small>Every needle below the line is the exact 30-minute contribution at the same x-position.</small></div>
        ${model.zoom === "month" ? cumulativeChart(model, 330) : slotChart(model, model.selectedDay, 330)}
        <div class="mux-b-selected"><span>Cursor</span><b>${selected.day.slice(-2)} / ${clock(selected.bucket * 30)}</b><strong>${formatValue(selected.total, model.unit)}</strong><small>${selected.events.length} requests · ${selected.concurrent} parallel session${selected.concurrent === 1 ? "" : "s"}</small></div>
        ${systemStrip(model)}
      </section>
      <aside class="mux-b-proof">${evidence(model, 14)}</aside>
    </main>
    ${analysisDock(model, false)}
  </div>`;
}

function VariantC(model) {
  const system = model.system;
  return `<div class="mux mux-c">
    <header class="mux-c-head"><div><span>LOCAL INFERENCE / CONTROL ROOM</span><h1>Machine room</h1></div><div class="mux-c-clock">${formatMonth(model.month)}<b>${formatValue(model.view.total, model.unit)}</b><small>${unitLabel(model.unit)}</small></div><div class="mux-c-controls">${commonHeader(model, "", "").match(/<div class="mux-period">[\s\S]*?<\/div>\s*<div class="mux-total">/)?.[0].replace('<div class="mux-total">', '') || ""}</div></header>
    ${controlDeck(model)}
    <main class="mux-c-layout">
      <aside class="mux-c-machine" data-severity="${system.severity}">
        <div class="mux-c-verdict"><i></i><span>Present condition</span><strong data-live="verdict">${system.severity.toUpperCase()}</strong><p>${system.severity === "pressure" ? "One or more resources are beyond the comfortable operating range." : "The host has capacity for more local work."}</p>${powerSwitch(model)}</div>
        <div class="mux-c-gauges"><div style="--g:${system.cpu}%"><span>CPU</span><b data-live="cpu">${Math.round(system.cpu)}%</b></div><div style="--g:${system.memory}%"><span>Memory</span><b data-live="memory">${Math.round(system.memory)}%</b></div><div style="--g:${system.loadRatio * 100}%"><span>Queue</span><b data-live="load">${Math.round(system.loadRatio * 100)}%</b></div></div>
        <section><span>Core dispatch</span>${coreRack(model)}</section>
        <dl><div><dt>Ollama</dt><dd data-live="server">${system.online ? "ONLINE" : "OFFLINE"}</dd></div><div><dt>Resident</dt><dd data-live="model">${escapeHtml(system.model)}</dd></div><div><dt>Allocation</dt><dd data-live="modelMeta">${escapeHtml(system.modelSize)} · ${escapeHtml(system.processor)}</dd></div><div><dt>Ollama CPU</dt><dd data-live="ollamaCpu">${Math.round(system.ollamaCpu)}%</dd></div><div><dt>Requests</dt><dd>${system.active} active / ${system.total} total</dd></div></dl>
      </aside>
      <section class="mux-c-usage"><header><span>${model.zoom === "month" ? "Month oscilloscope" : `${model.selectedDay} oscilloscope`} · 30-minute samples</span><h2>Usage amplitude</h2><p>${unitLabel(model.unit)} amplitude is coloured by source. The outline marks overlap, so expensive and merely parallel work remain distinct.</p>${legend(model)}</header>${slotChart(model, model.selectedDay, 370, model.zoom === "month")}
        <div class="mux-c-ruler"><span>Quiet</span><i></i><b>Selected ${model.selectedSlotId.replace(":", " / ")}</b><i></i><span>Explosive</span></div>
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
    <span><b>${day.day.slice(-2)}</b><small>${new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${day.day}T12:00:00`))}</small></span>
    <i class="mux-film-wave">${slots.map((slot) => `<em style="--h:${Math.max(2, slot.total / peak * 100)}%;--c:${ORIGIN_COLORS[Object.entries(slot.byOrigin).sort((a, b) => b[1] - a[1])[0]?.[0] || "other"] || ORIGIN_COLORS.other}" data-action="slot" data-slot="${slot.id}"></em>`).join("")}</i>
    <strong>${formatValue(day.total, model.unit, true)}</strong><small>${day.events.length} req</small>
  </button>`;
}

function VariantD(model) {
  return `<div class="mux mux-d">
    ${commonHeader(model, "Month contact sheet", "Every day is a strip of film. Scan the silhouette, open the frame, read the source note.")}
    ${controlDeck(model)}
    <main class="mux-d-layout">
      <section class="mux-d-film"><header><span>${formatMonth(model.month)} / 30-minute silhouettes</span><div>${legend(model)}</div></header>${model.view.daily.filter((day) => model.zoom === "month" || day.day === model.selectedDay).map((day) => dayFilm(day, model)).join("")}</section>
      <aside class="mux-d-report"><span>Pulled frame</span><h2>${model.selectedDay}</h2>${slotChart(model, model.selectedDay, 185)}${evidence(model, 12)}</aside>
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
    <main class="mux-e-layout">
      <section class="mux-e-horizon"><header><span>${model.zoom === "month" ? "MONTH" : "DAY"} HORIZON</span><h2>Expense by 30-minute interval</h2><p>Arrows move the cursor. Coloured height is usage; the ledger below names the contributors.</p></header>${slotChart(model, model.selectedDay, 270, model.zoom === "month")}</section>
      <aside class="mux-e-ranking"><header><span>RANK</span><span>TIME</span><span>VALUE / CAUSE</span></header>${incidentList(model, 10)}</aside>
      <section class="mux-e-selected"><header><span>SELECTED INCIDENT</span><strong>${selected.day} ${clock(selected.bucket * 30)}</strong><b>${formatValue(selected.total, model.unit)}</b></header>${evidence(model, 30)}</section>
      <aside class="mux-e-machine"><header><span>HOST LEDGER</span><b data-live="verdict">${model.system.severity.toUpperCase()}</b></header>${systemStrip(model, true)}${coreRack(model)}</aside>
    </main>
    ${analysisDock(model)}
  </div>`;
}

async function startMonitorPrototype() {
  document.documentElement.classList.add("monitor-ux-prototype-active");
  const root = document.createElement("div");
  root.id = "monitor-ux-prototype-root";
  document.body.prepend(root);

  const [timelineResponse, stateResponse] = await Promise.all([
    fetch("/monitor/api/usage-timeline", { cache: "no-store" }),
    fetch("/monitor/api/state", { cache: "no-store" }),
  ]);
  const timeline = await timelineResponse.json();
  let liveState = await stateResponse.json();
  let events = normalizeEvents(timeline);
  let months = [...new Set(events.map((event) => event.month))].sort();
  let variant = VARIANTS[params.get("variant")?.toUpperCase()] ? params.get("variant").toUpperCase() : "A";
  let unit = ["tokens", "credits", "dollars"].includes(params.get("unit")) ? params.get("unit") : "credits";
  let month = months.includes(params.get("month")) ? params.get("month") : months.reduce((latest, item) => events.filter((event) => event.month === item).length >= 10 ? item : latest, months.at(-1));
  let referenceMonth = months.includes(params.get("reference")) && params.get("reference") !== month ? params.get("reference") : null;
  let selectedDay = params.get("day");
  let selectedSlotId = params.get("slot");
  let selectedSessionId = params.get("session");
  let zoom = ["month", "day", "slot", "session"].includes(params.get("zoom")) ? params.get("zoom") : "month";
  let anomalyMode = ["value", "jump", "unusual"].includes(params.get("anomaly")) ? params.get("anomaly") : "value";
  let threshold = Math.max(0, Number(params.get("threshold")) || 0);
  const filters = {
    provider: params.get("provider") || "all",
    origin: params.get("origin") || "all",
    model: params.get("model") || "all",
    search: params.get("search") || "",
  };
  let powerPending = false;
  let powerError = "";
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
    const providers = [...new Set(events.map((event) => event.provider))].sort();
    const origins = [...new Set(events.map((event) => event.origin))].sort();
    const models = [...new Set(events.map((event) => event.model))].sort();
    const providerLabels = Object.fromEntries(providers.map((provider) => [provider, PROVIDER_RULES[provider]?.label || provider]));
    const billingReads = capabilities.providers.length > 0 && capabilities.providers.every((provider) => PROVIDER_RULES[provider]?.billingReads === true);
    return {
      variant, unit, month, months, referenceMonth, view, referenceView, selectedDay, selectedSlotId, selectedSessionId, zoom, anomalyMode, threshold,
      filters, filteredEvents, capabilities, billingReads, system: systemView(liveState), liveSamples, powerPending, powerError,
      options: { providers, origins, models, providerLabels },
    };
  }

  function render() {
    const current = model();
    syncUrl();
    const views = { A: VariantA, B: VariantB, C: VariantC, D: VariantD, E: VariantE };
    root.className = `monitor-ux-root variant-${variant.toLowerCase()}`;
    root.innerHTML = `${views[variant](current)}${switcher()}`;
    document.title = `${variant} — ${VARIANTS[variant]} — Saxjax prototype`;
    bind();
    feedbackLab?.decorate();
  }

  function switcher() {
    return `<nav class="mux-switcher" aria-label="Monitor prototypes"><button data-action="variant-step" data-step="-1" aria-label="Previous prototype">←</button><div><small>THROWAWAY PROTOTYPE</small><strong>${variant} — ${VARIANTS[variant]}</strong></div><button data-action="variant-step" data-step="1" aria-label="Next prototype">→</button></nav>`;
  }

  function syncUrl() {
    params.set("prototype", "monitor");
    params.set("variant", variant);
    params.set("unit", unit);
    params.set("month", month);
    params.set("day", selectedDay);
    params.set("slot", selectedSlotId);
    if (referenceMonth) params.set("reference", referenceMonth); else params.delete("reference");
    if (selectedSessionId) params.set("session", selectedSessionId); else params.delete("session");
    params.set("zoom", zoom);
    params.set("anomaly", anomalyMode);
    if (threshold > 0) params.set("threshold", String(threshold)); else params.delete("threshold");
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== "all") params.set(key, value); else params.delete(key);
    }
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }

  function stepVariant(step) {
    const keys = Object.keys(VARIANTS);
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
    zoom = "slot";
    feedbackLab?.track("navigation.timeline-keyboard", "inspection-scale");
    syncUrl();
    render();
    requestAnimationFrame(() => root.querySelector("[data-timeline-keyboard]")?.focus());
  }

  function bind() {
    root.querySelectorAll('[data-action="variant-step"]').forEach((button) => button.addEventListener("click", () => stepVariant(Number(button.dataset.step))));
    root.querySelectorAll('[data-action="unit"]').forEach((button) => button.addEventListener("click", () => { unit = button.dataset.unit; selectedSlotId = null; selectedSessionId = null; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="month"]').forEach((select) => select.addEventListener("change", () => { month = select.value; if (referenceMonth === month) referenceMonth = null; selectedDay = null; selectedSlotId = null; selectedSessionId = null; zoom = "month"; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="day"]').forEach((element) => element.addEventListener("click", () => { selectedDay = element.dataset.day; const daySlots = model().view.slots.filter((slot) => slot.day === selectedDay); selectedSlotId = daySlots.reduce((peak, slot) => slot.total > peak.total ? slot : peak, daySlots[0]).id; selectedSessionId = null; zoom = "day"; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="slot"]').forEach((element) => element.addEventListener("click", (event) => { event.stopPropagation(); selectedSlotId = element.dataset.slot; selectedDay = selectedSlotId.slice(0, 10); selectedSessionId = null; zoom = "slot"; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="session"]').forEach((element) => element.addEventListener("click", () => { selectedSessionId = element.dataset.session; const first = model().view.monthEvents.find((event) => event.sessionId === selectedSessionId); if (first) { selectedDay = first.day; selectedSlotId = `${first.day}:${first.bucket}`; } zoom = "session"; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="filter"]').forEach((select) => select.addEventListener("change", () => { filters[select.dataset.filter] = select.value; selectedDay = null; selectedSlotId = null; selectedSessionId = null; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="search"]').forEach((input) => input.addEventListener("change", () => { filters.search = input.value; selectedDay = null; selectedSlotId = null; selectedSessionId = null; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="reference"]').forEach((button) => button.addEventListener("click", () => { referenceMonth = referenceMonth === button.dataset.month ? null : button.dataset.month; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="anomaly"]').forEach((button) => button.addEventListener("click", () => { anomalyMode = button.dataset.mode; selectedSlotId = null; selectedSessionId = null; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="threshold"]').forEach((input) => input.addEventListener("change", () => { threshold = Math.max(0, Number(input.value) || 0); selectedSlotId = null; selectedSessionId = null; syncUrl(); render(); }));
    root.querySelectorAll('[data-action="zoom"]').forEach((button) => button.addEventListener("click", () => { zoom = button.dataset.zoom; if (zoom !== "session") selectedSessionId = null; syncUrl(); render(); }));
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
    if (document.querySelector(".pfl-comparison, .pfl-composer")) return;
    if (target.matches("input, textarea, select, [contenteditable], [data-timeline-keyboard]")) return;
    if (event.key === "ArrowLeft") stepVariant(-1);
    if (event.key === "ArrowRight") stepVariant(1);
  });

  const stream = new EventSource("/monitor/events");
  stream.addEventListener("state", (event) => { liveState = JSON.parse(event.data); rememberSystemSample(); updateLive(); });
  stream.addEventListener("metrics", (event) => { liveState.metrics = JSON.parse(event.data); rememberSystemSample(); updateLive(); });
  stream.addEventListener("usage-timeline", (event) => {
    events = normalizeEvents(JSON.parse(event.data));
    months = [...new Set(events.map((item) => item.month))].sort();
    if (!months.includes(month)) month = months.at(-1);
    render();
  });

  const { createPrototypeFeedbackLab } = await import("/monitor/prototype-feedback-lab.js");
  feedbackLab = await createPrototypeFeedbackLab({
    prototypeRoot: root,
    variants: VARIANTS,
    getContext: () => ({
      variant, month, unit, zoom, day: selectedDay, slot: selectedSlotId,
      session: selectedSessionId, provider: filters.provider, origin: filters.origin, model: filters.model,
    }),
    changeVariant: (next) => {
      if (!VARIANTS[next]) return;
      variant = next;
      syncUrl();
      render();
      feedbackLab?.variantChanged(variant);
    },
  });
  stream.addEventListener("prototype-feedback", (event) => feedbackLab?.update(JSON.parse(event.data)));

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
