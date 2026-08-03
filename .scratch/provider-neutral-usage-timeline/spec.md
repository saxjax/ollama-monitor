# Provider-neutral Usage timeline — V1 design spec

## Outcome

Saxjax Monitor helps a person find exactly when AI usage rises and identify the
local Sessions and requests that explain the rise. V1 is a production-quality
VS Code Insiders → Copilot route, designed on reusable Interaction-adapter and
Provider-adapter boundaries.

The primary evidence is the durable client record, not an invented bill. A
separate connected Provider Billing read may later add account identity and
reconciliation, but the timeline must remain useful without it.

## V1 scope

V1 imports available VS Code Insiders Copilot records, incrementally re-imports
changed journals, and renders the Usage timeline using normalized local
evidence. It supports Tokens, Copilot native credits where observed, and
Monetary estimates only where an explicit pricing/allocation rule exists.

It does not ship Stable VS Code, Copilot CLI, Claude, OpenAI, or local-LLM
connectors. The model supports them through future adapters. It does not claim
historic GitHub billing, continuous observation while Saxjax was closed,
automatic account attribution, or a universal credit conversion.

## Evidence model

### Adapter boundary

- An **Interaction adapter** observes/imports client records and emits Sessions
  and Usage events. Its reported credits/tokens are client-observed evidence.
- A **Provider adapter** declares capability, account identity where verified,
  Billing reads when supported, and price schedules/allocation rules. It does
  not parse client journals.
- Reconciliation links optional Billing snapshots to eligible Usage events but
  never overwrites a client-observed event. A combined later meter movement is
  **Shared**, unless the Provider supplies a direct itemized charge.

### Normalized records

Each Usage event stores: durable interaction identity and its strength; client
source; unverified/verified profile; client Session identity; exact model label
and derived model family; absolute start and optional completion time; optional
duration; optional input/output/total tokens; optional native unit; evidence
source/status; and minimal Source reference. A short Prompt excerpt is local
recognition data only.

The Insiders identity is `(client source, journal session ID, request ID)` when
available, then response ID. A timestamp-only fallback is weak and must not
silently merge collisions. Reimporting a durable record updates the same Usage
event in place. A live observation, if present, is provisional and is replaced
by the durable record.

### Measurements and timing

Each unit is optional. An event without credits or tokens remains visible in
the Session/request ledger but is excluded only from that unit's aggregate;
absence is never zero. The UI shows Measurement coverage for the active unit.

Completed client-reported usage is plotted at completion—when it became
known. Start time and duration remain available for inspection; no value is
spread across the execution interval as an invented rate.

## Import, storage, and lifecycle

On enable, scan all currently available parseable Insiders journals, import
identified records idempotently, then re-read journals as they change. The
timeline describes this as recovered local history, not continuous provider
coverage. Coverage status always exposes the latest successful client-record
time and any import/staleness failure.

Persist normalized evidence only. Never copy a raw VS Code journal, response,
tool payload, or hidden transcript. Existing normalized history remains after
VS Code rotates source files; the Source reference simply becomes unavailable.

Clear deletes all Prompt excerpts immediately but keeps numeric timeline data,
Sessions, and non-content source anchors. **Reset usage history** deletes all
local Usage events, Sessions, excerpts, source anchors, Billing snapshots,
attribution, and estimates; it cannot change client or Provider history.

## Profiles and privacy

V1's VS Code source is an **unverified local profile**: user-renameable for
recognition, but explicitly not a Work/Personal account. Local records do not
prove GitHub identity. A future authorized Billing read may verify an Account
profile. It never automatically reassigns old unverified events; a user may
explicitly assign a defined historic range, marked as user-supplied context.

Profiles remain separate by default. Unknown identity is Unassigned. Combined
views are explicit, never a silent merge of work/personal activity.

## Timeline UI

### Scope, units, and time

