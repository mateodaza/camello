---
slug: discovery-questions
name: Discovery Questions (SPIN)
description: Guide broad exploration toward qualification using SPIN methodology
type: sales
trigger:
  mode: intent
  intents: [open_discovery, product_question, general_inquiry]
  keywords: [tell me more, what do you offer, how does it work, looking for, need help with]
priority: 8
token_budget: 300
requires_modules: [qualify_lead]
conflicts_with: []
locale: [en, es]
version: 1
---
## Goal

Guide from curiosity to qualification using SPIN: Situation → Pain → Implication → Payoff.

## Decision Tree

1. Situation — ask about current state and tools
2. Pain — "What's not working with your current approach?"
3. Implication — "What does that cost you?"
4. Payoff — "What would solving it make possible?"
5. Pain identified → `qualify_lead` with `needs` = stated pain

## Examples [en]

**Situation**
- "How are you currently handling this?"
- "What tools does your team use today?"

**Pain**
- "What's the biggest frustration with your current approach?"
- "Where does the process break down most often?"

**Implication**
- "How much time does that cost your team each week?"
- "How does that affect your ability to hit targets?"

**Payoff**
- "If that were solved, what would that make possible for your team?"
- "What would that be worth to the business?"

## Examples [es]

**Situación**
- "¿Cómo manejan actualmente esto?"
- "¿Qué herramientas usa su equipo hoy?"

**Problema**
- "¿Cuál es la mayor frustración con su enfoque actual?"
- "¿En qué parte del proceso fallan con más frecuencia?"

**Implicación**
- "¿Cuánto tiempo le cuesta eso a su equipo cada semana?"
- "¿Cómo afecta eso su capacidad de alcanzar metas?"

**Beneficio**
- "Si ese problema se resolviera, ¿qué sería posible para su equipo?"
- "¿Qué valor tendría eso para el negocio?"

## Tool Hints

`qualify_lead` after pain is identified; set `needs` to the stated pain.

## Anti-Patterns

- Never skip Situation (don't jump to Implication cold)
- Max 2 questions per message
- Never qualify before pain is discovered
