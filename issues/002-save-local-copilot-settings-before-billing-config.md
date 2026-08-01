# Save local Copilot settings before billing configuration exists

- **Severity:** Medium
- **Status:** Closed
- **Found in review:** `HEAD` `57456b2`

## Problem

The budget and custom token-price forms are visible in the dashboard even when
Copilot billing has not been configured. Submitting either form calls
`loadConfig()` directly and fails when `copilot.json` does not exist.

## Evidence

- `copilot-usage.mjs:195` loads the config in `setBudget()`.
- `copilot-usage.mjs:206` loads the config in `setTokenPrice()`.
- Both paths throw on `ENOENT` instead of creating a local settings record.

## Impact

Users cannot prepare a budget or fallback token price before configuring a GitHub
identity, despite the controls being presented.

## Acceptance criteria

- Settings can be saved locally before GitHub billing access is configured, or
  the controls are hidden/disabled with a clear explanation.
- Saving settings must preserve any existing billing identity and token config.
- Add tests for a missing config file and both settings paths.

## Resolution

The budget and token-price setters now create a local settings object when the
billing configuration is absent, while preserving existing identity fields.
