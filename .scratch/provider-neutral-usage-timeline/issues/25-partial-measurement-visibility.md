# Partial measurement visibility

Type: grilling
Status: resolved

## Question

When a recovered VS Code request has a session and timing but lacks a native
credit or token value, should V1 retain it in the drill-down ledger while
excluding it from only the unavailable unit's aggregate, with explicit
measurement coverage disclosure?

## Answer

V1 retains every recovered request in its Session/request ledger whenever it
has usable identity and timing. A graph includes an event only in a Display
unit that event actually provides. Missing native credits or tokens remain
unavailable, never zero, and the selected view discloses partial measurement
coverage.
