# VS Code Insiders source evidence inventory

**Scope.** This note inventories only the local VS Code Insiders chat journals
available on this machine on 2026-08-01 and the code that parses them. It does
not reproduce prompt text, response content, journal paths, identifiers, or
account data. It describes client-observed evidence, not GitHub billing.

## Observed inventory

The anonymized local scan found 1,263 chat-journal files containing 14,685
request records. Counts below are availability observations, not a promised
VS Code schema:

| Field or signal | Records/files observed | Interpretation |
| --- | ---: | --- |
| Finite request timestamp | 14,685 / 14,685 requests | A durable request-time candidate was present in this sample. |
| Request ID and response ID | 14,685 / 14,685 requests each | Both identifiers were present in this sample; the importer must still retain fallbacks. |
| Journal session ID | 1,245 / 1,263 files | Usually available, but not universal. |
| Model ID | 14,673 / 14,685 requests | Usually available; preserve it when present. |
| Local completion signal (`modelState.completedAt` or result) | 14,079 / 14,685 requests | Completion is separately observable for most, not all, requests. |
| Elapsed-time value | 13,961 / 14,685 requests | Duration is optional. |
| Input-token value | 9,370 / 14,685 requests | Input tokens are optional. |
| Output-token value | 10,094 / 14,685 requests | Output tokens are optional. |
| A nested client-details string in the `model • N credits` form | 1,968 / 14,685 requests | This is the usable per-request Copilot-native-unit evidence currently observed. |

The journal parser rebuilds a state document from JSONL mutations and ignores
only an incomplete final write, so a file is a durable, revisable client record
rather than an append-only event stream
([`copilot-capture.mjs:27-51`](../../../copilot-capture.mjs:27)).

## Durable fields and identity

The existing normalizer maps a journal request to:

- source/client, session ID, request-derived interaction ID, and model;
- `startedAt` from the request timestamp;
- `finishedAt` from client completion/response data only when the request has
  completed;
- optional input/output tokens and elapsed duration.

These mappings and their fallbacks are explicit in
[`copilot-capture.mjs:158-208`](../../../copilot-capture.mjs:158). The source
identity is `vscode-insiders`; the current record ID is composed from edition,
session ID, and request ID, falling back to response ID and then timestamp
([`copilot-capture.mjs:158-160`](../../../copilot-capture.mjs:158)). The
session normally comes from the journal's own session ID, with the journal file
name only as a fallback ([`copilot-capture.mjs:576-580`](../../../copilot-capture.mjs:576)).

**V1 identity rule.** Use `(client source, journal session ID, request ID)` as
the durable identity whenever present. A response ID fallback is weaker but
usable. A timestamp-only fallback must be marked *weak identity* and must not
silently merge a possible collision. The observed IDs establish a strong local
match for this source; they do not establish a provider billing identity or an
account profile.

## Time and usage evidence

`request.timestamp` is a request/start time in the current normalizer;
`modelState.completedAt` or `responseTimestamp` provides a completion time
when present ([`copilot-capture.mjs:177-199`](../../../copilot-capture.mjs:177)).
The fixture generator separately reads duration from `elapsedMs` or
`result.timings.totalElapsed` and parses a numeric client-details credit value
only when that exact formatted signal is available
([`generate-usage-timeline-prototype-fixture.mjs:17-27`](../../../generate-usage-timeline-prototype-fixture.mjs:17),
[`generate-usage-timeline-prototype-fixture.mjs:64-84`](../../../generate-usage-timeline-prototype-fixture.mjs:64)).

Therefore, the evidence classes for V1 are:

- **Client-observed native unit:** the parsed per-request credit value. It is
  appropriate as the primary Copilot timeline measure, but is not an
  authoritative GitHub account-meter or invoice amount.
- **Client-observed tokens:** request/result token metadata when supplied;
  unavailable otherwise. Absence must remain unavailable, never become zero.
- **Client-observed duration:** elapsed metadata when supplied; it is not a
  measured usage rate.
- **Unavailable here:** account identity, organization/seat, provider-side
  settlement time, billed dollars, quota inclusion, and provider-side
  adjustments. Those require a separate Provider billing read.

The prototype fixture intentionally reduces this evidence for visualization:
it categorizes the model into a family, coerces missing token values to zero,
and constrains displayed times to working hours
([`generate-usage-timeline-prototype-fixture.mjs:30-35`](../../../generate-usage-timeline-prototype-fixture.mjs:30),
[`generate-usage-timeline-prototype-fixture.mjs:99-112`](../../../generate-usage-timeline-prototype-fixture.mjs:99)).
Those are presentation choices, not V1 importer semantics. The fixture is also
explicitly private/Git-ignored and removes full paths, raw IDs, responses, and
tool payloads ([`generate-usage-timeline-prototype-fixture.mjs:1-3`](../../../generate-usage-timeline-prototype-fixture.mjs:1)).

## Updates and deduplication

The runtime scans a changed journal as a whole, recomputes request IDs, and
revisits each request ([`copilot-capture.mjs:565-590`](../../../copilot-capture.mjs:565)).
It suppresses an unchanged completed replay using a completion signature;
when a known record has changed, it replaces the in-memory history item by the
same ID and emits the updated completion
([`copilot-capture.mjs:352-380`](../../../copilot-capture.mjs:352)). Existing
persisted history is also collapsed by ID when loaded
([`copilot-capture.mjs:227-239`](../../../copilot-capture.mjs:227)).

**V1 import rule.** Re-import available journals idempotently by durable
identity; treat a later durable record as an update to the same interaction,
not another request. Keep a revision/evidence timestamp so the timeline can
say that a provisional/live view was superseded. Do not make the fixture's
month-local key (`journal basename + request/response ID/timestamp`) the
production identity; it is only a prototype transform
([`generate-usage-timeline-prototype-fixture.mjs:70-84`](../../../generate-usage-timeline-prototype-fixture.mjs:70),
[`generate-usage-timeline-prototype-fixture.mjs:89-113`](../../../generate-usage-timeline-prototype-fixture.mjs:89)).

## Limits and defensible V1 guarantees

The current monitor observes future journal changes but deliberately does not
import existing journals at startup ([`copilot-capture.mjs:570-575`](../../../copilot-capture.mjs:570)).
The prototype generator proves that available historical journals can be read,
but history is bounded by what VS Code still retains. No source evidence proves
continuous monitoring while the app was closed, completeness across devices,
or an account assignment.

V1 can defensibly guarantee:

1. Import all **currently available**, parseable Insiders requests with a
   finite request timestamp, then incrementally ingest journal revisions.
2. Preserve the VS Code session identity and request identity when present;
   mark weaker fallbacks rather than guessing.
3. Show client-reported credits, token fields, and duration only when each is
   present; retain their source/evidence label.
4. Place completed native usage at the recorded completion when one exists,
   while retaining start time and duration separately.
5. Update an existing interaction in place when its durable journal record
   changes, avoiding duplicate timeline contributions.
6. Surface coverage as “available local records through …”, not as a claim of
   complete provider billing history.

V1 must **not** promise exact GitHub billing, dollars, account/profile
attribution, a universal credit-to-token conversion, or prompt/content
retention. Provider-side billing snapshots remain the separate authoritative
evidence path.
