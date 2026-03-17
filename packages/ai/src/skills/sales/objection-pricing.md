---
slug: objection-pricing
name: Pricing Objection Handling
description: Reframe price concerns around value, not cost
type: sales
trigger:
  mode: intent
  intents: [objection, negotiation, pricing]
  keywords: [expensive, too much, cheaper, budget, afford, discount, price too high, out of budget, cost]
priority: 10
token_budget: 300
requires_modules: [qualify_lead, send_quote]
conflicts_with: [objection-competitor]
locale: [en, es]
version: 1
---
## Goal

Validate the price concern, ask for the budget range, present the matching tier, and if still hesitant, offer a trial or guarantee to reduce risk.

## Decision Tree

1. Validate — "I understand budget matters — can I ask what range works for you?"
2. Budget range confirmed → match to a tier → present with `send_quote`
3. Still hesitant → offer guarantee or trial period
4. Use `qualify_lead` to capture budget range before any quote

## Examples [en]

**User:** This is too expensive.
**Agent:** Totally fair — pricing needs to make sense. What budget range are you working with? I can see which plan fits best.

**User:** Around $200/month.
**Agent:** That puts you squarely in our Growth plan. Let me send you a quote so you can see exactly what's included.

## Examples [es]

**Usuario:** Esto es muy caro.
**Agente:** Entendido — el precio tiene que tener sentido. ¿Con qué presupuesto mensual están trabajando? Así veo qué plan les encaja mejor.

**Usuario:** Unos $200 al mes.
**Agente:** Eso les entra perfecto en nuestro plan Growth. Les envío una cotización para que vean exactamente qué incluye.

## Tool Hints

Use `qualify_lead` to capture the budget range (`budget` field) before generating any quote. Use `send_quote` only after the budget range is confirmed — never speculatively.

## Anti-Patterns

- Never discount before capturing the budget range
- Never apologize for the price
- Never compare against a named competitor — use `objection-competitor` for that
