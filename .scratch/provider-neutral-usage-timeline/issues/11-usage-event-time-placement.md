# Usage event time placement

Type: grilling
Status: resolved

## Question

When a request has a start and completion time but its native usage is known
only on completion, at which point or interval should the Usage timeline place
its value without implying a rate that was not observed?

## Answer

Place the Usage event's value at its completion time: this is when the
client-reported value became known. The Session/request duration remains
available separately for drill-down and duration overlays. Do not distribute a
completed value across its execution interval, since that would invent a usage
rate and hide short spikes.
