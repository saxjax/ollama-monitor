# Money mode for subscriptions and quotas

Type: grilling
Status: resolved

## Question

When a Provider supplies credits or usage from a flat subscription or quota but
does not supply a marginal money amount, should the Monetary display be hidden,
show zero, or show an explicitly user-chosen allocation of the subscription
cost?

## Answer

Monetary display is unavailable when the Provider gives only a flat
subscription or included quota and neither the Provider nor the user has
supplied a marginal price or Allocation rule. It must never display zero: zero
would incorrectly mean that usage is free.

An explicitly configured Allocation rule may enable a clearly labelled local
Monetary estimate. It is not Provider billing and cannot replace the native
credit/quota view.
