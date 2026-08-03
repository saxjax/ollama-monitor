# Usage timeline prototype direction

Type: prototype
Status: resolved

## Question

Which timeline prototype gives a person the clearest route from an observed
usage spike to the contributing local requests, without inventing a per-request
billing allocation?

## Answer

B is the primary direction. It renders 30-minute usage-value stacks in the
selected Display unit (Tokens, Provider native unit, or money), rather than
counting parallel requests. Its cumulative plot is generated from the exact
same time slots and shares their horizontal coordinate system. A selected slot
shows its contributing value and the request ledger below is sorted by prompt
start (`IN`) and completion (`OUT`); selecting a request reveals its short local
Prompt excerpt and Source reference.

A remains the month-level spike lens and opens B for zoomable time-slot detail.
C is the ledger companion without a duplicate cumulative graph. E is only a
model-family split and does not repeat the cumulative summary.

The prototype now uses real, Git-ignored VS Code Insiders metadata: short
locally retained prompt excerpts, opaque local chat references, model family,
token fields, timestamps, and VS Code-displayed credits. It is explicitly not a
retrospective GitHub billing ledger.

For month navigation, month tiles select the active month. A single Reference
month selector enables comparison; `None` keeps the normal adaptive y-scale.
Selecting a reference locks scales to the selected/reference pair only and
plots the reference as a subdued shadow aligned by matching calendar day and
30-minute slot.
