# First-release integration scope

Type: grilling
Status: resolved

## Question

Which concrete client/Provider path must be complete in the first release,
and how much future-provider support must be delivered rather than merely
designed?

## Answer

V1 delivers one production-quality route: Copilot usage observed through VS
Code Insiders. It does not ship Stable VS Code, Copilot CLI, Claude, OpenAI,
or local-LLM connectors. The Interaction adapter / Provider adapter boundary
is nevertheless a V1 implementation constraint, so later integrations do not
require reshaping the timeline's stored evidence or UI.
