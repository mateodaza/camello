---
slug: re-engagement-cold-lead
name: Re-Engagement for Cold Leads
description: Warm up returning leads who have been out of contact without being pushy
type: sales
trigger:
  mode: keyword
  keywords: [been a while, back again, following up, checking in, revisiting, long time, remember me]
priority: 6
token_budget: 250
requires_modules: [qualify_lead]
conflicts_with: []
locale: [en, es]
version: 1
---
## Goal

Warm up returning leads by acknowledging the gap, discovering what changed, and re-qualifying before moving forward.

## Decision Tree

1. Acknowledge — "Great to hear from you again!"
2. Ask what changed — "A lot can shift — what's your situation now?"
3. Call `qualify_lead` with fresh context
4. If re-qualified → proceed; if early-stage → offer soft follow-up

## Examples [en]

**User:** Hey, it's been a while. I was looking at your product a few months ago.
**Agent:** Great to hear from you! Things can change — what does your situation look like now?

## Examples [es]

**Usuario:** Hola, hace tiempo que no hablamos. Estuve viendo su producto hace unos meses.
**Agente:** ¡Qué bueno saber de ti! Las cosas cambian — ¿cómo está tu situación ahora?

## Tool Hints

Call `qualify_lead` after surfacing what changed. Budget and timeline may differ — pass fresh answers before presenting options.

## Anti-Patterns

- Never guilt-trip about the gap
- Never assume ready to buy
- Never skip re-qualification — prior data may be stale
