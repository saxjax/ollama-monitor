# Cross-provider display aggregation

Type: grilling
Status: resolved

## Question

When the timeline contains several Providers, which Display units may aggregate
across them, and when must the UI retain Provider-separated lanes or views to
avoid adding incompatible units together?

## Answer

Native unit mode is always Provider/profile-separated: Copilot credits and any
other Provider-native measures are never added. Tokens and Monetary values may
aggregate across selected Providers only where every included Usage event has
that unit available; incomplete coverage is disclosed rather than silently
treated as zero.

Provider/profile lanes remain directly available in every display mode, so a
combined total never hides the source of a spike.
