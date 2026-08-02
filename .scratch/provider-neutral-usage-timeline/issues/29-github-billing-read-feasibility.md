# GitHub billing-read feasibility

Type: research
Status: resolved

## Question

What supported, authorized GitHub/Copilot mechanism, if any, can read an
account's current cumulative usage or spend for reconciliation in V1, what
identity and cadence constraints apply, and what must remain unavailable?

## Answer

See [GitHub Billing-read feasibility](../research/29-github-billing-read-feasibility.md).
GitHub's supported REST AI-credit reports can add time-stamped, aggregate
billing reconciliation at the billing-owner scope. They cannot make a local
prompt/session bill exact; UI scraping and undocumented browser endpoints are
not supported. The V1 Insiders timeline therefore remains independent, with
an authorized billing connection as an optional additive capability.
