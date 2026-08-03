# Saxjax Monitor

Local observability for AI interactions, their resource use, and the context that produced them.

## Language

**Usage timeline**:
A time-ordered view of observed AI usage that can be grouped by provider and traced to the contributing sessions and prompts.
_Avoid_: credits meter, activity chart

**Provider**:
The billing or model platform to which observed AI usage is attributed, such as GitHub Copilot or Ollama.
_Avoid_: vendor, source

**Account profile**:
A distinct work, personal, or otherwise identified account context within a
Provider. It remains separate from other profiles by default; an interaction
with unknown identity belongs to the Unassigned profile.
_Avoid_: provider total, merged account

**Unverified local profile**:
A user-labelled local client source whose Provider account identity has not
been established. It is not a Work/Personal Account profile until Provider
billing evidence verifies it.
_Avoid_: account, verified profile

**Provider adapter**:
The integration that identifies a Provider/account, declares its capabilities,
and supplies available billing evidence and price schedules, including Billing
reads when the Provider supports them. It does not parse client interaction
records.
_Avoid_: universal integration, vendor implementation

**Interaction adapter**:
The integration that observes a client such as VS Code Insiders, VS Code
Stable, Copilot CLI, or a local LLM and emits normalized Sessions and Usage
events. Client-displayed usage values are evidence of the interaction, not
authoritative Provider billing.
_Avoid_: billing adapter, universal client integration

**Client record**:
A durable interaction record retained by a client that an Interaction adapter
can import or re-read. Where present, it is preferred over a transient live
observation of the same interaction.
_Avoid_: live event, billing record

**Coverage status**:
The observed availability and freshness of a Client-record source for a period.
It distinguishes a checked zero-usage interval from an interval whose usage is
unknown because records are missing, unreadable, or stale.
_Avoid_: uptime, zero usage

**Measurement coverage**:
The share of visible Usage events that actually provide the selected Display
unit. It distinguishes absent unit values from measured zero usage.
_Avoid_: complete usage, zero values

**Provisional observation**:
A transient live observation used to show an interaction promptly. It is
merged into, and superseded by, the corresponding durable Client record when
one becomes available.
_Avoid_: duplicate event, final record

**Session**:
A coherent client conversation whose observed requests contribute to usage on
the timeline. A client-supplied session identity defines it; an inferred group
must be explicitly labelled.
_Avoid_: chat, thread

**Usage event**:
One time-stamped, attributable record of AI usage, with its measured or estimated token, credit, or cost values.
_Avoid_: transaction, data point

**Model family**:
A derived visual/aggregation grouping of exact Client-reported model labels.
It is distinct from the exact model label retained on a Usage event.
_Avoid_: model name, billing model

**Usage time**:
The time at which a Usage event's value became known, normally request
completion for client-reported values. It is distinct from the request's
execution span.
_Avoid_: consumption rate, start time

**Billing snapshot**:
An authoritative, time-stamped cumulative usage value read from a Provider; the difference between snapshots is billed usage for the intervening interval.
_Avoid_: billed event, invoice

**Billing read**:
One request to a Provider's billing usage endpoint for the account's current cumulative usage.
_Avoid_: poll, meter check

**Billing usage endpoint**:
A Provider endpoint that returns the billing account's current cumulative usage for its active billing period.
_Avoid_: account endpoint, credit API

**Prompt bracket**:
The opening and closing Billing snapshots associated with an observed request, used to measure the billed usage change around it.
_Avoid_: exact request cost, prompt invoice

**Settlement read**:
A bounded follow-up Billing read made for an unresolved Prompt bracket after a request completes, to accommodate delayed Provider meter updates.
_Avoid_: background polling, refresh loop

**Native unit**:
The Provider's own usage measure shown to the account holder, such as Copilot credits; it is retained without conversion.
_Avoid_: universal credit, token equivalent

**Display unit**:
The measure selected for rendering the Usage timeline: Tokens, Native unit, or monetary value.
_Avoid_: provider unit, timeline type

**Combined view**:
A timeline scope that explicitly aggregates selected Providers or Account
profiles in a common available Display unit. Native units never form a Combined
view.
_Avoid_: universal credits, default total

**Timeline scope**:
The selected Provider/account profile or explicit Combined view whose Usage
events the timeline displays. It is remembered independently from Display unit.
_Avoid_: dashboard default, account total

**Timeline time zone**:
The user-selected time zone used to render Usage-event calendars, slots, and
month comparisons. It is distinct from an event's absolute timestamp and
original local time.
_Avoid_: event time zone, system time

**Monetary estimate**:
A locally calculated money value derived from observed model usage and a price schedule; it is distinct from a Provider-reported monetary total.
_Avoid_: billed cost, exact spend

**Allocation rule**:
A user-configured method for assigning a portion of a flat subscription or
included quota to observed usage. It produces a local Monetary estimate, not
Provider billing.
_Avoid_: actual cost, zero cost

**Pricing rule version**:
The versioned Provider price schedule or Allocation rule used to produce a
Monetary estimate. It remains attached to that historic estimate.
_Avoid_: current price, retroactive cost

**Billing history**:
The append-only local record of Billing snapshots and usage attribution retained for the life of an installation until explicitly reset.
_Avoid_: prompt history, dashboard state

**Source reference**:
The non-content client, session identity, and time needed to find the
originating interaction in its client. It persists after Clear and is removed
only by a local reset.
_Avoid_: prompt copy, transcript

**Normalized evidence**:
The locally retained Session, Usage-event, evidence-status, and permitted
recognition data derived from a client record. It excludes copied raw client
journals and transcripts.
_Avoid_: journal mirror, raw import

**Prompt excerpt**:
A short locally captured portion of an interaction's submitted prompt, kept
for recognition and removed by Clear or a local reset.
_Avoid_: prompt history, transcript

**Attribution status**:
The evidence class relating a usage change to observed requests: Direct, Strong match, Shared, Unexplained, or Pending.
_Avoid_: exactness, confidence score

**Attribution trail**:
The observed Usage events offered as an explanation for a Billing snapshot interval, without claiming that the Provider billed each event at that exact value.
_Avoid_: exact breakdown, ledger

**Reconciliation**:
The comparison of client-observed Usage events with optional Provider Billing
snapshots. It surfaces direct, shared, unexplained, or pending evidence without
replacing the client-observed event values.
_Avoid_: correction, rebilling
