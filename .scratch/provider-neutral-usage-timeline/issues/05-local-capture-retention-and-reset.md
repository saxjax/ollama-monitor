# Local capture retention and reset

Type: grilling
Status: resolved

## Question

What is retained locally by default, what does Clear remove, and what does an
explicit reset remove, for Prompt excerpts, Source references, observed Usage
events, and Billing history?

## Answer

The Usage timeline is retained locally for the life of the installation by
default. Observed Usage events, their non-content Session/source anchors, and
Billing history remain available so a historic spike is still explainable.

**Clear** immediately deletes every locally retained Prompt excerpt. It does
not remove numerical usage, Billing history, or the minimal non-content source
anchor (client, session label/opaque identifier, and time) needed to locate
the originating interaction manually.

**Reset usage history** is the explicit destructive action: it deletes all
local Usage events, Sessions/source anchors, Prompt excerpts, Billing
snapshots, attribution records, and local monetary estimates. It does not and
cannot change Provider-side billing or client-side history.
