import { execFile } from "node:child_process";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const keychainService = "io.github.saxjax.ollama-monitor.copilot";
const tokenStatusUrl = "https://github.com/settings/personal-access-tokens";

export function copilotTokenUrl(config = {}) {
  const url = new URL("https://github.com/settings/personal-access-tokens/new");
  url.searchParams.set("name", "Saxjax Monitor");
  url.searchParams.set("description", "Read-only Copilot AI-credit usage for Saxjax Monitor");
  url.searchParams.set("expires_in", "30");
  if (config.owner) url.searchParams.set("target_name", config.owner);
  if (config.scope === "organization") url.searchParams.set("organization_administration", "read");
  if (config.scope === "user") url.searchParams.set("plan", "read");
  return url.href;
}

function emptyState(status = "unconfigured", detail = "Run configure-copilot.sh to connect GitHub billing.") {
  return {
    status,
    detail,
    scope: null,
    owner: null,
    user: null,
    period: null,
    usedCredits: null,
    billableCredits: null,
    estimatedCost: null,
    monthlyBudgetUsd: null,
    tokenPriceUsdPerMillion: null,
    budgetUsedPercent: null,
    budgetRemainingUsd: null,
    models: [],
    updatedAt: null,
    tokenStatusUrl,
    tokenUrl: copilotTokenUrl(),
  };
}

export function normalizeCopilotUsage(config, payload, updatedAt = new Date().toISOString()) {
  const models = new Map();
  let usedCredits = 0;
  let billableCredits = 0;
  let estimatedCost = 0;

  for (const item of payload.usageItems || []) {
    const used = Number(item.grossQuantity) || 0;
    const billable = Number(item.netQuantity) || 0;
    const cost = Number(item.netAmount) || 0;
    const model = item.model || item.sku || "Unspecified";
    const current = models.get(model) || { model, usedCredits: 0, billableCredits: 0, estimatedCost: 0 };
    current.usedCredits += used;
    current.billableCredits += billable;
    current.estimatedCost += cost;
    models.set(model, current);
    usedCredits += used;
    billableCredits += billable;
    estimatedCost += cost;
  }

  const time = payload.timePeriod || {};
  const period = [time.year, time.month && String(time.month).padStart(2, "0")].filter(Boolean).join("-") || null;
  const monthlyBudgetUsd = Number(config.monthlyBudgetUsd) > 0 ? Number(config.monthlyBudgetUsd) : null;
  const tokenPriceUsdPerMillion = Number(config.tokenPriceUsdPerMillion) > 0 ? Number(config.tokenPriceUsdPerMillion) : null;
  return {
    status: "ready",
    detail: null,
    scope: config.scope,
    owner: config.owner,
    user: config.scope === "organization" ? config.user : config.owner,
    period,
    usedCredits,
    billableCredits,
    estimatedCost,
    monthlyBudgetUsd,
    tokenPriceUsdPerMillion,
    budgetUsedPercent: monthlyBudgetUsd ? (estimatedCost / monthlyBudgetUsd) * 100 : null,
    budgetRemainingUsd: monthlyBudgetUsd ? Math.max(0, monthlyBudgetUsd - estimatedCost) : null,
    models: [...models.values()].sort((a, b) => b.usedCredits - a.usedCredits),
    updatedAt,
    tokenStatusUrl,
    tokenUrl: copilotTokenUrl(config),
  };
}

async function defaultLoadConfig(configPath) {
  return JSON.parse(await readFile(configPath, "utf8"));
}

