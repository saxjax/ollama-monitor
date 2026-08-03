# Historical price-estimate stability

Type: grilling
Status: resolved

## Question

When a Provider price schedule or user Allocation rule changes, should past
Monetary estimates retain the rule used when they were recorded, or be
recomputed using the newest rule?

## Answer

Each Monetary estimate retains the version of the Provider price schedule or
user Allocation rule that produced it. Changing a rule affects only later
estimates, so historic monthly totals and comparisons remain stable.

An explicit future "what-if" repricing view may apply a new rule to historic
usage, but it is distinct from the default historical Monetary display.
