# Parallel-stack colour semantics

Type: grilling
Status: resolved

## Question

In the parallel Usage stacks, should colour represent Provider/model origin,
individual Session, or another stable dimension, and how should the other
dimensions remain distinguishable without overloading colour?

## Answer

Colour represents usage origin. In a Combined view it identifies Provider; in
a single-Provider view it identifies model family. The legend states the
current meaning. Individual Sessions are distinguished by their stack segment,
hover/selection highlight, and the linked request ledger, not by an unstable
palette of session colours.
