const $ = (selector) => document.querySelector(selector);
const stream = $("#stream");
const exchanges = new Map();
const modelContexts = new Map();
const sessions = new Map();
const contentReader = $("#content-reader");
const helpDialog = $("#help-dialog");
const sessionFilter = $("#session-filter");
const dateSort = $("#date-sort");
const autofollow = $("#autofollow");
const serverState = $("#server-state");
const viewStateKey = "ollama-monitor-view-v1";
let initialStateRendered = false;
let restoringView = false;
let persistFrame = null;
let ollamaControlPending = false;

function readViewState() {
  try {
    return JSON.parse(sessionStorage.getItem(viewStateKey) || "null");
  } catch {
    return null;
  }
}

const savedViewState = readViewState();
const requestedDateSort = new URLSearchParams(location.search).get("sort");
let dateSortDirection = globalThis.SaxjaxDateTimeSort.normalize(requestedDateSort || savedViewState?.sortDirection);
dateSort.value = dateSortDirection;

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
if (savedViewState) {
  restoringView = true;
  stream.style.scrollBehavior = "auto";
  document.body.style.minHeight = `${Math.max(document.body.scrollHeight, (savedViewState.windowY || 0) + innerHeight)}px`;
  requestAnimationFrame(() => window.scrollTo(0, savedViewState.windowY || 0));
}

function persistViewState() {
  const openExchange = stream.querySelector(".exchange:not(.collapsed)");
  try {
    sessionStorage.setItem(viewStateKey, JSON.stringify({
      windowY: window.scrollY,
      streamTop: stream.scrollTop,
      session: sessionFilter.value,
      sortDirection: dateSortDirection,
      openExchangeId: openExchange?.dataset.id || null,
      autofollow: autofollow.checked,
    }));
  } catch {
    // The monitor remains usable if storage is unavailable.
  }
}

function scheduleViewStatePersistence() {
  if (persistFrame != null) return;
  persistFrame = requestAnimationFrame(() => {
    persistFrame = null;
    persistViewState();
  });
}

function restoreViewState() {
  if (!savedViewState) {
    applySessionFilter(true);
    return;
  }

  if ([...sessionFilter.options].some((option) => option.value === savedViewState.session)) {
    sessionFilter.value = savedViewState.session;
  }
  dateSort.value = dateSortDirection;
  sortExchangeRows();
  autofollow.checked = savedViewState.autofollow !== false;
  applySessionFilter(false);

  const openExchange = savedViewState.openExchangeId
    ? exchanges.get(savedViewState.openExchangeId)
    : null;
  exchanges.forEach((element) => setCollapsed(element, element !== openExchange));

  const restorePosition = () => {
    stream.scrollTop = savedViewState.streamTop || 0;
    window.scrollTo(0, savedViewState.windowY || 0);
  };

  requestAnimationFrame(() => {
    restorePosition();
    requestAnimationFrame(() => {
      restorePosition();
      stream.style.removeProperty("scroll-behavior");
      document.body.style.removeProperty("min-height");
      restoringView = false;
    });
  });
}

