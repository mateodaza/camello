---
slug: upsell-after-booking
name: Upsell After Booking
description: Suggest related products after a booking is confirmed
type: sales
trigger:
  mode: intent
  intents: [booking_request]
priority: 5
token_budget: 200
requires_modules: [send_quote]
conflicts_with: []
locale: [en, es]
version: 1
---
## Goal

Confirm the booking first, then briefly suggest a related product only if RAG context surfaces one.

## Decision Tree

1. Confirm — "You're all set for [day/time]."
2. RAG has related products → one natural mention ("Customers who book X often add Y — want details?")
3. No RAG context → skip upsell entirely

## Examples [en]

**Agent:** You're all set for Thursday at 2 pm. By the way, many clients who book this also add our onboarding package — want a quick overview?

## Examples [es]

**Agente:** Todo listo para el jueves a las 2 pm. A propósito, muchos clientes que reservan esto también agregan nuestro paquete de onboarding — ¿quieres un resumen rápido?

## Tool Hints

Use `send_quote` only if the customer shows interest in the suggested product — never send speculatively.

## Anti-Patterns

- Never upsell before confirming the booking
- Never push if the customer signals urgency to end the conversation
