function partsAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return { year: value("year"), month: value("month"), day: value("day"), hour: Number(value("hour")), minute: Number(value("minute")) };
}

function tokenValue(measurements = {}) {
  if (Number.isFinite(measurements.totalTokens)) return measurements.totalTokens;
  const values = [measurements.inputTokens, measurements.outputTokens].filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function displayValue(event, unit) {
  if (unit === "native") return Number.isFinite(event.measurements?.nativeUnit?.value) ? event.measurements.nativeUnit.value : null;
  if (unit === "tokens") return tokenValue(event.measurements);
  // Monetary estimates are intentionally unavailable until a versioned pricing
  // rule produces them.  Native credits are never silently converted to money.
  if (unit === "money") return Number.isFinite(event.monetaryEstimate?.amount) ? event.monetaryEstimate.amount : null;
  return null;
}

export function timelineMonths(events, timeZone) {
  return [...new Set(events.map((event) => {
    const point = partsAt(event.timing.usageAt, timeZone);
    return `${point.year}-${point.month}`;
  }))].sort();
}

export function buildUsageTimelineViewModel(events, {
  unit = "native",
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  month = null,
  referenceMonth = null,
} = {}) {
  const validEvents = events.filter((event) => event?.timing?.usageAt && Number.isFinite(Date.parse(event.timing.usageAt)));
  const months = timelineMonths(validEvents, timeZone);
  const selectedMonth = month && months.includes(month) ? month : months.at(-1) || null;
  const selected = [];
  const reference = [];
  for (const event of validEvents) {
    const point = partsAt(event.timing.usageAt, timeZone);
    const eventMonth = `${point.year}-${point.month}`;
    const value = displayValue(event, unit);
    const projection = { event, point, eventMonth, value, bucket: point.hour * 2 + Math.floor(point.minute / 30) };
    if (eventMonth === selectedMonth) selected.push(projection);
    if (eventMonth === referenceMonth) reference.push(projection);
  }

  const dayKeys = selectedMonth ? (() => {
    const [year, monthNumber] = selectedMonth.split("-").map(Number);
    const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    return Array.from({ length: days }, (_, index) => `${selectedMonth}-${String(index + 1).padStart(2, "0")}`);
  })() : [];
  const slotByKey = new Map();
  for (const day of dayKeys) {
    for (let bucket = 0; bucket < 48; bucket += 1) {
      slotByKey.set(`${day}:${bucket}`, { id: `${day}:${bucket}`, day, bucket, total: 0, byModelFamily: {}, events: [] });
    }
  }
  for (const item of selected) {
    const key = `${item.point.year}-${item.point.month}-${item.point.day}:${item.bucket}`;
    const slot = slotByKey.get(key);
    if (!slot) continue;
    slot.events.push(item.event);
    if (item.value == null) continue;
    slot.total += item.value;
    const family = item.event.model?.family || "other";
    slot.byModelFamily[family] = (slot.byModelFamily[family] || 0) + item.value;
  }
  const slots = [...slotByKey.values()];
  let running = 0;
  const cumulative = slots.map((slot) => ({ slotId: slot.id, total: (running += slot.total) }));

  // Reference alignment is calendar-day and 30-minute-slot based. It never
  // resamples an unrelated high-usage month.
  const referenceByAlignedSlot = new Map();
  for (const item of reference) {
    if (item.value == null) continue;
    const key = `${item.point.day}:${item.bucket}`;
    referenceByAlignedSlot.set(key, (referenceByAlignedSlot.get(key) || 0) + item.value);
  }
  const referenceTotals = slots.map((slot) => referenceByAlignedSlot.get(`${slot.day.slice(-2)}:${slot.bucket}`) || 0);
  const scalePeak = Math.max(1, ...slots.map((slot) => slot.total), ...(referenceMonth ? referenceTotals : []));
  const measured = selected.filter((item) => item.value != null).length;
  const ledger = [...selected].sort((left, right) => left.event.timing.startedAt.localeCompare(right.event.timing.startedAt) || left.event.id.localeCompare(right.event.id)).map(({ event, value }) => ({ event, value }));

  return {
    unit,
    timeZone,
    months,
    selectedMonth,
    referenceMonth: referenceMonth && months.includes(referenceMonth) && referenceMonth !== selectedMonth ? referenceMonth : null,
    slots,
    cumulative,
    referenceTotals,
    scalePeak,
    measurementCoverage: { totalEvents: selected.length, measuredEvents: measured, missingEvents: selected.length - measured },
    ledger,
  };
}
