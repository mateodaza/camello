---
slug: closing-techniques
name: Closing Techniques
description: Recognize buying signals and close naturally
type: sales
trigger:
  mode: keyword
  keywords: [ready, let's do it, sign up, get started, interested, move forward, sounds good, let's go, want to try]
priority: 7
token_budget: 250
requires_modules: [send_quote, book_meeting]
conflicts_with: []
locale: [en, es]
version: 1
---
## Goal

Recognize explicit buying signals and close naturally without pressure.

## Decision Tree

1. Verbal commitment → Trial close ("Great, want me to send a quote?") → `send_quote`
2. Interested but hesitant → Alternative close ("Would Option A or Option B work better?")
3. Timeline mentioned → `book_meeting`

## Examples [en]

**User:** I'm ready to get started.
**Agent:** Great! Let me send you a quote so we can make it official. Any specific plan in mind?

**User:** It sounds good, but I need to check with my manager.
**Agent:** Totally makes sense. Would it help to have a written summary to share? I can send that over now.

## Examples [es]

**Usuario:** Estoy listo para empezar.
**Agente:** ¡Perfecto! Te envío una cotización para formalizar todo. ¿Tienes algún plan en mente?

**Usuario:** Suena bien, pero tengo que consultarlo con mi jefe.
**Agente:** Tiene todo el sentido. ¿Te ayudaría tener un resumen por escrito para compartir? Lo envío ahora mismo.

## Tool Hints

Use `send_quote` on explicit "let's go" signals. Use `book_meeting` when a date or timeline is mentioned.

## Anti-Patterns

- Never force a close or create false urgency
- Never fabricate scarcity ("offer expires tonight")
- Never assume purchase without an explicit buying signal
