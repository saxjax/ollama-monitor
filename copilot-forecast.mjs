const MILLION = 1_000_000;

const MODEL_RATES = [
  [/gpt[- ]?5\.6.*sol/i, [5, 0.5, 30]],
  [/gpt[- ]?5\.6.*terra/i, [2.5, 0.25, 15]],
  [/gpt[- ]?5\.6.*luna/i, [1, 0.1, 6]],
  [/gpt[- ]?5\.5/i, [5, 0.5, 30]],
  [/gpt[- ]?5\.4.*mini/i, [0.75, 0.075, 4.5]],
  [/gpt[- ]?5\.4/i, [2.5, 0.25, 15]],
  [/gpt[- ]?5\.3.*codex/i, [1.75, 0.175, 14]],
  [/gpt[- ]?5.*mini/i, [0.25, 0.025, 2]],
  [/claude.*haiku.*4\.5/i, [1, 0.1, 5, 1.25]],
  [/claude.*sonnet.*5/i, [2, 0.2, 10, 2.5]],
  [/claude.*sonnet/i, [3, 0.3, 15, 3.75]],
  [/claude.*opus.*fast/i, [10, 1, 50, 12.5]],
  [/claude.*opus/i, [5, 0.5, 25, 6.25]],
  [/gemini.*2\.5.*pro/i, [1.25, 0.125, 10]],
  [/gemini.*3\.1.*pro/i, [2, 0.2, 12]],
  [/gemini.*flash/i, [1.5, 0.15, 8]],
  [/raptor.*mini/i, [0.25, 0.025, 2]],
  [/mai.*code.*flash/i, [0.75, 0.075, 4.5]],
  [/kimi.*k2\.7/i, [0.95, 0.19, 4]],
];

const CONSERVATIVE_DEFAULT = [5, 0.5, 25, 6.25];

export function copilotModelRates(model) {
  const match = MODEL_RATES.find(([pattern]) => pattern.test(String(model || "")));
  const [input, cachedInput, output, cacheWrite = input] = match?.[1] || CONSERVATIVE_DEFAULT;
  return { input, cachedInput, output, cacheWrite, matched: Boolean(match) };
}

function estimatedTokens(text) {
  return text ? Math.max(1, Math.ceil(String(text).length / 3.4)) : 0;
}

function recordTokens(item) {
  const rawInput = item.metrics?.promptTokens;
  const rawOutput = item.metrics?.outputTokens;
  const exactInput = rawInput == null ? Number.NaN : Number(rawInput);
  const exactOutput = rawOutput == null ? Number.NaN : Number(rawOutput);
  return {
    input: Number.isFinite(exactInput) && exactInput >= 0 ? exactInput : estimatedTokens(item.prompt),
    output: Number.isFinite(exactOutput) && exactOutput >= 0
      ? exactOutput
      : estimatedTokens(`${item.response || ""}${item.thinking || ""}`),
    inputEstimated: !Number.isFinite(exactInput),
    outputEstimated: !Number.isFinite(exactOutput),
  };
}

export function summarizeCopilotTokens(records) {
  return records.reduce((totals, item) => {
    const tokens = recordTokens(item);
    totals.inputTokens += tokens.input;
    totals.outputTokens += tokens.output;
    if (tokens.inputEstimated) totals.estimatedInputRecords += 1;
    if (tokens.outputEstimated) totals.estimatedOutputRecords += 1;
    return totals;
  }, { inputTokens: 0, outputTokens: 0, estimatedInputRecords: 0, estimatedOutputRecords: 0 });
}

export function forecastCopilotUsage(records, monthlyBudgetUsd, now = new Date(), authoritativeSpendUsd = null, tokenPriceUsdPerMillion = null) {
  const completed = records.filter((item) => item.status !== "error");
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let cacheWriteTokens = 0;
  let estimatedRecords = 0;
  let unmatchedModels = 0;

  for (const item of completed) {
    const rates = copilotModelRates(item.model);
    if (!rates.matched) unmatchedModels += 1;
    const tokens = recordTokens(item);
    const { input, output } = tokens;
    const cached = Math.max(0, Number(item.metrics?.cacheReadTokens) || 0);
    const cacheWrite = Math.max(0, Number(item.metrics?.cacheWriteTokens) || 0);
    const uncached = Math.max(0, input - cached);
    if (tokens.inputEstimated || tokens.outputEstimated || !rates.matched) estimatedRecords += 1;
    inputTokens += input;
    outputTokens += output;
    cachedInputTokens += cached;
    cacheWriteTokens += cacheWrite;
    costUsd += Number(tokenPriceUsdPerMillion) > 0
      ? (input + output + cacheWrite) * Number(tokenPriceUsdPerMillion) / MILLION
      : (uncached * rates.input + cached * rates.cachedInput + output * rates.output + cacheWrite * rates.cacheWrite) / MILLION;
  }

  const timestamps = completed.map((item) => new Date(item.startedAt).getTime()).filter(Number.isFinite);
  const firstAt = timestamps.length ? Math.min(...timestamps) : now.getTime();
  const observationHours = Math.max(1, (now.getTime() - firstAt) / 3_600_000);
  const credits = costUsd * 100;
  const creditsPerDay = credits / (observationHours / 24);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const elapsedDays = (now.getTime() - Date.UTC(year, month, 1)) / 86_400_000;
  const remainingDays = Math.max(0, daysInMonth - elapsedDays);
  const authoritativeCredits = Number.isFinite(authoritativeSpendUsd) ? authoritativeSpendUsd * 100 : null;
  const projectedMonthCredits = authoritativeCredits == null
    ? creditsPerDay * daysInMonth
    : authoritativeCredits + creditsPerDay * remainingDays;
  const budgetCredits = Number(monthlyBudgetUsd) > 0 ? Number(monthlyBudgetUsd) * 100 : null;
  const spentCredits = authoritativeCredits ?? credits;
  const remainingCredits = budgetCredits == null ? null : Math.max(0, budgetCredits - spentCredits);
  const daysUntilExhausted = remainingCredits == null || creditsPerDay <= 0 ? null : remainingCredits / creditsPerDay;
  const sustainableParallelFactor = budgetCredits == null || creditsPerDay <= 0 || remainingDays <= 0
    ? null
    : (remainingCredits / remainingDays) / creditsPerDay;

  return {
    estimated: true,
    credits,
    costUsd,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    creditsPerDay,
    projectedMonthCredits,
    observationHours,
    daysUntilExhausted,
    sustainableParallelFactor,
    estimatedRecords,
    unmatchedModels,
    requestCount: completed.length,
    authoritativeBaseline: authoritativeCredits != null,
    customTokenPrice: Number(tokenPriceUsdPerMillion) > 0,
    tokenPriceUsdPerMillion: Number(tokenPriceUsdPerMillion) > 0 ? Number(tokenPriceUsdPerMillion) : null,
  };
}
