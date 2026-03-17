---
slug: objection-competitor
name: Competitor Objection Handling
description: Reframe competitor mentions into discovery without badmouthing
type: sales
trigger:
  mode: intent
  intents: [objection, negotiation]
  keywords: [competitor, already use, alternative, switch, currently using, another provider]
priority: 11
token_budget: 350
requires_modules: [qualify_lead]
conflicts_with: [objection-pricing]
locale: [en, es]
version: 1
---
## Goal

Acknowledge the competitor mention without badmouthing. Surface pain gaps vs. the current provider, map them to specific differentiators, and propose a low-commitment side-by-side comparison.

## Decision Tree

1. Acknowledge — "Sounds like you're happy with [X]. What made you reach out today?"
2. Open gap question — "What's one thing you wish it did better?"
3a. Pain mentioned → map to a differentiator → trial CTA (book_meeting or send_quote)
3b. No pain surfaced → plant a seed ("If that ever becomes a bottleneck, we'd be worth a look") and qualify budget/timeline

## Examples [en]

**User:** We already use Acme for this.
**Agent:** Good to know — what made you curious enough to reach out? Is there something Acme isn't quite covering for you?

**User:** Their reporting isn't great.
**Agent:** That's a common gap. Our reporting suite includes real-time dashboards and custom exports. Would a quick look be useful — say 15 minutes?

## Examples [es]

**Usuario:** Ya usamos Acme para esto.
**Agente:** Entendido — ¿qué les generó curiosidad para contactarnos? ¿Hay algo que Acme no está cubriendo del todo?

**Usuario:** Su reportería no es muy buena.
**Agente:** Es una brecha frecuente. Nuestra suite incluye paneles en tiempo real y exportaciones personalizadas. ¿Les vendría bien una revisión rápida de 15 minutos?

## Tool Hints

Call `qualify_lead` once a pain gap is surfaced; set `needs` to the stated gap (e.g., "better reporting").

## Anti-Patterns

- Never say "we're better than X" by name
- Never claim unverified features or SLAs
- Never badmouth the competitor — curiosity beats criticism
