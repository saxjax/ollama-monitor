# Exclude active Copilot requests from paid usage aggregates

- **Severity:** High
- **Status:** Open
- **Found in review:** `HEAD` `57456b2`

## Problem

`forecastCopilotUsage()` currently excludes only error records. Streaming Copilot
requests therefore contribute partial prompt/output content to estimated cost,
credits/day, month projection, budget runway, and parallel-capacity calculations.
The dashboard token totals also include active records.

## Evidence

- `copilot-forecast.mjs:64` filters with `status !== "error"`.
- `gateway.mjs:121-124` passes active and history records to the forecast and
  token summarizer.

## Impact

A long-running request can temporarily inflate the paid Copilot meter before it
finishes. Repeated updates can make velocity and runway appear unstable.

## Acceptance criteria

- Completed paid-usage aggregates use only records with `status === "complete"`.
- Active requests remain available for a separately labelled live-progress view,
  if desired.
- Add regression coverage proving a streaming record does not change billed
  cost, credits/day, projection, runway, or paid token totals.
