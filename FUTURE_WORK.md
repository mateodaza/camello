# Future Work — Post-Launch Ideas

## 1. RAG Quality Improvements (post real-user feedback)

### Auto-tag doc types at ingestion
- One cheap LLM call per chunk to classify as `pricing`, `product`, `faq`, `services`, etc.
- Removes burden from user to manually tag content
- Improves intent-aware retrieval (currently falls back to "search everything" if untagged)

### Knowledge gap alerts
- Track empty-RAG rate per tenant (questions the agent couldn't answer)
- Surface to business owner: "Your agent couldn't answer 12 questions about 'returns policy' this week. Add a doc."
- Product feature, not RAG change — drives tenants to feed better knowledge

### Token budget scaling
- Current 2,400 token RAG budget is fine for launch (thin knowledge bases)
- As tenants grow content, may need dynamic budget or smarter chunk selection
- Consider cross-encoder reranking when scale justifies the latency

## 2. Advisor Agent / "Hand of the King" (high priority concept)

**Core idea:** The AI agent is only as good as what it knows. Instead of hoping users upload enough material, build an **advisor layer** that actively extracts knowledge from the business owner.

### Onboarding knowledge extraction chat
- If the user doesn't provide enough material (URLs, docs), trigger an interactive chat that interviews them about their business
- Extract: products/services, pricing, FAQs, common objections, business hours, policies, differentiators
- Convert extracted answers into structured knowledge chunks (auto-ingested into RAG)
- Minimum knowledge threshold: don't let the agent go live until it has enough to be useful

### Business intelligence advisor
- Judges the business based on what it learns — identifies gaps, suggests improvements
- "You have no pricing information. Your agent won't be able to handle pricing questions."
- "You haven't described your return policy. 23% of customer questions are about returns."
- Could evolve into a strategic advisor: "Your competitors offer X, consider adding..."

### Philosophy
- "A king is as stupid as its advisor" — the sales/support agent is the king, the advisor agent ensures it has the knowledge and strategy to perform
- This is a differentiator: most platforms just dump you into a blank agent. Camello actively helps you build a smart one.
- Worth investing in because it directly solves the #1 failure mode: under-informed agents giving bad answers

## 3. Richer Archetype Definitions (low priority, only if users ask)
- Inspired by agency-agents repo (61 structured agent personalities)
- Add `successMetrics`, `workflows` fields to `ArchetypeDefinition`
- Only valuable if surfaced in dashboard ("what is my agent optimizing for?")
- Park until post-launch feedback indicates demand
