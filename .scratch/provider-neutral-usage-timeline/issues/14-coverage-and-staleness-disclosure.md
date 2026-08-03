# Coverage and staleness disclosure

Type: grilling
Status: resolved

## Question

How should the timeline disclose that VS Code Client records are missing,
unreadable, or stale, so a user never mistakes available history for complete
continuous coverage?

## Answer

The Usage timeline always exposes a compact Coverage status: the latest
successfully imported Client-record time plus any unreadable source, import
failure, or staleness state. A selected period with known healthy coverage and
no Usage events is zero; a period with missing or stale coverage is unknown,
not zero. Coverage explains the limitation without concealing the usable
history that was recovered.
