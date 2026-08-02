# Insiders history and incremental capture

Type: grilling
Status: resolved

## Question

For the V1 VS Code Insiders → Copilot route, should enabling the timeline
import available historical session records as well as incrementally capture
new or changed records, and what continuity claim should the app make while it
was not running?

## Answer

Prefer durable VS Code Insiders records over live monitoring. On enable, V1
imports every available historical record, then incrementally imports new or
changed records with stable deduplication. This recovers useful usage during
time the app was not running.

Live observation is a low-latency supplement only. The app must describe any
gap honestly as history recovered from available client records; it must not
claim continuous observation or complete account billing coverage.
