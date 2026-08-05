// Production adapter for the approved timeline prototype. It exposes only
// normalized local evidence, never raw journals or complete chat content.

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const prototypeUsdPerCredit = 0.01;

function localParts(instant) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return {
    key: `${value("year")}-${value("month")}-${value("day")}`,
    month: `${value("year")}-${value("month")}`,
    minute: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function calendarDays(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from(
    { length: count },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );
}

function monthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)))
    .toUpperCase();
}

function modelFamily(event) {
  const value = String(
    event.model?.family || event.model?.exactLabel || "other",
  ).toLowerCase();
  if (value.includes("claude")) return "claude";
  if (value.includes("gemini")) return "gemini";
  if (value.includes("gpt") || value.includes("openai")) return "gpt";
  if (value.includes("llama")) return "llama";
  return "other";
}

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function fixtureFrom(snapshot) {
  const indexed = (snapshot.usageEvents || [])
    .filter(
      (event) =>
        event?.timing?.usageAt &&
        Number.isFinite(Date.parse(event.timing.usageAt)),
    )
    .map((event, index) => ({
      event,
      index,
      point: localParts(event.timing.usageAt),
    }));
  const origins = [
    ["gpt", "GPT / OPENAI"],
    ["claude", "CLAUDE"],
    ["gemini", "GEMINI"],
    ["llama", "LLAMA"],
    ["other", "OTHER"],
  ];
  const colors = {
    gpt: "#70a5ff",
    claude: "#b48cff",
    gemini: "#ffb000",
    llama: "#56f2c4",
    other: "#f08f7a",
  };
  const months = [...new Set(indexed.map((item) => item.point.month))]
    .sort()
    .map((key) => {
      const dates = calendarDays(key);
      const dayIndex = new Map(dates.map((date, index) => [date, index]));
      const sessions = indexed
        .filter((item) => item.point.month === key)
        .map(({ event, index, point }) => {
          const startedAt =
            event.timing?.startedAt &&
            Number.isFinite(Date.parse(event.timing.startedAt))
              ? event.timing.startedAt
              : event.timing.usageAt;
          const started = localParts(startedAt);
          const duration = Math.max(
            1,
            Math.round((finite(event.timing?.durationMs) || 0) / 60000),
          );
          const totalTokens = finite(event.measurements?.totalTokens);
          const inputTokens = finite(event.measurements?.inputTokens);
          const outputTokens = finite(event.measurements?.outputTokens);
          return {
            id: index,
            day: dayIndex.get(point.key),
            start: started.minute,
            end: Math.min(1440, started.minute + duration),
            origin: modelFamily(event),
            inputTokens:
              inputTokens == null && totalTokens != null
                ? Math.max(0, totalTokens - (outputTokens || 0))
                : inputTokens,
            outputTokens,
            credits: finite(event.measurements?.nativeUnit?.value),
            promptExcerpt: event.promptExcerpt || "",
            sourceRef: [
              event.sourceReference?.client || "VS Code Insiders",
              event.sourceReference?.journalSessionId
                ? `session ${event.sourceReference.journalSessionId}`
                : "session unavailable",
              event.sourceReference?.requestStartedAt ||
                event.timing?.startedAt ||
                event.timing?.usageAt,
            ].join(" · "),
          };
        })
        .filter((session) => Number.isInteger(session.day))
        .sort(
          (left, right) =>
            left.day - right.day ||
            left.start - right.start ||
            left.id - right.id,
        );
      return { key, label: monthLabel(key), dates, sessions };
    });
  return {
    origins,
    colors,
    moneyAvailable: true,
    usdPerCredit: prototypeUsdPerCredit,
    moneyNotice:
      "≈ USD is a local prototype estimate at 100 displayed credits ≈ $1, not GitHub billing.",
    profileLabel:
      snapshot.profiles?.find(
        (profile) => profile.id === "github-copilot:local:vscode-insiders",
      )?.label || "Unverified local profile",
    months,
  };
}

async function snapshot() {
  const buffered = window.SaxjaxMonitorStore?.getLatest?.("usage-timeline");
  if (buffered) return buffered;
  const response = await fetch("/monitor/api/usage-timeline", {
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Timeline request failed (${response.status})`);
  return response.json();
}

async function start() {
  globalThis.__usageTimelinePrototypeFixture = fixtureFrom(await snapshot());
  await import("/monitor/usage-timeline-prototype.js");
}

try {
  await start();
} catch (error) {
  const host = document.createElement("section");
  host.className = "timeline-prototype";
  host.textContent = `Usage timeline unavailable: ${error.message}`;
  document.querySelector(".workbench")?.before(host);
}