async function defaultSaveConfig(configPath, config) {
  const staging = `${configPath}.${process.pid}.tmp`;
  await writeFile(staging, `${JSON.stringify(config)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(staging, 0o600);
  await rename(staging, configPath);
}

async function defaultReadToken(account) {
  const { stdout } = await execFileAsync("/usr/bin/security", [
    "find-generic-password",
    "-a", account,
    "-s", keychainService,
    "-w",
  ], { timeout: 5000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

export function createCopilotUsageMonitor({
  configPath,
  loadConfig = defaultLoadConfig,
  saveConfig = defaultSaveConfig,
  readToken = defaultReadToken,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) {
  let state = emptyState();
  let pending = null;

  async function performRefresh() {
    let config;
    try {
      config = await loadConfig(configPath);
    } catch (error) {
      if (error?.code === "ENOENT") return (state = emptyState());
      return (state = emptyState("error", `Could not read Copilot configuration: ${error.message}`));
    }

    const validOrganization = (value) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value || "");
    const validUser = (value) => /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,99})$/.test(value || "");
    const validIdentity = config.scope === "organization"
      ? validOrganization(config.owner) && validUser(config.user)
      : config.scope === "user" && validUser(config.owner);
    if (!validIdentity) {
      return (state = emptyState("error", "Copilot billing configuration is invalid."));
    }

    state = {
      ...emptyState("loading", "Refreshing GitHub billing usage…"),
      scope: config.scope,
      owner: config.owner,
      user: config.scope === "organization" ? config.user : config.owner,
      tokenUrl: copilotTokenUrl(config),
      monthlyBudgetUsd: Number(config.monthlyBudgetUsd) > 0 ? Number(config.monthlyBudgetUsd) : null,
      tokenPriceUsdPerMillion: Number(config.tokenPriceUsdPerMillion) > 0 ? Number(config.tokenPriceUsdPerMillion) : null,
    };
    try {
      const token = await readToken(`${config.scope}:${config.owner}`);
      if (!token) throw new Error("The GitHub token is empty");
      const ownerPath = config.scope === "organization" ? `organizations/${config.owner}` : `users/${config.owner}`;
      const date = now();
      const url = new URL(`https://api.github.com/${ownerPath}/settings/billing/ai_credit/usage`);
      url.searchParams.set("year", String(date.getUTCFullYear()));
      url.searchParams.set("month", String(date.getUTCMonth() + 1));
      if (config.scope === "organization") url.searchParams.set("user", config.user);
      const response = await fetchImpl(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2026-03-10",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(`GitHub returned ${response.status}${body.message ? `: ${body.message}` : ""}`);
      }
      state = normalizeCopilotUsage(config, await response.json(), date.toISOString());
    } catch (error) {
      state = {
        ...emptyState("error", `Copilot usage unavailable: ${error.message}`),
        scope: config.scope,
        owner: config.owner,
        user: config.scope === "organization" ? config.user : config.owner,
        updatedAt: now().toISOString(),
        tokenUrl: copilotTokenUrl(config),
        monthlyBudgetUsd: Number(config.monthlyBudgetUsd) > 0 ? Number(config.monthlyBudgetUsd) : null,
        tokenPriceUsdPerMillion: Number(config.tokenPriceUsdPerMillion) > 0 ? Number(config.tokenPriceUsdPerMillion) : null,
      };
    }
    return state;
  }

  return {
    snapshot: () => state,
    refresh() {
      if (!pending) pending = performRefresh().finally(() => { pending = null; });
      return pending;
    },
    async setBudget(value) {
      const monthlyBudgetUsd = Number(value);
      if (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 0 || monthlyBudgetUsd > 1_000_000) {
        throw new Error("Monthly budget must be between $0 and $1,000,000");
      }
      const config = await loadConfig(configPath);
      if (monthlyBudgetUsd === 0) delete config.monthlyBudgetUsd;
      else config.monthlyBudgetUsd = Math.round(monthlyBudgetUsd * 100) / 100;
      await saveConfig(configPath, config);
      return performRefresh();
    },
    async setTokenPrice(value) {
      const tokenPriceUsdPerMillion = Number(value);
      if (!Number.isFinite(tokenPriceUsdPerMillion) || tokenPriceUsdPerMillion < 0 || tokenPriceUsdPerMillion > 1_000_000) {
        throw new Error("Token price must be between $0 and $1,000,000 per million tokens");
      }
      const config = await loadConfig(configPath);
      if (tokenPriceUsdPerMillion === 0) delete config.tokenPriceUsdPerMillion;
      else config.tokenPriceUsdPerMillion = Math.round(tokenPriceUsdPerMillion * 1_000_000) / 1_000_000;
      await saveConfig(configPath, config);
      return performRefresh();
    },
  };
}
