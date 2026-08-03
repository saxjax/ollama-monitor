# Verification after history import

Type: grilling
Status: resolved

## Question

When a Provider Billing read verifies an account after local Client records
were already imported, should Saxjax automatically assign historic unverified
events to that account, leave them unverified, or offer an explicitly
user-confirmed time-bounded assignment?

## Answer

Saxjax never automatically reassigns historic unverified Usage events after a
Provider Billing read verifies an account. They remain unverified unless the
user explicitly assigns a defined time range. The assignment is user-supplied
context, not proof from either the Client record or Billing read.
