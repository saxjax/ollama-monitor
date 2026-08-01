import assert from "node:assert/strict";
import test from "node:test";
import { copilotTokenUrl, createCopilotUsageMonitor, normalizeCopilotUsage } from "./copilot-usage.mjs";

const payload = {
  timePeriod: { year: 2026, month: 8 },
  usageItems: [
    { model: "GPT-5", grossQuantity: 12, netQuantity: 2, netAmount: 0.02 },
    { model: "GPT-5", grossQuantity: 3, netQuantity: 1, netAmount: 0.01 },
    { model: "Claude Sonnet", grossQuantity: 5, netQuantity: 0, netAmount: 0 },
  ],
};

test("normalizes AI credit usage across models", () => {
  const result = normalizeCopilotUsage(
    { scope: "organization", owner: "acme", user: "monalisa", monthlyBudgetUsd: 0.10 },
    payload,
    "2026-08-01T00:00:00.000Z",
  );
  assert.equal(result.usedCredits, 20);
  assert.equal(result.billableCredits, 3);
  assert.equal(result.estimatedCost, 0.03);
  assert.equal(result.monthlyBudgetUsd, 0.10);
  assert.equal(Math.round(result.budgetUsedPercent), 30);
  assert.equal(result.budgetRemainingUsd, 0.07);
  assert.equal(result.period, "2026-08");
  assert.deepEqual(result.models.map(({ model, usedCredits }) => ({ model, usedCredits })), [
    { model: "GPT-5", usedCredits: 15 },
    { model: "Claude Sonnet", usedCredits: 5 },
  ]);
});

test("uses the organization billing endpoint", async () => {
  let requestedUrl;
  const monitor = createCopilotUsageMonitor({
    configPath: "unused",
    loadConfig: async () => ({ scope: "organization", owner: "acme", user: "managed_user" }),
    readToken: async () => "secret",
    now: () => new Date("2026-08-01T00:00:00.000Z"),
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => payload };
    },
  });
  const result = await monitor.refresh();
  assert.equal(requestedUrl.pathname, "/organizations/acme/settings/billing/ai_credit/usage");
  assert.equal(requestedUrl.search, "?year=2026&month=8&user=managed_user");
  assert.equal(result.status, "ready");
});

test("uses the personal billing endpoint", async () => {
  let requestedUrl;
  const monitor = createCopilotUsageMonitor({
    configPath: "unused",
    loadConfig: async () => ({ scope: "user", owner: "monalisa" }),
    readToken: async () => "secret",
    now: () => new Date("2026-08-01T00:00:00.000Z"),
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => payload };
    },
  });
  await monitor.refresh();
  assert.equal(requestedUrl.pathname, "/users/monalisa/settings/billing/ai_credit/usage");
});

test("reports an unconfigured state when no config exists", async () => {
  const monitor = createCopilotUsageMonitor({
    configPath: "missing",
    loadConfig: async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); },
  });
  assert.equal((await monitor.refresh()).status, "unconfigured");
});

test("builds a prefilled organization token link", () => {
  const url = new URL(copilotTokenUrl({ scope: "organization", owner: "acme-corp" }));
  assert.equal(url.pathname, "/settings/personal-access-tokens/new");
  assert.equal(url.searchParams.get("target_name"), "acme-corp");
  assert.equal(url.searchParams.get("organization_administration"), "read");
  assert.equal(url.searchParams.get("plan"), null);
});

test("saves a local monthly budget without replacing billing identity", async () => {
  let config = { scope: "organization", owner: "acme", user: "managed_user" };
  const monitor = createCopilotUsageMonitor({
    configPath: "unused",
    loadConfig: async () => ({ ...config }),
    saveConfig: async (_path, value) => { config = value; },
    readToken: async () => "secret",
    fetchImpl: async () => ({ ok: true, json: async () => payload }),
  });
  const result = await monitor.setBudget(125.50);
  assert.deepEqual(config, { scope: "organization", owner: "acme", user: "managed_user", monthlyBudgetUsd: 125.5 });
  assert.equal(result.monthlyBudgetUsd, 125.5);
});

test("saves a custom local token price without replacing billing identity", async () => {
  let config = { scope: "organization", owner: "acme", user: "managed_user" };
  const monitor = createCopilotUsageMonitor({
    configPath: "unused",
    loadConfig: async () => ({ ...config }),
    saveConfig: async (_path, value) => { config = value; },
    readToken: async () => "secret",
    fetchImpl: async () => ({ ok: true, json: async () => payload }),
  });
  const result = await monitor.setTokenPrice(1.234567);
  assert.deepEqual(config, {
    scope: "organization", owner: "acme", user: "managed_user", tokenPriceUsdPerMillion: 1.234567,
  });
  assert.equal(result.tokenPriceUsdPerMillion, 1.234567);
});
