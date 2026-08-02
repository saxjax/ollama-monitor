// PROTOTYPE — local review data for the disposable monitor UX variants.

import path from "node:path";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";

export const PROTOTYPE_FEEDBACK_SCHEMA_VERSION = 1;
export const PROTOTYPE_ID = "monitor-ux-2026-08";

const COMMENT_LIMIT = 10_000;
const ACTIVITY_LIMIT = 10_000;

function text(value, maximum = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maximum);
}

function instant(value, fallback = new Date().toISOString()) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

function emptyState() {
  return {
    schemaVersion: PROTOTYPE_FEEDBACK_SCHEMA_VERSION,
    prototypeId: PROTOTYPE_ID,
    installationId: randomUUID(),
    reviewer: { id: randomUUID(), name: "", team: "" },
    comments: [],
    activity: [],
    importedBundles: [],
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeReviewer(candidate, fallback = {}) {
  return {
    id: text(candidate?.id, 100) || fallback.id || randomUUID(),
    name: typeof candidate?.name === "string" ? text(candidate.name, 120) : (fallback.name || ""),
    team: typeof candidate?.team === "string" ? text(candidate.team, 120) : (fallback.team || ""),
  };
}

function sanitizeContext(candidate) {
  if (!candidate || typeof candidate !== "object") return {};
  return Object.fromEntries(["month", "unit", "day", "slot", "session", "zoom", "provider", "origin", "model", "variantVisits", "variantActiveMs", "targetUses"]
    .map((key) => [key, text(candidate[key], 240)])
    .filter(([, value]) => value));
}

function sanitizeComment(candidate, fallbackAuthor, now = new Date().toISOString()) {
  const body = text(candidate?.body, 4_000);
  const variant = text(candidate?.variant, 20).toUpperCase();
  const targetId = text(candidate?.target?.id, 300);
  if (!body || !variant || !targetId) return null;
  return {
    id: text(candidate.id, 120) || randomUUID(),
    prototypeId: PROTOTYPE_ID,
    variant,
    target: {
      id: targetId,
      kind: text(candidate.target?.kind, 40) || "section",
      label: text(candidate.target?.label, 240) || targetId,
    },
    context: sanitizeContext(candidate.context),
    sentiment: ["works", "problem", "idea", "question"].includes(candidate.sentiment) ? candidate.sentiment : "idea",
    body,
    author: sanitizeReviewer(candidate.author, fallbackAuthor),
    createdAt: instant(candidate.createdAt, now),
    updatedAt: instant(candidate.updatedAt, now),
  };
}

function sanitizeActivity(candidate, installationId, now = new Date().toISOString()) {
  const variant = text(candidate?.variant, 20).toUpperCase();
  const feature = text(candidate?.feature, 160);
  if (!variant || !feature) return null;
  const targetId = text(candidate?.targetId, 300);
  const sourceInstallationId = text(candidate?.installationId, 120) || installationId;
  return {
    id: text(candidate?.id, 500) || `${sourceInstallationId}:${variant}:${feature}:${targetId || "all"}`,
    installationId: sourceInstallationId,
    variant,
    feature,
    targetId: targetId || null,
    count: Math.max(0, Math.trunc(Number(candidate?.count) || 0)),
    activeMs: Math.max(0, Math.trunc(Number(candidate?.activeMs) || 0)),
    firstAt: instant(candidate?.firstAt, now),
    lastAt: instant(candidate?.lastAt, now),
  };
}

function sanitizeLoaded(candidate) {
  const fallback = emptyState();
  if (candidate?.schemaVersion !== PROTOTYPE_FEEDBACK_SCHEMA_VERSION) return fallback;
  const installationId = text(candidate.installationId, 120) || fallback.installationId;
  const reviewer = sanitizeReviewer(candidate.reviewer, fallback.reviewer);
  return {
    ...fallback,
    installationId,
    reviewer,
    comments: (Array.isArray(candidate.comments) ? candidate.comments : []).map((item) => sanitizeComment(item, reviewer)).filter(Boolean).slice(-COMMENT_LIMIT),
    activity: (Array.isArray(candidate.activity) ? candidate.activity : []).map((item) => sanitizeActivity(item, installationId)).filter(Boolean).slice(-ACTIVITY_LIMIT),
    importedBundles: (Array.isArray(candidate.importedBundles) ? candidate.importedBundles : []).map((item) => text(item, 120)).filter(Boolean).slice(-1_000),
    updatedAt: instant(candidate.updatedAt),
  };
}

function clone(value) {
  return structuredClone(value);
}

export async function createPrototypeFeedbackStore({ dataDir, fileName = "prototype-feedback-v1.json" } = {}) {
  if (!dataDir) throw new Error("createPrototypeFeedbackStore requires dataDir");
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const filePath = path.join(dataDir, fileName);
  let state = emptyState();
  try {
    state = sanitizeLoaded(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  let writes = Promise.resolve();
  function persist() {
    state.updatedAt = new Date().toISOString();
    writes = writes.then(async () => {
      const temporaryPath = `${filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, filePath);
      await chmod(filePath, 0o600);
    });
    return writes;
  }

  return {
    filePath,
    snapshot: () => clone(state),
    async setReviewer(candidate) {
      state.reviewer = sanitizeReviewer(candidate, state.reviewer);
      await persist();
      return clone(state);
    },
    async addComment(candidate) {
      const comment = sanitizeComment(candidate, state.reviewer);
      if (!comment) throw new Error("A comment, variant, and review target are required");
      const index = state.comments.findIndex((item) => item.id === comment.id);
      if (index >= 0) state.comments[index] = { ...state.comments[index], ...comment, createdAt: state.comments[index].createdAt };
      else state.comments.push(comment);
      state.comments = state.comments.slice(-COMMENT_LIMIT);
      await persist();
      return { comment: clone(comment), snapshot: clone(state) };
    },
    async deleteComment(id) {
      const safeId = text(id, 120);
      state.comments = state.comments.filter((item) => item.id !== safeId);
      await persist();
      return clone(state);
    },
    async recordActivity(entries = []) {
      const byId = new Map(state.activity.map((item) => [item.id, item]));
      const now = new Date().toISOString();
      for (const candidate of entries.slice(0, 500)) {
        const delta = sanitizeActivity(candidate, state.installationId, now);
        if (!delta) continue;
        const existing = byId.get(delta.id);
        byId.set(delta.id, existing ? {
          ...existing,
          count: existing.count + delta.count,
          activeMs: existing.activeMs + delta.activeMs,
          lastAt: now,
        } : delta);
      }
      state.activity = [...byId.values()].slice(-ACTIVITY_LIMIT);
      await persist();
      return clone(state);
    },
    async importBundle(candidate) {
      if (candidate?.schemaVersion !== PROTOTYPE_FEEDBACK_SCHEMA_VERSION || candidate?.prototypeId !== PROTOTYPE_ID) {
        throw new Error("This is not a compatible Saxjax prototype review bundle");
      }
      const bundleId = text(candidate.bundleId, 120) || randomUUID();
      const fallbackAuthor = sanitizeReviewer(candidate.reviewer);
      const commentById = new Map(state.comments.map((item) => [item.id, item]));
      const activityById = new Map(state.activity.map((item) => [item.id, item]));
      for (const raw of (Array.isArray(candidate.comments) ? candidate.comments : []).slice(0, COMMENT_LIMIT)) {
        const item = sanitizeComment(raw, fallbackAuthor);
        if (!item) continue;
        const existing = commentById.get(item.id);
        if (!existing || Date.parse(item.updatedAt) >= Date.parse(existing.updatedAt)) commentById.set(item.id, item);
      }
      for (const raw of (Array.isArray(candidate.activity) ? candidate.activity : []).slice(0, ACTIVITY_LIMIT)) {
        const item = sanitizeActivity(raw, text(candidate.installationId, 120));
        if (!item) continue;
        const existing = activityById.get(item.id);
        // Exported activity is cumulative. Max makes repeated and overlapping imports idempotent.
        activityById.set(item.id, existing ? {
          ...existing,
          count: Math.max(existing.count, item.count),
          activeMs: Math.max(existing.activeMs, item.activeMs),
          firstAt: Date.parse(existing.firstAt) <= Date.parse(item.firstAt) ? existing.firstAt : item.firstAt,
          lastAt: Date.parse(existing.lastAt) >= Date.parse(item.lastAt) ? existing.lastAt : item.lastAt,
        } : item);
      }
      state.comments = [...commentById.values()].slice(-COMMENT_LIMIT);
      state.activity = [...activityById.values()].slice(-ACTIVITY_LIMIT);
      if (!state.importedBundles.includes(bundleId)) state.importedBundles.push(bundleId);
      state.importedBundles = state.importedBundles.slice(-1_000);
      await persist();
      return clone(state);
    },
    exportBundle() {
      return {
        schemaVersion: PROTOTYPE_FEEDBACK_SCHEMA_VERSION,
        prototypeId: PROTOTYPE_ID,
        bundleId: randomUUID(),
        exportedAt: new Date().toISOString(),
        installationId: state.installationId,
        reviewer: clone(state.reviewer),
        comments: clone(state.comments),
        activity: clone(state.activity.filter((item) => item.installationId === state.installationId)),
      };
    },
    async reset() {
      const identity = { installationId: state.installationId, reviewer: state.reviewer };
      state = { ...emptyState(), ...identity };
      await unlink(filePath).catch((error) => { if (error.code !== "ENOENT") throw error; });
      return clone(state);
    },
  };
}
