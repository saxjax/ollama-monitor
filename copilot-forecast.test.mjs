import assert from "node:assert/strict";
import test from "node:test";
import { copilotModelRates, forecastCopilotUsage, summarizeCopilotTokens } from "./copilot-forecast.mjs";

test("estimates credits, velocity, exhaustion, and sustainable parallel work", () => {
  const forecast = forecastCopilotUsage([{
    status: "complete",
    model: "Claude Sonnet 4.6",
    startedAt: "2026-08-09T12:00:00Z",
    metrics: { promptTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 500_000 },
  }], 10, new Date("2026-08-10T12:00:00Z"));
  assert.equal(forecast.costUsd, 3.15);
  assert.equal(forecast.credits, 315);
  assert.equal(forecast.creditsPerDay, 315);
  assert.equal(Math.round(forecast.daysUntilExhausted * 100) / 100, 2.17);
  assert.equal(forecast.sustainableParallelFactor < 1, true);
});

test("uses conservative rates and text token estimates for unknown models", () => {
  assert.equal(copilotModelRates("future-model").matched, false);
  const forecast = forecastCopilotUsage([{
    status: "complete", model: "future-model", startedAt: "2026-08-01", prompt: "hello", response: "world", metrics: {},
  }], null, new Date("2026-08-02"));
  assert.equal(forecast.estimatedRecords, 1);
  assert.equal(forecast.costUsd > 0, true);
});

test("uses authoritative billed spend as the runway baseline while retaining local velocity", () => {
  const forecast = forecastCopilotUsage([{
    status: "complete",
    model: "GPT-5 mini",
    startedAt: "2026-08-09T12:00:00Z",
    metrics: { promptTokens: 1_000_000, outputTokens: 0 },
  }], 10, new Date("2026-08-10T12:00:00Z"), 8);
  assert.equal(forecast.authoritativeBaseline, true);
  assert.equal(forecast.creditsPerDay, 25);
  assert.equal(forecast.daysUntilExhausted, 8);
  assert.equal(forecast.projectedMonthCredits > 800, true);
});

test("uses a custom uniform token price for local Copilot estimates", () => {
  const forecast = forecastCopilotUsage([{
    status: "complete",
    model: "Claude Sonnet 5",
    startedAt: "2026-08-09T12:00:00Z",
    metrics: { promptTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 500_000 },
  }], null, new Date("2026-08-10T12:00:00Z"), null, 2);
  assert.equal(forecast.costUsd, 2.2);
  assert.equal(forecast.customTokenPrice, true);
  assert.equal(forecast.tokenPriceUsdPerMillion, 2);
});

test("dashboard token totals estimate a captured prompt when the client reports no token metrics", () => {
  const totals = summarizeCopilotTokens([{
    prompt: "Explain why this request must count toward paid Copilot input usage.",
    response: "Because the content was sent to Copilot.",
    metrics: { promptTokens: null, outputTokens: null },
  }]);
  assert.equal(totals.inputTokens > 0, true);
  assert.equal(totals.outputTokens > 0, true);
  assert.equal(totals.estimatedInputRecords, 1);
});
