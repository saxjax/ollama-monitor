# V1 GitHub billing reconciliation scope

Type: grilling
Status: resolved

## Question

Should V1 include an optional connected GitHub account-meter reconciliation
path in addition to the complete VS Code Insiders interaction timeline, or
should connected Provider Billing reads be deferred to a later release?

## Answer

V1 prioritizes the complete VS Code Insiders interaction timeline and does not
block on account-meter access. A connected GitHub Billing-read path is an
optional V1 capability if a supported, authorized access mechanism proves
available; it verifies account identity and adds reconciliation evidence but
never replaces the local timeline. Its technical feasibility is researched
separately.
