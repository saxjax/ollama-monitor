# Reference-month comparison semantics

Type: prototype
Status: resolved

## Question

After reviewing real VS Code Insiders data, should a selected reference month
remain a shadow behind the active month, become a dedicated paired lane, or use
another representation that makes absolute cost differences and matching
calendar-time behavior easiest to read?

## Answer

Use one Reference month selector only. `None` means normal, adaptive-scale
browsing. Selecting a month enables comparison and locks scales only to the
selected month and that reference—not to every retained month.

The reference is a dim, shadow-like plot behind the active month’s coloured
stacks. It is aligned by matching day-of-month and 30-minute time slot; it is
not compressed or resampled to fit the other month’s count of active days. A
dedicated paired lane was rejected because it duplicates the main plot without
making the selected month’s request drill-down easier to follow.
