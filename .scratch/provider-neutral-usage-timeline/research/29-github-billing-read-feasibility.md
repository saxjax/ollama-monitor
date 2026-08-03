# GitHub Billing-read feasibility

**Question.** Can an authorized Saxjax integration read a current Copilot
account meter for reconciliation, and what are the scope and evidence limits?

**Conclusion (checked 2026-08-02).** Yes, GitHub documents supported REST
billing reports that are suitable for **aggregate account reconciliation**.
They are not a live, itemized prompt ledger. The GitHub Provider adapter can
store a time-stamped aggregate snapshot and compare it with the locally
observed VS Code timeline; it must not use a change in that snapshot to assign
an exact bill to one prompt or session.

## Supported mechanism

The [Billing usage REST API](https://docs.github.com/en/rest/billing/usage)
explicitly says that its endpoints return usage billed to the account in the
endpoint. The relevant AI-credit reports are:

| Billing owner | Supported endpoint | Granularity and limits |
| --- | --- | --- |
| Personal Copilot plan | `GET /users/{username}/settings/billing/ai_credit/usage` | Year/month/day, model and product filters; up to 24 months. |
| Organization that pays for the license | `GET /organizations/{org}/settings/billing/ai_credit/usage` | The same time/model/product filters, plus an optional `user` filter; up to 24 months. |
| Enterprise that pays for the license | `GET /enterprises/{enterprise}/settings/billing/ai_credit/usage` | Time, organization, user, model, product, and cost-center filters; up to 24 months. |

The documented examples return `usageItems` grouped at least by product/SKU and
model, with native quantity/unit, `pricePerUnit`, and gross/net quantity and
amount. The user report's example uses `unitType: "ai-credits"`; organization
and enterprise examples use `unitType: "credits"`. A report can therefore be
read as an account-level current-period snapshot and displayed in GitHub's
native billing unit, but it has no documented request ID, session ID, or
time-of-day field. It cannot validate a particular Insiders event.

The companion [usage-reporting guide](https://docs.github.com/en/enterprise-cloud@latest/billing/tutorials/automate-usage-reporting)
describes AI-credit reports as detailed consumption/billing data, including
included-pool consumption, additional spend, and model consumption. It also
confirms that user, organization, and enterprise are distinct reporting
levels.

## Ownership and authorization

The scope is not optional. GitHub states that a user endpoint covers Copilot
usage billed directly to that person's **personal** plan; usage for a license
managed and billed through an organization or enterprise is excluded and must
be read at that billing-owner scope.

- **Personal:** GitHub App user access token or fine-grained PAT with user
  `Plan: read`. The app should first resolve the authenticated identity and
  only read that principal's own user endpoint.
- **Organization:** an organization administrator; a fine-grained token may
  use `Administration: read` for that organization. The API can filter by
  user, but the returned evidence remains the organization's billed usage.
- **Enterprise:** enterprise administrator or billing manager. The enterprise
  AI-credit endpoint explicitly does **not** accept GitHub App user tokens,
  GitHub App installation tokens, or fine-grained PATs. Treat any supported
  classic/OAuth authorization path as an opt-in administrator connection, not
  as a normal individual-user flow.

This prevents a local VS Code record from being silently labelled Work or
Personal: a successful snapshot verifies only its billing-owner scope. Historic
client records remain unassigned unless the user makes the existing explicit,
time-bounded assignment.

## UI, CLI, GraphQL, and metrics are not substitutes

GitHub documents manual UI views: individuals can see included credits,
additional usage, model breakdown, and cost under **Billing and licensing → AI
usage**; Business/Enterprise seat users see their cycle usage in Copilot
settings ([Monitoring GitHub AI Credits usage](https://docs.github.com/en/copilot/how-tos/manage-and-track-spending/monitor-ai-usage)).
Those pages are useful for a human cross-check, but GitHub does not publish
their browser data calls as a stable application API. Saxjax must not scrape
the UI, reuse browser cookies, or depend on undocumented endpoints. That is
unsupported, even where the user can see the value manually.

`gh api` is a supported way to call the REST endpoint, as shown in GitHub's
[usage-reporting guide](https://docs.github.com/en/enterprise-cloud@latest/billing/tutorials/automate-usage-reporting);
it is an HTTP client, not a separate Copilot meter API. No documented GraphQL
Billing/Copilot AI-credit read was found in GitHub's current Billing or Copilot
API references. Record that as **no documented GraphQL mechanism**, not as a
claim that no private implementation exists.

Copilot **usage metrics** REST exports are also distinct from billing reports:
they are organization/enterprise reports, generated daily or for a complete
latest 28-day period, and require a metrics policy and elevated metrics
permission ([Copilot usage metrics API](https://docs.github.com/en/rest/copilot/copilot-usage-metrics),
[metric-data reference](https://docs.github.com/en/copilot/reference/copilot-usage-metrics/copilot-usage-metrics)).
They are useful adoption telemetry, not a live personal billing meter or
prompt-level reconciliation source.

## Cadence and V1 capability

The reports accept current-year/current-month defaults and narrower time
filters, but GitHub documents no freshness or settlement SLA. A snapshot's
timestamp is therefore local observation time, not proof that every just-ended
prompt has settled. V1 should expose an explicit **Refresh GitHub billing**
action and optionally make bounded, debounced follow-up reads after completed
client interactions; it should display *pending/unchanged/changed* rather than
promise an immediate per-prompt delta.

The generic [REST rate-limit documentation](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
sets the normal authenticated primary limit at 5,000 requests/hour (with
higher documented Enterprise-app cases) and secondary limits including 900
REST points/minute. Read the response rate-limit headers, coalesce refreshes,
and back off on `403`/`429`. These limits make occasional reconciliation reads
feasible; they do not justify high-frequency polling, nor do they establish
billing freshness.

## V1 recommendation

Expose GitHub billing as an **optional Provider-adapter capability**:

1. Detect/ask for the billing-owner scope and obtain only the least required
   authorized token through a future connection flow.
2. Read the corresponding supported AI-credit report; persist the returned
   aggregate snapshot with scope, filters, observation time, and evidence
   label **Provider billing aggregate**.
3. Reconcile it against Insiders' client-observed credits by time/model only;
   attribute unexplained changes as shared or unexplained, never fabricated
   per-request bills.
4. If authorization, plan, or freshness is unavailable, keep the complete
   Insiders timeline and show Billing read unavailable—not zero.

The current V1 timeline remains useful without this connection. The supported
REST path is a later additive reconciliation capability, not a reason to
delay durable local import.
