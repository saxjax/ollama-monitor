# Generic interaction capture contract

Type: grilling
Status: resolved

## Question

What normalized contract should let a client adapter such as VS Code Insiders,
VS Code Stable, Copilot CLI, or a local LLM feed Sessions and Usage events into
the same provider-neutral timeline without claiming that client-reported usage
is authoritative billing?

## Answer

Keep the two kinds of evidence that made the prototype useful as separate
logical adapters:

- An **Interaction adapter** observes a client (VS Code Insiders, VS Code
  Stable, Copilot CLI, or a local LLM) and emits Sessions plus normalized
  Usage events. It may provide submitted/finished timestamps, client and
  session identities, model, input/output/total tokens, a client-displayed
  native value, a short Prompt excerpt, and a Source reference. Every
  client-displayed usage value is marked as observed client evidence, never
  as account billing.
- A **Provider adapter** identifies the Provider/account, declares the
  capabilities it supports, reads authoritative Billing snapshots where
  possible, and supplies an explicit price schedule when a local Monetary
  estimate is supported. It does not parse a client's journals.
- The attribution layer correlates the two: it groups concurrent events into
  Sessions, brackets interactions with Billing reads where available, and
  exposes the attribution status rather than inventing exact per-prompt
  bills.

The normalized event contract needs stable identity and source context;
started/finished times; Provider/account hint; model; separately optional
token and client-native values with their evidence source; session linkage;
and the local Prompt excerpt/Source reference. Missing fields remain missing.

The strict boundary is logical, not a packaging restriction: a convenient
"Copilot integration" can bundle a Copilot Provider adapter with a VS Code
Interaction adapter, but the two outputs stay distinct in storage and UI.
