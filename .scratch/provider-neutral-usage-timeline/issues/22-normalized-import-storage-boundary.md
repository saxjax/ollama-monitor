# Normalized import storage boundary

Type: grilling
Status: resolved

## Question

Should V1 copy raw VS Code Insiders journal records into Saxjax Monitor's
storage, or retain only normalized timeline evidence plus the minimal Source
reference needed to re-read the client record when necessary?

## Answer

V1 retains normalized timeline evidence only: Sessions, Usage events, allowed
Prompt excerpts, minimal Source references, and associated evidence metadata.
It never copies raw VS Code Insiders journal records into Saxjax Monitor
storage. The client remains the source to re-read when that is necessary.
