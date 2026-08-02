# Provider-neutral usage timeline — Wayfinder map

## Destination

An implementation-ready design spec for a provider-neutral Usage timeline that
makes usage spikes explainable through local Sessions and Usage events, while
retaining each Provider's native unit and evidence boundaries.

## Notes

- Domain vocabulary is maintained in [CONTEXT.md](../../CONTEXT.md).
- The UI exploration is deliberately throwaway code in
  [public/usage-timeline-prototype.js](../../public/usage-timeline-prototype.js).
- V1 is one production-quality route: Copilot observed through VS Code
  Insiders. The adapter boundary remains reusable for later clients and
  Providers. Provider billing snapshots must remain distinct from
  VS Code-displayed per-request credits.
- Normal browsing may use an adaptive y-scale. A reference month makes the
  comparison scale explicit and locked only to the two months in view.
- [Insiders source evidence inventory](research/21-insiders-source-evidence-inventory.md)
  records the durable local fields and the limits of defensible V1 capture.

## Decisions so far

- [Usage timeline prototype direction](issues/01-usage-timeline-prototype-direction.md) — A is the month-level spike lens; B is the primary, zoomable time-slot view, backed by one shared local data fixture and a sorted prompt ledger.
- [Reference-month comparison semantics](issues/02-reference-month-comparison-semantics.md) — A single reference-month selector controls comparison; its dim calendar/time-aligned shadow locks scale only against the two months in view.
- [Provider evidence fallback](issues/03-provider-evidence-fallback.md) — Tokens are observable usage, native unit needs Provider evidence, and money without a Billing read is explicitly a local estimate.
- [Generic interaction capture contract](issues/04-generic-interaction-capture-contract.md) — Interaction adapters explain usage from client records; Provider adapters establish account billing and pricing, with attribution joining their evidence.
- [Local capture retention and reset](issues/05-local-capture-retention-and-reset.md) — Clear removes prompt text only; the numeric trail and minimal source anchors persist until an explicit full local reset.
- [Concurrent billing attribution](issues/06-concurrent-billing-attribution.md) — Client-observed per-request units drive the timeline; later account-meter changes reconcile them as shared evidence unless the Provider itemizes a request.
- [First-release integration scope](issues/07-first-release-integration-scope.md) — V1 delivers Copilot through VS Code Insiders only, on reusable interaction/provider adapter boundaries.
- [Insiders history and incremental capture](issues/08-insiders-history-and-incremental-capture.md) — Durable VS Code records are preferred: import available history and changes, using live observation only for low latency.
- [Live and record merge rules](issues/09-live-and-record-merge-rules.md) — A live observation is one provisional usage event, superseded in place by its later durable client record.
- [Session identity and fallback grouping](issues/10-session-identity-and-fallback-grouping.md) — Client session identity is preserved exactly; a client without one yields separate events unless an explicitly labelled inference is available.
- [Usage event time placement](issues/11-usage-event-time-placement.md) — Completed usage is plotted when it becomes known; request duration remains separate, rather than implying an unobserved rate.
- [Money mode for subscriptions and quotas](issues/12-money-mode-for-subscriptions-and-quotas.md) — Dollars are unavailable for included usage unless a Provider or the user supplies an explicit price/allocation rule; zero never means included.
- [Historical price-estimate stability](issues/13-historical-price-estimate-stability.md) — Each dollar estimate keeps its original pricing-rule version; repricing history is an explicit future what-if view.
- [Coverage and staleness disclosure](issues/14-coverage-and-staleness-disclosure.md) — Coverage status shows the latest successful client record and failures; zero is displayed only for a successfully checked interval.
- [Account profile separation](issues/15-account-profile-separation.md) — Work, personal, and unassigned usage stay separate by default; aggregation is an explicit choice.
- [Cross-provider display aggregation](issues/16-cross-provider-display-aggregation.md) — Native units never mix across Providers; tokens or dollars aggregate only when that unit is available for every included event.
- [Default timeline scope](issues/17-default-timeline-scope.md) — Reopen the last Provider/account profile in its native unit; combined comparison is a deliberate switch.
- [Timeline time zone](issues/18-timeline-time-zone.md) — Preserve absolute event time; a remembered selected time zone defines calendar grouping and reference alignment.
- [Parallel-stack colour semantics](issues/19-parallel-stack-colour-semantics.md) — Colour means Provider in combined scope and model family in a single Provider; sessions are identified through selection and the ledger.
- [Selection and zoom semantics](issues/20-selection-and-zoom-semantics.md) — Selection explains a slot/session/request without moving context; explicit, reversible zoom drills into a slot, day, or Session.
- [Normalized import storage boundary](issues/22-normalized-import-storage-boundary.md) — Store normalized local timeline evidence only, never a copied raw VS Code journal or hidden transcript store.
- [Imported history after source removal](issues/23-imported-history-after-source-removal.md) — Normalized history persists after VS Code rotates its source; only source availability and coverage change.
- [Exact model label and family](issues/24-exact-model-label-and-family.md) — Preserve the exact client-reported model in drill-down; use a separate derived family for colour and aggregation.
- [Partial measurement visibility](issues/25-partial-measurement-visibility.md) — Keep every identified request explainable; include it only in unit aggregates it actually measures and disclose partial coverage.
- [Unverified local profile labelling](issues/26-unverified-local-profile-labelling.md) — Local Insiders data uses a renameable but explicitly unverified profile; only Provider billing evidence verifies Work/Personal identity.
- [Verification after history import](issues/27-verification-after-history-import.md) — New account verification never rewrites unverified history; only an explicit time-bounded user assignment may do so.
- [V1 GitHub billing reconciliation scope](issues/28-v1-github-billing-reconciliation-scope.md) — The Insiders timeline ships independently; GitHub Billing reads are an optional supported capability, not its prerequisite.
- [GitHub billing-read feasibility](issues/29-github-billing-read-feasibility.md) — GitHub's supported REST AI-credit reports supply aggregate, billing-owner snapshots for optional reconciliation; UI scraping is unsupported and no prompt-level billing attribution is available.

## Not yet specified



## Out of scope

- Treating historic VS Code-displayed credit metadata as an authoritative GitHub
  billing ledger; only future Billing snapshots can establish that evidence.
