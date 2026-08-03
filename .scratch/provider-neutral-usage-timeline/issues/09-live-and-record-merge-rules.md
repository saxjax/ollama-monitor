# Live and record merge rules

Type: grilling
Status: resolved

## Question

When a provisional live observation and a later durable Client record describe
the same interaction but differ in timing, token counts, model, or native
usage, how should the timeline merge them and present the correction?

## Answer

They are one Usage event, never two. Live observation creates a provisional
event for low-latency display. The later durable Client record merges into it
and wins for time, model, token, and native-usage values; the timeline and its
aggregates update quietly to the durable value. A stable client identity is
used to match them when available, with a conservative contextual match only
when it is not.

The app retains no separate duplicate or user-facing correction audit for this
normalisation. Its evidence wording still distinguishes client-observed usage
from Provider Billing evidence.
