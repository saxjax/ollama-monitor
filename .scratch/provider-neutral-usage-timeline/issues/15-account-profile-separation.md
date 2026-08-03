# Account profile separation

Type: grilling
Status: resolved

## Question

When a machine may contain work and personal Client records or multiple
Provider accounts, should the timeline keep them separate by default, and how
should it handle an interaction whose account identity cannot be determined?

## Answer

Account profiles remain separate by default, even when their Client records
share one machine or Provider. The raw timeline preserves the profile boundary;
cross-profile aggregation is an explicit user choice.

An interaction with no determinable account identity remains in an Unassigned
profile. It is visible and filterable but never silently attributed to a work
or personal account.