function number(value, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function duration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

function renderMachineTitle(machineName) {
  const heading = $("#machine-title");
  const normalized = String(machineName || "OLLAMA-MONITOR")
    .replace(/\.local$/i, "")
    .trim();
  if (heading.dataset.machineName === normalized) return;

  const parts = normalized.split(/[\s_-]+/).filter(Boolean);
  const displayParts = (parts.length ? parts : ["OLLAMA", "MONITOR"])
    .map((part) => part.toLocaleUpperCase());
  heading.replaceChildren();
  displayParts.forEach((part, index) => {
    if (index) {
      const separator = document.createElement("span");
      separator.textContent = "/";
      heading.append(separator);
    }
    heading.append(document.createTextNode(part));
  });
  heading.dataset.machineName = normalized;
  heading.setAttribute("aria-label", normalized);
  heading.title = normalized;
  document.title = `${displayParts.join("/")} — Saxjax Monitor`;
}

function setDial(id, value, suffix = "%") {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  $(`#${id}-dial`).style.setProperty("--value", safe);
  $(`#${id}-value`).textContent = Number.isFinite(value) ? `${Math.round(value)}${suffix}` : "—";
}

function renderCores(system) {
  const cores = system.cores || [];
  const hardware = system.hardware || {};
  const coreGrid = $("#core-grid");
  const topology = hardware.performanceCores || hardware.efficiencyCores
    ? `${hardware.performanceCores || 0}P + ${hardware.efficiencyCores || 0}E`
    : `${hardware.physicalCores || cores.length} physical · ${hardware.logicalCores || cores.length} logical`;
  $("#core-summary").textContent = `${hardware.brand || "CPU"} · ${topology} · system-wide live 2s delta`;

  if (coreGrid.children.length !== cores.length) {
    coreGrid.replaceChildren(...cores.map((core) => {
      const cell = document.createElement("article");
      cell.className = `core-cell ${core.type}`;
      cell.dataset.index = core.index;
      cell.innerHTML = `<header><strong></strong><output></output></header><div class="core-meter"><i></i></div><footer><span></span><span></span></footer>`;
      return cell;
    }));
  }

  cores.forEach((core) => {
    const cell = coreGrid.querySelector(`[data-index="${core.index}"]`);
    if (!cell) return;
    const utilization = Number.isFinite(core.utilization) ? core.utilization : null;
    cell.className = `core-cell ${core.type}`;
    cell.classList.toggle("working", utilization != null && utilization >= 5);
    cell.style.setProperty("--core-load", `${Math.max(0, utilization || 0)}%`);
    cell.querySelector("strong").textContent = core.label;
    cell.querySelector("output").textContent = utilization == null ? "…" : `${Math.round(utilization)}%`;
    cell.querySelector("footer span:first-child").textContent = "HARDWARE";
    cell.querySelector("footer span:last-child").textContent = `#${core.index}`;
    cell.title = utilization == null
      ? `${core.label}, hardware core ${core.index}: sampling`
      : `${core.label}, hardware core ${core.index}: ${number(utilization, 1)}% system activity over the last sample`;
  });
}

function renderMetrics(metrics) {
  if (!metrics) return;
  const { server, system, ollama, requests, configuration } = metrics;
  renderMachineTitle(system.machineName);
  if (!ollamaControlPending) {
    serverState.dataset.online = String(server.online);
    serverState.setAttribute("aria-checked", String(server.online));
    serverState.title = server.online ? "Stop and disable Ollama" : "Enable and start Ollama";
    $("#server-label").textContent = server.online ? "ONLINE" : "OFFLINE";
    $("#server-version").textContent = server.online
      ? `OLLAMA ${server.version || ""} · STOP`.replace("  ", " ")
      : "OLLAMA · START";
    if (serverState.dataset.ready !== "true") {
      requestAnimationFrame(() => { serverState.dataset.ready = "true"; });
    }
  }
  setDial("cpu", system.cpuUsed);
  setDial("memory", system.memoryFree == null ? null : 100 - system.memoryFree);
  const swapPercent = system.swapTotalMB ? (system.swapUsedMB / system.swapTotalMB) * 100 : 0;
  setDial("swap", swapPercent);
  $("#swap-detail").textContent = system.swapTotalMB == null ? "USED / TOTAL" : `${number(system.swapUsedMB / 1024, 1)} / ${number(system.swapTotalMB / 1024, 1)} GIB`;
  const oneMinuteLoad = system.load[0];
  const coreCount = system.logicalCores;
  const loadRatio = oneMinuteLoad != null && coreCount ? oneMinuteLoad / coreCount : null;
  const loadState = loadRatio == null ? "Waiting for data" : loadRatio < .5 ? "Comfortable" : loadRatio < .8 ? "Moderate" : loadRatio < 1 ? "Busy" : "Overloaded";
  $("#load-summary").textContent = `${number(oneMinuteLoad, 1)} / ${coreCount ?? "—"} cores`;
  $("#load-explanation").textContent = `${loadState}: ${number(loadRatio == null ? null : loadRatio * 100)}% scheduler demand over 1 minute. Below ${coreCount ?? "the"} cores means there is headroom.`;
  $("#load-five").textContent = `5 min: ${number(system.load[1], 1)}`;
  $("#load-fifteen").textContent = `15 min: ${number(system.load[2], 1)}`;
  $("#ollama-rss").textContent = number(ollama.rssGB * 1024, 0);
  $("#ollama-cpu").textContent = `${number(ollama.cpu)}% CPU`;
  $("#process-count").textContent = `${ollama.processes} processes`;
  $("#disk-free").textContent = `${number(system.diskFreeGB, 0)} GiB`;
  $("#uptime").textContent = duration(system.uptimeSeconds);
  $("#active-count").textContent = requests.active;
  $("#total-count").textContent = requests.total;
  $("#error-count").textContent = requests.errors;
  if (configuration) {
    $("#gateway-address").textContent = configuration.gateway;
    $("#upstream-address").textContent = configuration.upstream;
  }
  renderCores(system);

  const model = ollama.models[0];
  ollama.models.forEach((entry) => modelContexts.set(entry.name, entry.context));
  $("#model-name").textContent = model?.name || "No model loaded";
  $("#model-size").textContent = model ? `${model.size} allocation` : "— allocation";
  $("#model-processor").textContent = model?.processor || "— processor";
  $("#model-context").textContent = model?.context ? `${model.context.toLocaleString()} context` : "— context";
}

function renderCopilotUsage(usage) {
  if (!usage) return;
  const panel = $("#copilot-usage");
  panel.dataset.status = usage.status || "unconfigured";
  $("#copilot-credits").textContent = Number.isFinite(usage.usedCredits)
    ? `${usage.usageEstimate ? "≈" : ""}${usage.usedCredits.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
    : "—";
  $("#copilot-caption").textContent = usage.status === "ready"
    ? `AI CREDITS · ${usage.period || "CURRENT PERIOD"}`
    : usage.status === "estimated" ? "AI CREDITS · LOCAL ESTIMATE"
    : usage.status.toUpperCase();
  $("#copilot-cost").textContent = Number.isFinite(usage.estimatedCost)
    ? `${usage.usageEstimate ? "≈" : ""}$${usage.estimatedCost.toFixed(2)} ${usage.usageEstimate ? "estimated" : "billed"}`
    : "— cost";
  $("#copilot-updated").textContent = usage.updatedAt
    ? `${new Date(usage.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} updated`
    : "— updated";
  $("#copilot-input-tokens").textContent = Number.isFinite(usage.observedInputTokens)
    ? `${usage.observedInputTokensEstimated ? "≈" : ""}${usage.observedInputTokens.toLocaleString()}`
    : "—";
  $("#copilot-output-tokens").textContent = Number.isFinite(usage.observedOutputTokens)
    ? `${usage.observedOutputTokensEstimated ? "≈" : ""}${usage.observedOutputTokens.toLocaleString()}`
    : "—";
  $("#ollama-input-tokens").textContent = Number.isFinite(usage.ollamaInputTokens)
    ? usage.ollamaInputTokens.toLocaleString()
    : "—";
  $("#ollama-output-tokens").textContent = Number.isFinite(usage.ollamaOutputTokens)
    ? usage.ollamaOutputTokens.toLocaleString()
    : "—";
  const budgetPercent = Number.isFinite(usage.budgetUsedPercent) ? usage.budgetUsedPercent : null;
  setDial("budget", budgetPercent);
  const budgetDial = $("#budget-dial");
  budgetDial.dataset.configured = String(Number.isFinite(usage.monthlyBudgetUsd));
  budgetDial.classList.toggle("warning", budgetPercent != null && budgetPercent >= 75 && budgetPercent < 100);
  budgetDial.classList.toggle("danger", budgetPercent != null && budgetPercent >= 100);
  $("#budget-detail").textContent = Number.isFinite(usage.monthlyBudgetUsd)
    ? `${usage.usageEstimate ? "≈" : ""}$${Number(usage.estimatedCost || 0).toFixed(2)} / $${usage.monthlyBudgetUsd.toFixed(2)}`
    : "SET IN COPILOT PANEL";
  const budgetInput = $("#copilot-budget-input");
  if (document.activeElement !== budgetInput) {
    budgetInput.value = Number.isFinite(usage.monthlyBudgetUsd) ? usage.monthlyBudgetUsd.toFixed(2) : "";
  }
  const tokenPriceInput = $("#copilot-token-price-input");
  if (document.activeElement !== tokenPriceInput) {
    tokenPriceInput.value = Number.isFinite(usage.tokenPriceUsdPerMillion) ? usage.tokenPriceUsdPerMillion : "";
  }
  $("#copilot-detail").textContent = usage.status === "ready"
    ? `${usage.user} via ${usage.owner} · ${usage.billableCredits.toLocaleString()} billable · ${usage.models.length} models`
    : usage.detail || "Copilot usage is unavailable.";
  const forecastPanel = $("#copilot-forecast");
  const forecast = usage.forecast;
  forecastPanel.hidden = !forecast?.requestCount;
  if (!forecastPanel.hidden) {
    $("#copilot-forecast-title").textContent = usage.status === "ready"
      ? "PAID COPILOT VELOCITY · GITHUB BASELINE + LOCAL SAMPLE"
      : "PAID COPILOT VELOCITY · LOCAL ESTIMATE";
    $("#copilot-velocity").textContent = `≈${forecast.creditsPerDay.toFixed(1)} credits/day`;
    $("#copilot-projection").textContent = `≈${forecast.projectedMonthCredits.toFixed(0)} credits`;
    $("#copilot-runway").textContent = Number.isFinite(forecast.daysUntilExhausted)
      ? forecast.daysUntilExhausted <= 0 ? "Budget exhausted" : `≈${forecast.daysUntilExhausted.toFixed(1)} days`
      : "Set a budget";
    $("#copilot-parallel").textContent = Number.isFinite(forecast.sustainableParallelFactor)
      ? forecast.sustainableParallelFactor < 1
        ? `Reduce to ≈${Math.max(0, forecast.sustainableParallelFactor).toFixed(1)}× velocity`
        : `Up to ≈${forecast.sustainableParallelFactor.toFixed(1)}× velocity`
      : "Set a budget";
    $("#copilot-confidence").textContent = [
      `${forecast.requestCount} locally observed requests over ${forecast.observationHours.toFixed(1)} hours.`,
      forecast.authoritativeBaseline ? "Runway starts from GitHub's authoritative billed spend; velocity comes from local Copilot traffic." : "Billing and velocity are locally estimated because GitHub usage is unavailable.",
      forecast.customTokenPrice
        ? `Custom price $${forecast.tokenPriceUsdPerMillion}/1M tokens is applied to local Copilot traffic.`
        : forecast.estimatedRecords ? `${forecast.estimatedRecords} requests use estimated tokens or conservative model pricing.` : "Observed token counts and known model prices used.",
      "Ollama tokens are excluded. Parallel work is a paid Copilot burn-rate scenario, not a concurrency guarantee.",
    ].join(" ");
  }
  const actions = $("#copilot-actions");
  actions.hidden = usage.status === "ready" || usage.status === "loading";
  $("#copilot-token-status").href = usage.tokenStatusUrl || "https://github.com/settings/personal-access-tokens";
  $("#copilot-token-create").href = usage.tokenUrl || "https://github.com/settings/personal-access-tokens/new";
}

$("#copilot-budget-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const status = $("#copilot-budget-status");
  const monthlyBudgetUsd = Number($("#copilot-budget-input").value);
  button.disabled = true;
  status.textContent = "Saving local budget…";
  try {
    const response = await fetch("/monitor/api/copilot-budget", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ monthlyBudgetUsd }),
    });
    const usage = await response.json();
    if (!response.ok) throw new Error(usage.error || `HTTP ${response.status}`);
    renderCopilotUsage(usage);
    status.textContent = monthlyBudgetUsd ? "Monthly budget saved on this Mac." : "Monthly budget removed.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("#copilot-token-price-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const status = $("#copilot-token-price-status");
  const tokenPriceUsdPerMillion = Number($("#copilot-token-price-input").value);
  button.disabled = true;
  status.textContent = "Saving local token price…";
  try {
    const response = await fetch("/monitor/api/copilot-token-price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokenPriceUsdPerMillion }),
    });
    const usage = await response.json();
    if (!response.ok) throw new Error(usage.error || `HTTP ${response.status}`);
    renderCopilotUsage(usage);
    status.textContent = tokenPriceUsdPerMillion
      ? `Using $${tokenPriceUsdPerMillion}/1M tokens for local Copilot estimates.`
      : "Using published per-model rates.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

serverState.addEventListener("click", async () => {
  if (ollamaControlPending) return;
  const enable = serverState.dataset.online !== "true";
  ollamaControlPending = true;
  serverState.disabled = true;
  serverState.dataset.pending = "true";
  serverState.dataset.targetOnline = String(enable);
  serverState.setAttribute("aria-busy", "true");
  $("#server-label").textContent = enable ? "STARTING…" : "STOPPING…";
  $("#server-version").textContent = "OLLAMA · POWER";

  try {
    const response = await fetch("/monitor/api/ollama", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: enable }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    ollamaControlPending = false;
    renderMetrics(result.metrics);
  } catch (error) {
    $("#server-label").textContent = "POWER FAILED";
    $("#server-version").textContent = error.message;
    serverState.title = error.message;
  } finally {
    ollamaControlPending = false;
    serverState.disabled = false;
    delete serverState.dataset.pending;
    delete serverState.dataset.targetOnline;
    serverState.setAttribute("aria-busy", "false");
  }
});

function inputTranscript(item) {
  if (!item.messages?.length) return item.prompt || "[empty prompt]";
  return item.messages
    .map((message) => `${String(message.role || "message").toUpperCase()}\n${message.content || "[empty]"}`)
    .join("\n\n");
}

function setCollapsed(element, collapsed) {
  element.classList.toggle("collapsed", collapsed);
  const toggle = element.querySelector(".exchange-toggle");
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.title = collapsed ? "Expand request" : "Collapse request";
}

function expandOnly(target) {
  exchanges.forEach((element) => setCollapsed(element, element !== target));
  if (target) setCollapsed(target, false);
}

function stringHash(value) {
  let hash = 0;
  for (const character of String(value)) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

function sessionIdentity(item) {
  if (item.session?.id) return item.session;
  const seed = `${item.client || "legacy"}|${item.model || "unknown"}|${item.messages?.[0]?.content || item.prompt || ""}`;
  const suffix = stringHash(seed).toString(16).padStart(4, "0").slice(-4).toUpperCase();
  return { id: `legacy-${suffix}`, label: `Session ${suffix}`, source: "legacy" };
}

function sessionColor(id) {
  const hues = [161, 38, 203, 323, 84, 13, 188, 276, 55, 344, 118, 224];
  return `hsl(${hues[stringHash(id) % hues.length]} 82% 63%)`;
}

function registerSession(item) {
  const session = sessionIdentity(item);
  let entry = sessions.get(session.id);
  if (!entry) {
    entry = { ...session, count: 0, color: sessionColor(session.id) };
    sessions.set(session.id, entry);
    const option = document.createElement("option");
    option.value = session.id;
    sessionFilter.append(option);
  }
  entry.count += 1;
  const option = [...sessionFilter.options].find((candidate) => candidate.value === session.id);
  option.textContent = `${entry.label} · ${entry.count}`;
  return entry;
}

function applySessionFilter(openNewest = false) {
  const selected = sessionFilter.value;
  exchanges.forEach((element) => {
    element.hidden = selected !== "all" && element.dataset.sessionId !== selected;
  });
  if (openNewest) {
    const visible = [...stream.querySelectorAll(".exchange")].filter((element) => !element.hidden);
    const newestVisible = dateSortDirection === "desc" ? visible[0] : visible.at(-1);
    expandOnly(newestVisible || null);
  }
}

function sortExchangeRows() {
  const rows = [...stream.querySelectorAll(".exchange")].sort((left, right) =>
    globalThis.SaxjaxDateTimeSort.compareDateTimes(left, right, dateSortDirection, (element) => element.dataset.startedAt),
  );
  rows.forEach((element) => stream.append(element));
}

function estimateTokens(characterCount, messageCount = 0) {
  if (!characterCount) return 0;
  return Math.max(1, Math.ceil(characterCount / 3.4) + messageCount * 4);
}

function updateLiveTokenEstimate(element, item = {}) {
  const tokenStats = element.querySelector(".token-stats");
  const contextBox = element.querySelector(".context-usage");
  const inputTokens = Number(element.dataset.estimatedInputTokens) || 0;
  const outputCharacters =
    element.querySelector(".response pre").textContent.length +
    element.querySelector(".thinking pre").textContent.length;
  const outputTokens = estimateTokens(outputCharacters);
  const capacity = modelContexts.get(item.model || element.dataset.model);

  tokenStats.classList.add("estimated");
  tokenStats.textContent = `≈${inputTokens.toLocaleString()} in · ≈${outputTokens.toLocaleString()} out · live estimate`;
  contextBox.classList.add("estimated");

  if (inputTokens && capacity) {
    const percent = (inputTokens / capacity) * 100;
    contextBox.style.setProperty("--context-percent", `${Math.min(percent, 100)}%`);
    contextBox.querySelector(".context-label").textContent =
      `≈${inputTokens.toLocaleString()} / ${capacity.toLocaleString()} tokens · ≈${number(percent, 1)}%`;
    contextBox.querySelector("small").textContent =
      "Live estimate from captured text; Ollama’s exact count replaces it when complete.";
    contextBox.classList.toggle("warning", percent >= 70 && percent < 90);
    contextBox.classList.toggle("danger", percent >= 90);
  } else {
    contextBox.querySelector(".context-label").textContent = "Estimating…";
  }
}

function ensureExchange(item, prepend = true) {
  if (exchanges.has(item.id)) return exchanges.get(item.id);
  $("#empty-state")?.remove();
  const fragment = $("#request-template").content.cloneNode(true);
  const element = fragment.querySelector(".exchange");
  const session = registerSession(item);
  element.dataset.id = item.id;
  element.dataset.model = item.model || "";
  element.dataset.startedAt = item.startedAt || "";
  element.dataset.sessionId = session.id;
  element.dataset.source = item.source || "ollama";
  element.style.setProperty("--session-color", session.color);
  element.dataset.estimatedInputTokens = String(
    estimateTokens(inputTranscript(item).length, item.messages?.length || 0),
  );
  element.querySelector(".exchange-model").textContent = item.model || "unknown model";
  const sessionBadge = element.querySelector(".session-badge");
  const sourceLabel = String(item.sourceLabel || item.source || "Ollama").toLocaleUpperCase();
  sessionBadge.textContent = `${sourceLabel} · ${session.label.replace(/^Session\s+/i, "S/")}`;
  sessionBadge.title = `${session.label} · ${session.source} identity`;
  element.querySelector("time").textContent = new Date(item.startedAt).toLocaleTimeString();
  element.querySelector(".prompt pre").textContent = inputTranscript(item);
  element.querySelector(".response pre").textContent = item.response || "";
  if (item.thinking) {
    element.querySelector(".thinking").hidden = false;
    element.querySelector(".thinking pre").textContent = item.thinking;
  } else {
    element.querySelector(".thinking").hidden = true;
  }
  updateExchange(element, item);
  prepend ? stream.prepend(element) : stream.append(element);
  exchanges.set(item.id, element);
  applySessionFilter();
  return element;
}

function updateExchange(element, item) {
  element.classList.remove("active", "complete", "error");
  element.classList.add(item.status || "active");
  if (item.prompt != null || item.messages?.length) {
    element.querySelector(".prompt pre").textContent = inputTranscript(item);
  }
  element.dataset.inputContextStatus = item.inputContextStatus || "captured";
  element.querySelector(".exchange-status").textContent = item.status || "active";
  const failure = item.error || (item.status === "error" ? "Request failed without a reported reason." : "");
  if (failure) {
    element.querySelector(".response pre").textContent = item.response || `ERROR\n${failure}`;
  } else if (item.response != null) {
    element.querySelector(".response pre").textContent = item.response;
  }
  if (item.thinking) {
    element.querySelector(".thinking").hidden = false;
    element.querySelector(".thinking pre").textContent = item.thinking;
  }
  if (item.finishedAt) {
    const elapsed = (new Date(item.finishedAt) - new Date(item.startedAt)) / 1000;
    element.querySelector(".latency").textContent = `${number(elapsed, 2)}s`;
  }
  const m = item.metrics;
  if (m) {
    const estimatedInput = Number(element.dataset.estimatedInputTokens) || 0;
    const estimatedOutput = estimateTokens(
      element.querySelector(".response pre").textContent.length +
      element.querySelector(".thinking pre").textContent.length,
    );
    const inputTokens = m.promptTokens ?? estimatedInput;
    const outputTokens = m.outputTokens ?? estimatedOutput;
    const speed = m.outputTokens && m.outputDurationNs ? m.outputTokens / (m.outputDurationNs / 1e9) : null;
    const tokenStats = element.querySelector(".token-stats");
    tokenStats.classList.toggle("estimated", m.promptTokens == null || m.outputTokens == null);
    tokenStats.textContent = [
      inputTokens ? `${m.promptTokens == null ? "≈" : ""}${inputTokens.toLocaleString()} in` : null,
      outputTokens ? `${m.outputTokens == null ? "≈" : ""}${outputTokens.toLocaleString()} out` : null,
      speed != null ? `${number(speed, 1)} avg tok/s` : null,
    ].filter(Boolean).join(" · ");
  } else {
    updateLiveTokenEstimate(element, item);
  }
  const contextBox = element.querySelector(".context-usage");
  const isCopilot = item.provider === "github-copilot";
  const capacity = m?.contextWindow || (isCopilot ? null : modelContexts.get(item.model));
  const exactUsed = m?.promptTokens;
  const used = exactUsed ?? (Number(element.dataset.estimatedInputTokens) || null);
  if (used != null && capacity) {
    const percent = (used / capacity) * 100;
    contextBox.classList.toggle("estimated", exactUsed == null);
    contextBox.style.setProperty("--context-percent", `${Math.min(percent, 100)}%`);
    contextBox.querySelector(".context-label").textContent = `${exactUsed == null ? "≈" : ""}${used.toLocaleString()} / ${capacity.toLocaleString()} tokens · ${exactUsed == null ? "≈" : ""}${number(percent, 1)}%`;
    contextBox.querySelector("small").textContent = exactUsed == null
      ? "Estimated input tokens versus the context capacity reported by the client."
      : `Exact input tokens and context capacity reported by ${item.client || "the model client"}.`;
    contextBox.classList.toggle("warning", percent >= 70 && percent < 90);
    contextBox.classList.toggle("danger", percent >= 90);
  } else if (item.status === "error") {
    contextBox.classList.remove("estimated", "warning", "danger");
    contextBox.classList.add("unavailable");
    contextBox.style.setProperty("--context-percent", "0%");
    contextBox.querySelector(".context-label").textContent = "Unavailable · request failed";
    contextBox.querySelector("small").textContent =
      "No context usage was reported because this request ended with an error.";
  } else if (isCopilot) {
    contextBox.classList.remove("estimated", "warning", "danger", "unavailable");
    contextBox.style.setProperty("--context-percent", "0%");
    contextBox.querySelector(".context-label").textContent = used
      ? `${exactUsed == null ? "≈" : ""}${used.toLocaleString()} input tokens · limit unavailable`
      : "Context metrics unavailable";
    contextBox.querySelector("small").textContent = `${item.client || "GitHub Copilot"} did not expose a context-window limit for this request.`;
  } else if (m) {
    contextBox.classList.remove("estimated", "warning", "danger", "unavailable");
    contextBox.querySelector(".context-label").textContent = item.status === "active" ? "Calculating…" : "Not reported";
    contextBox.querySelector("small").textContent = "Ollama did not report an exact input-token count for this request.";
  }
}

function follow() {
  if (!restoringView && autofollow.checked) {
    stream.scrollTop = dateSortDirection === "desc" ? 0 : stream.scrollHeight;
  }
}

function showEmptyState(title, detail) {
  const empty = document.createElement("div");
  empty.id = "empty-state";
  empty.className = "empty-state";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.textContent = detail;
  empty.append(heading, copy);
  stream.append(empty);
}

function resetHistoryView(state) {
  stream.replaceChildren();
  exchanges.clear();
  sessions.clear();
  sessionFilter.replaceChildren(new Option("All sessions", "all"));
  $("#total-count").textContent = state.counters.total;
  $("#error-count").textContent = state.counters.errors;
  $("#active-count").textContent = state.active.length;
  [...state.active]
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .forEach((item) => ensureExchange(item, false));
  state.history.forEach((item) => ensureExchange(item, false));
  sortExchangeRows();
  if (!state.active.length && !state.history.length) {
    const title = state.reason === "cleared" ? "History deleted" : "Listening for inference traffic";
    showEmptyState(title, "New Ollama and Copilot CLI requests will appear here and remain until you clear them.");
  }
  applySessionFilter(true);
  persistViewState();
}

const appLocationParams = new URLSearchParams(location.search);
const explicitPrototypeVariant = appLocationParams.get("variant")?.toUpperCase();
const compactPrototypeStream = appLocationParams.get("prototype") === "monitor"
  && explicitPrototypeVariant
  && explicitPrototypeVariant !== "A0";
const eventSource = new EventSource(`/monitor/events${compactPrototypeStream ? "?compact=1" : ""}`);
eventSource.addEventListener("state", (event) => {
  const state = JSON.parse(event.data);
  renderMetrics(state.metrics);
  renderCopilotUsage(state.copilot);
  $("#total-count").textContent = state.counters.total;
  $("#error-count").textContent = state.counters.errors;
  [...state.active]
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .forEach((item) => ensureExchange(item, false));
  state.history.forEach((item) => ensureExchange(item, false));
  sortExchangeRows();
  if (!initialStateRendered) {
    restoreViewState();
    initialStateRendered = true;
  }
});
eventSource.addEventListener("metrics", (event) => renderMetrics(JSON.parse(event.data)));
eventSource.addEventListener("copilot", (event) => renderCopilotUsage(JSON.parse(event.data)));
eventSource.addEventListener("request-started", (event) => {
  const item = JSON.parse(event.data);
  const element = ensureExchange(item, true);
  sortExchangeRows();
  applySessionFilter();
  if (element.hidden) setCollapsed(element, true);
  else {
    expandOnly(element);
    follow();
  }
});
eventSource.addEventListener("token", (event) => {
  const token = JSON.parse(event.data);
  const element = exchanges.get(token.id);
  if (!element) return;
  const target = token.field === "thinking" ? element.querySelector(".thinking pre") : element.querySelector(".response pre");
  if (token.field === "thinking") element.querySelector(".thinking").hidden = false;
  target.textContent += token.value;
  updateLiveTokenEstimate(element);
});
eventSource.addEventListener("request-finished", (event) => {
  const item = JSON.parse(event.data);
  updateExchange(ensureExchange(item), item);
});
eventSource.addEventListener("history-reset", (event) => resetHistoryView(JSON.parse(event.data)));

dateSort.addEventListener("change", () => {
  dateSortDirection = globalThis.SaxjaxDateTimeSort.normalize(dateSort.value);
  const url = new URL(location.href);
  if (dateSortDirection === "asc") url.searchParams.set("sort", "asc"); else url.searchParams.delete("sort");
  history.replaceState(null, "", url);
  sortExchangeRows();
  applySessionFilter(false);
  follow();
  scheduleViewStatePersistence();
  window.dispatchEvent(new CustomEvent("saxjax-date-sort-change", { detail: { direction: dateSortDirection } }));
});

window.addEventListener("saxjax-date-sort-change", (event) => {
  const direction = globalThis.SaxjaxDateTimeSort.normalize(event.detail?.direction);
  if (direction === dateSortDirection) return;
  dateSortDirection = direction;
  dateSort.value = direction;
  sortExchangeRows();
  applySessionFilter(false);
  scheduleViewStatePersistence();
});

stream.addEventListener("click", (event) => {
  const toggle = event.target.closest(".exchange-toggle");
  if (toggle) {
    const exchange = toggle.closest(".exchange");
    if (exchange.classList.contains("collapsed")) expandOnly(exchange);
    else setCollapsed(exchange, true);
    scheduleViewStatePersistence();
    return;
  }
  const trigger = event.target.closest(".open-content");
  if (!trigger) return;
  const exchange = trigger.closest(".exchange");
  const kind = trigger.dataset.kind;
  const content = exchange.querySelector(kind === "in" ? ".prompt pre" : ".response pre").textContent;
  const context = exchange.querySelector(".context-label").textContent;
  const time = exchange.querySelector("time").textContent;
  const model = exchange.querySelector(".exchange-model").textContent;
  const lineCount = content ? content.split("\n").length : 0;

  contentReader.querySelector(".reader-shell").dataset.kind = kind;
  const inputStatus = exchange.dataset.inputContextStatus;
  $("#reader-direction").textContent = kind === "in"
    ? inputStatus === "client-rendered" ? "COPILOT-RENDERED INPUT" : inputStatus === "reconstructed-local" ? "LOCALLY RECONSTRUCTED INPUT" : "INCOMING CONTEXT"
    : "MODEL OUTPUT";
  $("#reader-title").textContent = kind === "in"
    ? inputStatus === "client-rendered" ? "Exact local rendered context" : inputStatus === "reconstructed-local" ? "All locally recorded VS Code context" : "Context at request time"
    : "Complete response";
  $("#reader-model").textContent = model;
  $("#reader-time").textContent = time;
  $("#reader-context").textContent = context;
  $("#reader-content").textContent = content || "[No content]";
  $("#reader-count").textContent = `${content.length.toLocaleString()} characters · ${lineCount.toLocaleString()} lines`;
  contentReader.showModal();
  $("#reader-content").scrollTop = 0;
  $("#reader-content").focus();
});

sessionFilter.addEventListener("change", () => {
  applySessionFilter(true);
  follow();
  persistViewState();
});

autofollow.addEventListener("change", persistViewState);
stream.addEventListener("scroll", () => {
  if (!restoringView && stream.scrollTop > 8 && autofollow.checked) autofollow.checked = false;
  scheduleViewStatePersistence();
}, { passive: true });
window.addEventListener("scroll", scheduleViewStatePersistence, { passive: true });
window.addEventListener("pagehide", persistViewState);

$("#reader-close").addEventListener("click", () => contentReader.close());
contentReader.addEventListener("click", (event) => {
  if (event.target === contentReader) contentReader.close();
});
contentReader.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    contentReader.close();
  }
});

$("#help-open").addEventListener("click", () => {
  helpDialog.showModal();
  helpDialog.querySelector("summary")?.focus();
});
$("#help-close").addEventListener("click", () => helpDialog.close());
helpDialog.addEventListener("click", (event) => {
  if (event.target === helpDialog) helpDialog.close();
});
helpDialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    helpDialog.close();
  }
});
helpDialog.addEventListener("click", async (event) => {
  const button = event.target.closest(".copy-help");
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copy || "");
    button.textContent = "COPIED";
  } catch {
    button.textContent = "COPY FAILED";
  }
  setTimeout(() => { button.textContent = "COPY"; }, 1400);
});

$("#clear-view").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Deleting…";
  try {
    const response = await fetch("/monitor/api/history", { method: "DELETE" });
    const state = await response.json();
    if (!response.ok) throw new Error(state.error || `HTTP ${response.status}`);
    resetHistoryView(state);
    button.textContent = "History deleted";
  } catch (error) {
    button.textContent = "Delete failed";
    button.title = error.message;
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = "Clear view";
    }, 1400);
  }
});

function updateClock() {
  $("#clock").textContent = new Date().toLocaleTimeString("en-GB", { hour12: false });
}

$("#clock-zone").textContent = (Intl.DateTimeFormat().resolvedOptions().timeZone || "LOCAL TIME")
  .replaceAll("_", " ")
  .toUpperCase();
updateClock();
setInterval(updateClock, 1000);
