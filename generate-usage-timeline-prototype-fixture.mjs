// Generates a private, Git-ignored fixture for the usage-timeline prototype.
// It retains a short local-only prompt excerpt and opaque source reference, but excludes
// responses, paths, raw IDs, and tool payloads.
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseVsCodeChatJournal } from "./copilot-capture.mjs";

const execFileAsync = promisify(execFile);
const sourceRoot = process.env.VSCODE_INSIDERS_WORKSPACE_STORAGE
  || "/Users/jav/Library/Application Support/Code - Insiders/User/workspaceStorage";
const destination = join(process.cwd(), "public", "usage-timeline-prototype-fixture.js");
const colours = { opus: "#b48cff", gpt: "#70a5ff", sonnet: "#ffb000", other: "#56f2c4" };
const origins = [["opus", "Claude Opus"], ["gpt", "GPT"], ["sonnet", "Claude Sonnet"], ["other", "Other"]];

const detailsCredit = (value) => {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (key === "details" && typeof child === "string") {
      const match = child.match(/^(.+?)\s*•\s*([\d.]+)\s+credits?$/i);
      if (match) return { model: match[1].trim(), credits: Number(match[2]) };
    }
    const found = detailsCredit(child);
    if (found) return found;
  }
  return null;
};

const modelOrigin = (model) => {
  const normalized = String(model || "").toLowerCase();
  if (normalized.includes("opus")) return "opus";
  if (normalized.includes("gpt")) return "gpt";
  if (normalized.includes("sonnet")) return "sonnet";
  return "other";
};

const promptExcerpt = (request) => {
  const candidate = typeof request.message?.text === "string" ? request.message.text
    : typeof request.message === "string" ? request.message : "";
  return candidate.replace(/\s+/g, " ").trim().slice(0, 180) || "(No prompt text recorded by VS Code)";
};

const localDate = (value) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(value));

const localMinute = (value) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const valueFor = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return valueFor("hour") * 60 + valueFor("minute");
};

const labelDate = (isoDate) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Copenhagen", weekday: "short", day: "2-digit",
}).format(new Date(`${isoDate}T12:00:00Z`)).toUpperCase();

const { stdout } = await execFileAsync("/usr/bin/find", [sourceRoot, "-type", "f", "-path", "*/chatSessions/*", "-print"], { maxBuffer: 64 * 1024 * 1024 });
const files = stdout.split("\n").filter(Boolean);
const raw = [];

for (const file of files) {
  const state = parseVsCodeChatJournal(await readFile(file, "utf8"));
  for (const request of state.requests || []) {
    const credit = detailsCredit(request);
    const timestamp = Number(request.timestamp);
    if (!credit || !Number.isFinite(timestamp)) continue;
    const metadata = request.result?.metadata || {};
    const elapsedMs = Number(request.elapsedMs ?? request.result?.timings?.totalElapsed) || 0;
    raw.push({
      key: `${basename(file)}:${request.requestId || request.responseId || timestamp}`,
      sourceRef: `VS Code Insiders chat · ${basename(file).replace(/\.[^.]+$/, "").slice(0, 8)} · ${localDate(timestamp)}`,
      date: localDate(timestamp),
      month: localDate(timestamp).slice(0, 7),
      start: localMinute(timestamp),
      duration: Math.max(1, Math.round(elapsedMs / 60_000)),
      origin: modelOrigin(credit.model || request.modelId || metadata.resolvedModel),
      inputTokens: Number(request.promptTokens ?? metadata.promptTokens) || 0,
      outputTokens: Number(request.completionTokens ?? metadata.completionTokens ?? metadata.outputTokens) || 0,
      credits: credit.credits,
      promptExcerpt: promptExcerpt(request),
    });
  }
}

const monthLabel = (month) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00Z`)).toUpperCase();
// Keep the six latest calendar months with local credit data, then let the prototype compare them.
const monthKeys = [...new Set(raw.map((record) => record.month))].sort().slice(-6);
const months = monthKeys.map((month) => {
  const records = raw.filter((record) => record.month === month);
  const dates = [...new Set(records.map((record) => record.date))].sort();
  const indexForDate = new Map(dates.map((date, index) => [date, index]));
  const byKey = new Map();
  for (const record of records) {
    const day = indexForDate.get(record.date);
    if (day == null) continue;
    byKey.set(record.key, {
      id: byKey.size + 1,
      day,
      start: Math.max(8 * 60, Math.min(18 * 60 - 1, record.start)),
      end: Math.max(8 * 60 + 1, Math.min(18 * 60, record.start + record.duration)),
      origin: record.origin,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      credits: record.credits,
      promptExcerpt: record.promptExcerpt,
      sourceRef: record.sourceRef,
    });
  }
  return { key: month, label: monthLabel(month), dates: dates.map(labelDate), sessions: [...byKey.values()].sort((left, right) => left.day - right.day || left.start - right.start) };
}).filter((month) => month.sessions.length);

const fixture = {
  generatedAt: new Date().toISOString(),
  source: "VS Code Insiders local chat-session metadata",
  origins,
  colors: colours,
  months,
};
const serialisedFixture = JSON.stringify(fixture).replaceAll("<", "\\u003c");
await writeFile(destination, `// Private local prototype fixture. Git-ignored.\nglobalThis.__usageTimelinePrototypeFixture = ${serialisedFixture};\n`, { mode: 0o600 });
console.log(`Wrote ${fixture.months.reduce((sum, month) => sum + month.sessions.length, 0)} private records across ${fixture.months.length} months to ${destination}`);