Open the last selected Provider/profile in its native unit; otherwise open the
first available profile. The user may switch among Tokens, Native unit, and
Money. Native units never aggregate across Providers. Tokens and money may
aggregate only when every included event provides that unit; partial coverage
is visible.

The timeline uses a remembered selectable time zone (default: computer time
zone). Events retain absolute timestamps. The selected zone defines calendar
days, months, 30-minute slots, and reference-month alignment; original local
time appears in drill-down.

### Main exploration view

Prototype B is the primary view. It uses 30-minute usage-value stacks—not a
count of concurrent Sessions—and a lower cumulative plot derived from the
same slots with the same horizontal extent. The y-axis always names the active
unit: tokens, native credits/unit, or money/estimate.

Colour means usage origin: Provider in a Combined view and model family inside
a single Provider. Exact model labels appear in Session/request drill-down.
Session identity is never encoded as an unstable colour palette.

Month tiles select history. A single Reference-month selector controls
comparison. No reference uses adaptive scale. A selected reference renders as
a dim calendar-day/30-minute-aligned shadow, and locks the scale to exactly the
selected and reference months. It is never resampled or compared against an
unselected highest month.

### Drill-down

Selecting a slot shows its contributing requests and measured value.
Selecting a Session highlights all of its contributions and filters/sorts its
ledger by request start (IN) and completion (OUT). Selecting a request reveals
its exact model, short Prompt excerpt if retained, and Source reference.

Selection never changes time context. An explicit **Zoom to selection** action
zooms to a slot, day, or Session and provides a breadcrumb/back control to
restore the previous context.

## Optional GitHub Billing reconciliation

GitHub supplies supported REST AI-credit reports for a personal plan, paying
organization, or paying enterprise. A connected adapter records a
time-stamped aggregate snapshot with its billing-owner scope and report
filters. It is not a request/session ledger. Reads are explicit by default and
may use bounded, debounced settlement follow-ups after completed interactions;
they never use an unbounded cadence poll. Snapshot changes reconcile the local
timeline with Direct/Strong match/Shared/Unexplained/Pending status, never an
invented exact per-prompt bill.

The connection requires authorization appropriate to the billing owner and
uses only documented REST endpoints; Saxjax never scrapes GitHub's browser UI
or reuses browser cookies. Failure, missing authorization, or report
freshness disables only reconciliation/account verification, not the timeline,
Tokens/native units from the client, or local history. See
[GitHub billing-read feasibility](research/29-github-billing-read-feasibility.md).

## Acceptance criteria

1. Available Insiders records with finite timestamps import idempotently into
   normalized Usage events; changed records update rather than duplicate.
2. The graph, cumulative plot, selected-slot total, and request ledger use the
   same underlying events and selected Display unit.
3. A user can move between months, select a reference month, see an aligned
   fixed-pair comparison scale, and return from a zoomed slot/day/Session.
4. A spike can be traced to a client Session and its requests, including exact
   model, optional excerpt, and source anchor, without retaining raw journals.
5. Missing measurement, source coverage, profile identity, and Billing access
   are explicit states—not zeroes or implied facts.
6. Clear and Reset follow their defined local-data boundaries.
7. No code path presents VS Code-displayed credits as GitHub account billing
   or presents an included subscription as zero dollars.

## Implementation sequence

1. Replace prototype-only transforms with the normalized Insiders importer and
   durable local store; preserve exact optional values rather than coercing
   missing values to zero.
2. Implement Provider/profile/unit/coverage state and the B exploration view
   against that store, preserving the A spike lens as a route into B.
3. Add selection, zoom, retention/reset, source availability, and historical
   import/update behavior.
4. Add adapter capability registration so future Stable VS Code, CLI, local
   LLM, Claude, and OpenAI integrations plug into the same model.
5. Add the optional GitHub REST billing adapter for authorized personal,
   organization, and enterprise billing-owner scopes; preserve its aggregate
   evidence boundary in storage and UI.
