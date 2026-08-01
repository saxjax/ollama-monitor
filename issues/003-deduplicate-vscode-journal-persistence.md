# Avoid re-persisting completed VS Code journal entries

- **Severity:** Low
- **Status:** Closed
- **Found in review:** `HEAD` `57456b2`

## Problem

When a VS Code chat journal changes, the adapter revisits all known requests.
Already-completed requests can be passed through `acceptVsCodeItem()` again,
which persists another JSONL copy and emits another completion event.

## Evidence

- `copilot-capture.mjs:493-512` revisits known request IDs after journal changes.
- `copilot-capture.mjs:291-299` persists completed items without requiring a
  status/version transition.

## Impact

The in-memory map deduplicates by ID, but the local JSONL log can grow with
duplicate records and downstream listeners can receive repeated finish events.

## Acceptance criteria

- Persist and emit a completed request only on its first completion or when its
  content/status meaningfully changes.
- Existing history loading still deduplicates by ID.
- Add a journal-update regression test proving unrelated new entries do not
  duplicate prior completed records.

## Resolution

Completed VS Code records are now compared using a stable completion signature;
unchanged journal replays are neither persisted nor emitted again.
