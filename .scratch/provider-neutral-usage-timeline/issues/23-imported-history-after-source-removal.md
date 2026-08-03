# Imported history after source removal

Type: grilling
Status: resolved

## Question

If VS Code later rotates, deletes, or makes a previously imported Client record
unreadable, should the normalized Usage history already captured by Saxjax
remain, and how should its source availability be shown?

## Answer

Normalized Usage history already captured by Saxjax remains until Reset usage
history, even if VS Code rotates, deletes, or makes its original Client record
unreadable. The Source reference is marked unavailable and Coverage status
explains the loss of re-read capability; past timeline values are not silently
removed.
