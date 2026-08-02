# Session identity and fallback grouping

Type: grilling
Status: resolved

## Question

When VS Code Insiders supplies a session identity, should that identity define
the timeline Session exactly, and what fallback grouping is acceptable when a
future client cannot supply one?

## Answer

The client-supplied session identity defines a timeline Session exactly. V1
uses VS Code Insiders session identity and its source anchor, so opening a
session from a spike leads back to the same client conversation.

For a future client without session identity, Usage events remain separate by
default. The app may offer an explicitly labelled inferred group where there
is strong contextual evidence, but it must not silently merge nearby requests
by time or model.
