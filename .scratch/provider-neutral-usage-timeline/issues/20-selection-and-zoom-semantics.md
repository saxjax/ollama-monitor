# Selection and zoom semantics

Type: grilling
Status: resolved

## Question

When a user clicks a time slot, stack segment, Session, or request, which
selection should change the linked ledger, which should zoom the chart, and
how can the user return to the prior time context without losing their place?

## Answer

Selection explains without changing the chart's time context: a time slot
shows its contributing requests; a Session segment highlights that Session and
filters/sorts its request ledger; and a request shows its Prompt excerpt and
Source reference. Selection does not zoom automatically.

Zoom is an explicit action available for the selected slot, day, or Session.
It records a reversible time-context breadcrumb/back control, allowing the
user to return to the prior month or range without losing their place.
