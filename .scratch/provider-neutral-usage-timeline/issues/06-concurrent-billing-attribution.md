# Concurrent billing attribution

Type: grilling
Status: resolved

## Question

When two or more observed interactions overlap and a Provider's cumulative
meter advances late or in a single combined step, how should the timeline
attribute that billed change without manufacturing an exact per-interaction
cost?

## Answer

Per-interaction native usage observed by an Interaction adapter is the primary
value for the everyday timeline. For Copilot / VS Code Insiders, its displayed
per-request credits are what power the stacked session view, including
concurrent sessions.

A Billing read is optional reconciliation evidence, not a prerequisite for a
usable timeline. When it exists and a later cumulative change covers more than
one eligible interaction, retain it as a **Shared** billed change linked to
those interactions. Do not split or overwrite their observed native values.
Only a Provider's direct per-interaction billing item may be shown as an exact
billed amount. Token-weighted allocation may be offered as an explicitly
labelled estimate, never as the authoritative value.
