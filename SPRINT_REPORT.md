# Sprint Report — nightcrawler/dev → main

**Date:** 2026-03-11
**Branch:** `nightcrawler/dev`
**Commits ahead of main:** 78 total (74 non-merge + 4 merge commits per `git log --oneline main..HEAD`)
**Build status:** ✅ `pnpm type-check` — 8/8 tasks successful (fully cached)
**Build status:** ✅ `pnpm build` — 4/4 tasks successful (fully cached)

---

## Section 1 — Changelog

Commits grouped by sprint/feature area (oldest → newest within each group).

### Bootstrap / Housekeeping
| Hash | Message |
|------|---------|
| `45eb704` | feat(NC-007): Task NC-007 |
| `34b40d4` | feat(NC-101): Task NC-101 |
| `e6e8450` | feat: improving tasks |
| `04c6682` | chore: new tasks for NC |
| `e58a2df` | chore: after audit improvements |
| `d839edf` | chore: cleaning up repo |
| `b1d4f51` | feat: audit and new sprint handoff to NC |
| `1f6c1d9` | feat: sales dashboard spec |

### Sprint CAM-101–132: Sales Workspace Enhancements
| Hash | Message |
|------|---------|
| `ba41d9c` | feat(CAM-101): Approve/reject UI for pending module executions |
| `1769f1c` | feat(CAM-102): Module config UI — calendar URL, payment URL, autonomy controls |
| `8b03493` | feat(CAM-103): Dashboard polling — refetchInterval on workspace queries |
| `e4785aa` | feat(CAM-104): Robust budget parser for lead estimated_value |
| `e3115ab` | feat(CAM-105): Enhanced lead scoring — multi-signal weighted algorithm |
| `aaf66c2` | feat(CAM-106): Sales prompt optimization — objection handling + closing techniques |
| `cfd0483` | feat(CAM-107): Fix onboarding Step 3 module badges + collect profile basics |
| `baf36e8` | feat(CAM-108): Owner notification channel — in-app chat with the agent |
| `930abfe` | feat(CAM-109): Quote-to-payment auto-flow on approval |
| `c12feea` | feat(CAM-110): Auto-stage progression on re-qualification |
| `2f9714e` | feat(CAM-111): Period-over-period sales comparison |
| `79684f5` | feat(CAM-114): Revenue forecasting card |
| `9186cba` | feat(CAM-116): Conversation summarization on resolve |
| `c9534a7` | feat(CAM-115): Sales auto-follow-up scheduling |
| `213437f` | feat(CAM-113): Lead source attribution |
| `29cb39b` | feat(CAM-112): Lead notes and unified activity timeline |
| `d6ffe23` | feat(CAM-117): Support workspace: ticket resolution flow |
| `98c0662` | feat(CAM-118): Support workspace: knowledge gap inline ingest + improved UX |
| `b99826d` | feat(CAM-119): Marketing workspace: interest stats + draft content feed |
| `324d6df` | feat(CAM-120): Error boundary + global error handling audit |
| `993d7df` | feat(CAM-121): Test coverage push for new tRPC procedures |
| `3cc514f` | feat(CAM-122): Accessibility audit on new components |
| `7024dc9` | feat(CAM-123): Conversation list redesign — filters + search |
| `dcd95e5` | feat(CAM-124): Dashboard home page — activity feed + quick stats |
| `6becbf4` | feat(CAM-125): Settings page polish — danger zone + data export |
| `21e6be8` | feat(CAM-126): Onboarding wizard — Step 4 (Teach Agent) improvements |
| `9c65885` | feat(CAM-127): Widget chat — typing indicator + message status |
| `62fff7a` | feat(CAM-128): Support prompt optimization — empathy + escalation intelligence |
| `188b024` | feat(CAM-129): Marketing prompt optimization — engagement + content strategy |
| `422e24b` | feat(CAM-130): Agent performance dashboard — response time + satisfaction trends |
| `35d6e08` | feat(CAM-131): Customer insights — returning visitor tracking |
| `66e301f` | feat(CAM-132): E2E smoke test plan |

### Sprint NC-201–220: Inbox (Three-Panel Operational Layer)
| Hash | Message |
|------|---------|
| `5ed5a16` | feat(NC-202): `conversation.activity` tRPC procedure |
| `1399a36` | feat(NC-203): `conversation.replyAsOwner` tRPC mutation |
| `1a0d1d4` | feat(NC-204): Anonymous customer naming cleanup + display_name read precedence |
| `aa1401c` | feat(NC-205): Inbox layout shell: 3-panel responsive component |
| `a3351ec` | feat(NC-206): Inbox route state + left panel conversation list |
| `c770678` | feat(NC-207): Center panel: chat thread with module execution badges |
| `5031d26` | feat(NC-208): Right panel: customer details + activity timeline + notes |
| `564da3c` | feat(NC-210): Deep-link redirect + mobile responsive inbox |
| `63e5f30` | feat(NC-209): Owner reply input for escalated conversations |
| `6f32c02` | feat(NC-211): Simplify `/dashboard` home page |
| `df029fd` | feat(NC-212): Simplify `/dashboard/agents/[id]` to config-only page |
| `ed0b938` | feat(NC-213): Promote `/dashboard/analytics` page |
| `0a16bbc` | feat(NC-214): Remove old workspace components |
| `2b9bce5` | feat(NC-216): Fix book_meeting business hours validation |
| `b3b1784` | feat(NC-217): i18n for all new inbox components (en + es) |
| `472290b` | feat(NC-218): Accessibility audit on inbox |
| `de906d6` | feat(NC-219): Update sidebar navigation |
| `f3fa239` | feat(NC-220): Sprint smoke tests + summary |

### Codex Audit Fixes + Polishes
| Hash | Message |
|------|---------|
| `3e79701` | fix: resolve Codex audit findings (NC-210/212/216/206) + green test baseline |
| `04cf315` | fix: zero-loss message persistence, aggressive tool calling & inbox UX polish |

### Sprint NC-221–230: Sales Agent Dashboard Tab
| Hash | Message |
|------|---------|
| `a572f32` | feat(NC-221): Setup/Dashboard tab navigation to agent workspace |
| `53a8ae3` | feat(NC-222): Quotes section |
| `6da3a06` | feat(NC-223): Meetings section |
| `682875d` | feat(NC-224): Payments section |
| `53df1f4` | feat(NC-225): Follow-ups section |
| `d3cbe01` | feat(NC-227): Wire Performance + Activity into Dashboard tab |
| `fcd2c50` | feat(NC-228): Pending Approvals section with approve/reject actions |
| `0e18d5f` | feat(NC-229): Trust graduation card on Dashboard tab |
| `9c01ac1` | feat(NC-230): Visual polish pass on agent workspace |

### AI Hardening + Pre-Merge Audit
| Hash | Message |
|------|---------|
| `12c845c` | Create FUTURE_WORK.md |
| `8d83988` | fix: audit on NC work |
| `3dbc58b` | fix: pre-merge audit — double-tap guard, userId assertion, COALESCE, regex lastIndex, Promise.allSettled |
| `4f916ab` | feat: AI hardening — context curation, anti-hallucination stack, concise responses (intent profiles + grounding retry + fail-closed + telemetry) |
| `a251653` | feat: new NC tasks |

### Merge Commits
| Hash | Message |
|------|---------|
| `db975ae` | Merge pull request #1 from mateodaza/nightcrawler/dev |
| `536d993` | Merge branch 'nightcrawler/dev' of … into nightcrawler/dev |
| `5986325` | Merge pull request #2 from mateodaza/nightcrawler/dev |
| `813dedb` | Merge remote-tracking branch 'origin/main' into nightcrawler/dev |

---

## Section 2 — Issues Encountered

### Issue 1: Visitor ID pollution in customer `name` column
**What went wrong:** The widget webhook was storing the machine-generated `visitor_XXX` session ID directly into `customers.name`. Inbox UI displayed these raw IDs instead of human-readable names.
**Root cause:** `apps/api/src/webhooks/widget.ts` created/upserted webchat customers with the session visitor ID as the `name` field with no sanitization; no human-readable label column existed.
**Fix:** NC-204 (commit `1a0d1d4`) added a `display_name` column via migration 0021 (`apps/api/src/webhooks/widget.ts:99-103` — insert now sets `name: null` for anonymous webchat customers). On new customer insert, `display_name` is assigned a sequential `Visitor N` label scoped to the tenant (`apps/api/src/webhooks/widget.ts:115-124`). The conversation list and detail queries were updated to use `COALESCE(${customers.name}, ${customers.displayName}, 'Unknown')` — read precedence is **`name` first, then `displayName`**, falling back to `'Unknown'` (`apps/api/src/routes/conversation.ts:96` in `list`, `apps/api/src/routes/conversation.ts:137` in `byId`). Migration 0022 (`0022_backfill_visitor_names.sql`) nulls out existing `name` values matching the `visitor_*` pattern and backfills `display_name` for those rows.

### Issue 2: regex `lastIndex` bleed on global RegExp in intent classifier
**What went wrong:** Shared global RegExp instances for intent classification retained `lastIndex` state between calls, causing alternating match failures.
**Root cause:** JavaScript `RegExp` with `g` flag retains `lastIndex` across `.test()` calls on the same instance.
**Fix:** Commit `3dbc58b` — `packages/ai/src/memory-extractor.ts:177` — `MEMORY_TAG_RE.lastIndex = 0;` before the exec loop (`packages/ai/src/memory-extractor.ts:178-179`). Also caught in pre-merge audit pass.

### Issue 3: Double-tap on approve/reject mutations
**What went wrong:** Fast double-clicks on approve/reject buttons in the inbox and dashboard triggered duplicate tRPC mutation calls, potentially causing duplicate module executions or DB errors.
**Root cause:** No client-side debounce or loading guard on the mutation buttons.
**Fix:** Commit `3dbc58b` — `apps/widget/src/hooks/useChat.ts:42` — `const isSendingRef = useRef(false);` declared; `apps/widget/src/hooks/useChat.ts:47` — `if (isSendingRef.current || inputDisabled) return;` guard on send. Server-side: `apps/api/src/routes/module.ts:77` — `eq(moduleExecutions.status, 'pending')` in `approve` WHERE clause; `apps/api/src/routes/module.ts:274` — same guard in `reject`.

### Issue 4: `userId` missing assertion in tRPC context
**What went wrong:** Some `tenantProcedure` handlers accessed `ctx.userId` without asserting it was present, risking runtime crashes with misleading error messages.
**Root cause:** Clerk middleware sets userId from JWT; if JWT is malformed or missing, `userId` could be undefined.
**Fix:** Commit `3dbc58b` — `apps/api/src/routes/conversation.ts:330-331` — `if (!ctx.userId) { throw new TRPCError({ code: 'UNAUTHORIZED' }) }` assertion added.

### Issue 5: `Promise.allSettled` vs `Promise.all` in parallel fetch paths
**What went wrong:** Several parallel data fetch paths (e.g., in the inbox right panel) used `Promise.all`, meaning one failing sub-query would crash the entire panel.
**Root cause:** Over-optimistic error handling assumption.
**Fix:** Commit `3dbc58b` — `apps/api/src/routes/agent.ts:742` — `const results = await Promise.allSettled(...)` replaces `Promise.all`; `apps/api/src/routes/agent.ts:759` — rejection filter with `console.warn` for failed sub-queries.

### Issue 6: COALESCE missing on nullable aggregate queries
**What went wrong:** SQL aggregate queries (e.g., lead count, revenue sums) returned `null` instead of `0` when no rows existed, causing NaN renders in the dashboard.
**Root cause:** PostgreSQL SUM/COUNT over empty sets returns NULL, not 0.
**Fix:** Commit `3dbc58b` — `apps/api/src/routes/agent.ts:167` — `coalesce(sum(${leads.estimatedValue}), 0)::text`; `apps/api/src/routes/agent.ts:214-226` — raw SQL COALESCEs in `salesComparison`; `apps/api/src/routes/agent.ts:481,485` — COALESCE in `salesForecast`.

### Issue 7: book_meeting business hours validation gap
**What went wrong:** NC-216 identified that `book_meeting` module accepted meeting requests at any hour — no business hours check was applied.
**Root cause:** Module input schema had no `requestedTime` validation against a time window.
**Fix:** Commit `2b9bce5` — `packages/ai/src/modules/book-meeting.ts:9-45` — `parseBusinessHours()` handles 12h format (L18) and 24h format (L36); `packages/ai/src/modules/book-meeting.ts:48-74` — `checkOutsideHours()` validates the requested time against the business hours window. Test in `packages/ai/src/__tests__/module-executor.test.ts`.

### Issue 8: tRPC context — userId resolution failure during inbox load
**What went wrong:** During inbox deep-link load (`/dashboard/conversations?id=XXX`), some authenticated requests were not receiving the expected `userId` and `tenantId` in the tRPC context, causing procedures to behave as if unauthenticated.
**Root cause:** `apps/api/src/trpc/context.ts` — `createContext()` did not robustly handle JWT verification failures. If `clerk.authenticateRequest()` threw (e.g., on a malformed or expired token), the error propagated uncaught, crashing context creation rather than falling back to an unauthenticated null context. This caused unpredictable behavior for requests with stale tokens.
**Fix:** Commit `3e79701` — `apps/api/src/trpc/context.ts` — restructured to a single, defensive auth path: the Authorization header is checked as a guard condition (L82); `clerk.authenticateRequest()` is called inside a try/catch (L84-90) where any JWT verification failure causes an immediate early return with all-null context; `userId` and `orgId` are extracted exactly once from `requestState.toAuth()` (L93-95) and populated in a single return at L117. There is no header-based userId fallback — the Authorization header is used only as a guard before delegating authentication entirely to Clerk.

**`file:line` references:**
- `apps/api/src/trpc/context.ts:75-77` — single declaration: `userId`, `orgId`, `userFullName` all initialized null
- `apps/api/src/trpc/context.ts:82` — `authHeader` guard (used as presence check, not as userId source)
- `apps/api/src/trpc/context.ts:84-90` — `clerk.authenticateRequest(req, {})` in try/catch; catch returns early with all nulls
- `apps/api/src/trpc/context.ts:93-95` — single extraction: `userId = clerkUserId; orgId = clerkOrgId ?? null;`
- `apps/api/src/trpc/context.ts:117` — single return

### Issue 9: Zero-loss message persistence gap
**What went wrong:** If an error occurred inside the grounding check (e.g., the secondary grounding LLM call timed out), execution aborted before reaching the message insert, leaving the LLM's response generated but not persisted. On reload, the conversation appeared to have no agent reply.
**Root cause:** `apps/api/src/orchestration/message-handler.ts` — the grounding check (`checkGroundingWithRetry`) ran between LLM response generation and message persistence with no error boundary. An unhandled throw from the grounding step would propagate up and short-circuit the rest of the handler, including the `db.insert(messages)` call.
**Fix:** Commit `04cf315` — `message-handler.ts` — the grounding check is now wrapped in a try/catch (L754-788): on grounding failure, high-risk intents or claim-containing responses are replaced with a safe fallback (`SAFE_FALLBACKS`, fail-closed — L780-783); low-risk intents without claims fail-open and preserve the original response (L785-787). In both cases, execution continues and `responseText` is set, so the plain `db.insert(messages)` at L806-816 always runs. The message insert remains a standard `db.insert()` (not an upsert). Additionally, `apps/widget/src/hooks/useChat.ts:224` — the polling loop guards with `if (isSendingRef.current) return;` to prevent a background server poll from arriving and conflicting with an in-flight user message send.

**`file:line` references:**
- `apps/api/src/orchestration/message-handler.ts:754` — `try {` opening the grounding check block
- `apps/api/src/orchestration/message-handler.ts:756` — `checkGroundingWithRetry({...})`
- `apps/api/src/orchestration/message-handler.ts:774` — `} catch (err) {` — fail-closed/fail-open resolution
- `apps/api/src/orchestration/message-handler.ts:780-783` — fail-closed path: high-risk/claim-containing responses replaced with `SAFE_FALLBACKS`
- `apps/api/src/orchestration/message-handler.ts:785-787` — fail-open path: low-risk intents preserve original response
- `apps/api/src/orchestration/message-handler.ts:806-816` — plain `db.insert(messages).values({...})` — always reached after grounding block resolves
- `apps/widget/src/hooks/useChat.ts:224` — polling guard: `if (isSendingRef.current) return;`

---

## Section 3 — Known Limitations

### 3.1 Inbox — no real-time updates
The inbox conversation list and chat thread poll via `refetchInterval` (5s on conversation list, 3s on active thread). There is no WebSocket or SSE. On high-volume accounts, this creates up to 5s lag before new messages appear. Acceptable for launch; should be replaced with Supabase Realtime before scaling.

### 3.2 Trust graduation score is heuristic only
`trust-graduation-card.tsx` computes an autonomy readiness score from approval rate + message count. Thresholds (70% approval, 50 messages) are hardcoded constants. There is no statistical model backing this, and the recommendation to "go fully autonomous" is advisory-only — the UI doesn't actually change autonomy settings automatically.

### 3.3 Grounding check only fires on high-risk intents
The anti-hallucination grounding check (`packages/ai/src/grounding-check.ts`) is gated behind intent profile `skipGrounding` flag. Intents like `greeting`, `farewell`, `thanks`, and `clarification` skip grounding entirely. This is correct for cost/latency reasons, but means off-topic claims buried in a greeting response would not be caught.

### 3.4 Intent profiles use regex for low-cost intents; LLM for ambiguous
The `greeting:regex` profile (fast path) only fires if the message matches a simple word-boundary regex. Multi-language or creative phrasing may fall through to LLM classification, incurring latency + cost. No Spanish-specific regex variants exist yet.

### 3.5 `display_name` backfill depends on migration order
Migrations 0021 and 0022 must be applied in order. If 0021 was applied in a previous session and 0022 skipped (e.g., partial apply), some visitor names will be missing. The SQL in 0022 is idempotent but relies on 0021's column existing.

### 3.6 Agent Dashboard tab — no pagination on data sections
Quotes, meetings, payments, and follow-ups sections in the sales dashboard (`apps/web/src/components/agent-workspace/sales/`) fetch up to 50 most recent records. No pagination or infinite scroll. Tenants with high volume will hit this cap silently.

### 3.7 Inbox mobile view — 3-panel collapses to 1-panel only
The inbox layout (`inbox-layout.tsx`) is responsive and collapses panels on mobile, but panel transitions are CSS-only (no swipe gesture support). On small-screen mobile, navigation between panels requires tap on header back button, which is non-obvious.

### 3.8 Memory extractor — no deduplication across conversations
`packages/ai/src/memory-extractor.ts` extracts `[MEMORY:key=value]` tags and upserts into customer memory. If the same fact is stated across multiple conversations (e.g., "my budget is $5k"), it upserts correctly, but there is no semantic deduplication — slightly rephrased versions create separate entries.

### 3.9 Context curation telemetry — nullable column, no dashboard
Migration 0023 adds `context_curation` JSONB to `interaction_logs`. Data is written per generation. There is no UI or analytics query exposing this data yet. It's a black box observable only via direct DB query.

### 3.10 CAM-113 lead source attribution — keyword matching only
Source attribution (`qualify-lead-source-attribution.ts`) uses keyword/URL pattern matching to classify lead source (organic, paid, referral, etc.). UTM parameters are not yet tracked at the widget embed level. Attribution will be inaccurate for tenants running paid campaigns.

---

## Section 4 — Architecture Decisions

### 4.1 Inbox as shared operational layer (not a workspace replacement)
**Decision:** Build the inbox as a standalone `/dashboard/conversations` route with its own 3-panel layout component, not embedded inside the existing agent workspace.
**Rationale:** The workspace is agent-config-focused (Settings + Dashboard tabs). The inbox is cross-agent and conversation-driven. Merging them would create a messy multi-purpose component. The inbox owns all real-time conversation management; the workspace owns agent performance and config.
**Tradeoff:** Two separate navigation destinations (sidebar: Inbox + Agent). Some data (e.g., pending approvals) appears in both. Accepted: the overlap is small and each surface has a distinct job.

### 4.2 Intent profiles as single source of truth for context curation
**Decision:** All context-window decisions (which prompt sections to include, which tools to expose, token caps, step limits, grounding mode) are derived from a single `IntentProfile` object keyed by intent type (`packages/ai/src/intent-profiles.ts`).
**Rationale:** Previously, these decisions were scattered across `message-handler.ts` with ad-hoc conditionals. Intent profiles centralize and make them auditable. Adding a new intent type requires only adding a profile entry — no surgery on the orchestrator.
**Tradeoff:** Profiles are static at runtime (no per-tenant override yet). A tenant with a high-trust agent can't get different tool exposure than a new agent for the same intent. This is acceptable for launch; per-tenant profile overrides are a future extension point.

### 4.3 Fail-closed grounding for claim-sensitive intents
**Decision:** For intents classified as `pricing_question`, `service_inquiry`, or `product_info`, the grounding check is mandatory. If the check fails (response contains unsupported claims) AND the safe fallback is used, this is logged as `failClosedTriggered: true` in `context_curation` telemetry.
**Rationale:** The worst failure mode for a sales agent is hallucinating product details or pricing. Failing closed (returning a safe "I don't have that info" response) is better than letting a confident-sounding wrong answer through.
**Tradeoff:** Adds ~300–600ms latency and cost of a second LLM call for these intents. Accepted — these are the intents where quality matters most.

### 4.4 Grounding check uses a separate cheaper model
**Decision:** The grounding check (`grounding-check.ts`) uses `MODEL_MAP.grounding` (a fast, cheap model) rather than the main generation model.
**Rationale:** Grounding is a classification task (grounded vs. not), not a generation task. A smaller model suffices and reduces marginal cost of the second call.
**Tradeoff:** The grounding model may have different sensitivity thresholds than the generator. Miscalibrated grounding models could over-flag or under-flag. Monitored via `context_curation` telemetry.

### 4.5 Progressive autonomy model for Dashboard tab
**Decision:** Dashboard tab starts with approvals required for all module outputs. The trust graduation card shows a readiness score based on historical approval rate and volume. Autonomy upgrade is opt-in and not automatic.
**Rationale:** New tenants don't have calibrated trust. Starting conservative prevents the agent from making unreviewable commitments (sending quotes, booking meetings) before the owner has validated it. Matches the platform's stated 70% manual → autonomous progression.
**Tradeoff:** More friction for technically-savvy users who trust the agent immediately. Mitigated by: the graduation card shows estimated time to autonomy readiness.

### 4.6 Inbox left panel — optimistic filtering on client
**Decision:** Conversation list filters (status, channel, search) are applied client-side on the fetched list, not as server-side query params.
**Rationale:** Simplifies server query, avoids multiple tRPC procedure variants. With the 50-conversation fetch limit, client filtering is fast.
**Tradeoff:** Filter accuracy degrades if the tenant has >50 conversations and the filtered match is in the unloaded tail. Acceptable for current scale; pagination + server-side filtering is a future task.

### 4.7 Memory extractor as post-generation, tag-based approach
**Decision:** The agent embeds `[MEMORY:key=value]` tags in its response text. A post-generation extractor (`memory-extractor.ts`) parses and strips these tags before the response is shown to the user.
**Rationale:** No separate memory-extraction LLM call needed. Memory capture is a side-effect of generation, not an additional step. Backward compatible — agents without the memory prompt produce no tags.
**Tradeoff:** Tags must be stripped reliably before display. If the regex fails (e.g., malformed tag), raw tag text could leak to the user. Mitigated: regex is tested, extractor fails gracefully (leaves text as-is).

---

## Section 5 — Test Coverage

### Test files by package

**`apps/api/src/__tests__/`** (~384 test cases)
| File | Scope |
|------|-------|
| `adapters/customer-naming.test.ts` | visitor_ name normalization, display_name precedence |
| `adapters/webchat.test.ts` | web chat adapter |
| `adapters/whatsapp.test.ts` | WhatsApp adapter |
| `agent-streaks.test.ts` | agent streak logic |
| `apply-archetype-defaults.test.ts` | archetype default application |
| `budget-exceeded.test.ts` | budget gate |
| `inbox-smoke.test.ts` | inbox end-to-end smoke (create conv, send message, approve, reply as owner) |
| `integration/budget-gate-integration.test.ts` | budget gate integration |
| `integration/full-message-pipeline.test.ts` | full pipeline: ingest → LLM → persist |
| `integration/module-tool-calling.test.ts` | module tool call flow |
| `integration/rag-knowledge-flow.test.ts` | RAG retrieval flow |
| `kpi-instrumentation.test.ts` | KPI log writes |
| `routes/abuse-controls.test.ts` | rate limiting, abuse controls |
| `routes/agent-customer-insights.test.ts` | returning visitor metrics |
| `routes/agent-dashboard.test.ts` | dashboard tRPC procedures |
| `routes/agent-export-data.test.ts` | settings data export |
| `routes/agent-followups.test.ts` | follow-ups section data |
| `routes/agent-knowledge-gaps.test.ts` | knowledge gap reporting |
| `routes/agent-lead-notes.test.ts` | lead notes CRUD |
| `routes/agent-marketing-stats.test.ts` | marketing interest stats |
| `routes/agent-meetings.test.ts` | meetings section data |
| `routes/agent-notifications.test.ts` | owner notification channel |
| `routes/agent-quotes.test.ts` | quotes section data |
| `routes/agent-routes.test.ts` | general agent CRUD |
| `routes/agent-sales-comparison.test.ts` | period-over-period comparison |
| `routes/agent-sales-forecast.test.ts` | revenue forecasting |
| `routes/agent-source-breakdown.test.ts` | lead source attribution |
| `routes/analytics-intent-breakdown.test.ts` | intent analytics |
| `routes/analytics-monthly-usage.test.ts` | monthly usage analytics |
| `routes/artifact-deactivate.test.ts` | artifact deactivation |
| `routes/artifact-uniqueness.test.ts` | artifact uniqueness constraints |
| `routes/billing-routes.test.ts` | Paddle billing webhooks |
| `routes/conversation-activity.test.ts` | conversation.activity procedure |
| `routes/conversation-list-filters.test.ts` | inbox filter logic |
| `routes/conversation-reply-as-owner.test.ts` | replyAsOwner mutation |
| `routes/customer-routes.test.ts` | customer CRUD |
| `routes/knowledge-routes.test.ts` | knowledge ingestion |
| `routes/learning-routes.test.ts` | learning/feedback loop |
| `routes/module-approve-quote-payment.test.ts` | approve/reject mutations |
| `routes/module-update-draft.test.ts` | draft content update |
| `routes/onboarding-routes.test.ts` | onboarding steps |
| `routes/sandbox-chat.test.ts` | sandbox chat |
| `routes/tenant-profile.test.ts` | tenant profile |
| `routes/whatsapp-routes.test.ts` | WhatsApp webhook routes |
| `routes/widget-routes.test.ts` | widget session routes |
| `services/tenant-provisioning.test.ts` | tenant provisioning |
| `webhooks/clerk-webhook.test.ts` | Clerk webhook handler |
| `webhooks/paddle-webhook.test.ts` | Paddle webhook handler |

**`packages/ai/src/__tests__/`** (~261 test cases)
| File | Scope |
|------|-------|
| `archetype-prompts.test.ts` | prompt rendering per archetype |
| `chunker.test.ts` | RAG chunking |
| `chunk-roles.test.ts` | chunk role tagging |
| `grounding-check.test.ts` | grounding check pass/fail |
| `memory-extractor.test.ts` | tag extraction + stripping |
| `module-executor.test.ts` | module execution + book_meeting hours |
| `prompt-builder.test.ts` | intent-profile-gated prompt builder |
| `qualify-lead-budget-parser.test.ts` | budget value extraction |
| `qualify-lead-followup-scheduling.test.ts` | follow-up scheduling |
| `qualify-lead-notification.test.ts` | stage-advance notifications |
| `qualify-lead-scoring.test.ts` | lead scoring algorithm |
| `qualify-lead-source-attribution.test.ts` | source classification |
| `qualify-lead-stage-progression.test.ts` | stage auto-progression |
| `rag.test.ts` | RAG retrieval |
| `regex-intents.test.ts` | regex intent classifier |
| `summarize-conversation.test.ts` | conversation summarization |

**`apps/web/src/__tests__/`** (~108 test cases)
| File | Scope |
|------|-------|
| `a11y-audit.test.tsx` | accessibility assertions on key components |
| `agent-workspace.test.ts` | workspace component rendering |
| `billing-page.test.tsx` | billing page |
| `chat-page.test.ts` | public chat page |
| `skeleton.test.tsx` | skeleton loaders |
| `step3-meet-agent.test.tsx` | onboarding step 3 |
| `step4-teach-agent.test.tsx` | onboarding step 4 |
| `test-chat-panel.test.tsx` | chat panel |
| `use-toast.test.ts` | toast hook |
| `onboarding/__tests__/onboarding.test.ts` | onboarding flow |
| `lib/format.test.ts` | date/number formatting |

**`apps/jobs/src/__tests__/`** (~53 test cases)
| File | Scope |
|------|-------|
| `content-extractor.test.ts` | URL content extraction |
| `learning-decay.test.ts` | learning decay cron |
| `metrics-rollup.test.ts` | metrics rollup cron |
| `process-followups.test.ts` | follow-up processing cron |
| `url-ingestion.test.ts` | URL ingestion cron |
| `worker.test.ts` | cron worker factory |

**`packages/db/src/__tests__/`**
| File | Scope |
|------|-------|
| `rls.integration.test.ts` | RLS tenant isolation (integration) |

**Total: ~806+ test cases across 75 test files.**

### Coverage gaps
- **Inbox UI components** (`inbox-layout.tsx`, `chat-thread.tsx`, `customer-panel.tsx`, `conversation-list.tsx`) — no component-level tests. Accessibility audit covers them but functional rendering is untested.
- **Dashboard sales sections** (`quotes-section.tsx`, `meetings-section.tsx`, etc.) — no component tests. Backend procedures are covered.
- **Intent profiles** (`intent-profiles.ts`) — no dedicated test. Indirectly exercised via `prompt-builder.test.ts` and `grounding-check.test.ts`.
- **Widget `useChat.ts`** — partially covered via integration tests; the optimistic-update + isSending guard has no unit test.
- **Trust graduation card** (`trust-graduation-card.tsx`) — scoring logic lives in the component, no unit test.

---

## Section 6 — Migrations

Migration 0021 has been applied to Supabase cloud (manually applied per TASK_QUEUE.md, NC-201 task record). Migrations 0022 and 0023 are written but **not yet applied** — human review and `pnpm db:push` required.

| # | File | Status | Summary |
|---|------|--------|---------|
| 0001–0020 | (pre-existing) | Applied | Foundation schema, RLS, billing, jobs, sales, notifications, notes, source attribution, unique queued follow-up |
| 0021 | `0021_customer_display_name.sql` | **Applied** (manually applied to Supabase cloud — NC-201 task record) | Adds `display_name TEXT` to `customers`. Backfills unnamed customers with sequential `Visitor N` per tenant. |
| 0022 | `0022_backfill_visitor_names.sql` | **Pending** | Nulls out `name` values matching `visitor_*` pattern (machine IDs). Extends Visitor N sequence for customers still missing `display_name`. Depends on 0021. |
| 0023 | `0023_context_curation_telemetry.sql` | **Pending** | Adds `context_curation JSONB` to `interaction_logs`. Tracks per-generation intent profile decisions for observability. Nullable, no backfill needed. Includes post-check assertion. |

**Risk notes:**
- 0021 backfill runs `ROW_NUMBER()` over all customers per tenant — on large datasets this may be slow. Should run during off-peak.
- 0022 UPDATE on `name` column touches potentially many rows. Index on `name LIKE 'visitor_%'` not present; full table scan expected.
- 0023 is additive and low risk.

---

## Section 7 — Build Status

### `pnpm type-check`
```
Tasks:    8 successful, 8 total
Cached:   8 cached, 8 total
Time:     268ms >>> FULL TURBO
```
All packages pass TypeScript strict-mode type-check. No errors.

### `pnpm build`

**Next.js web app (14 routes):**
```
Route (app)                                 Size  First Load JS
┌ ƒ /                                      174 B         111 kB
├ ƒ /_not-found                            992 B         103 kB
├ ƒ /chat/[slug]                         9.23 kB         120 kB
├ ƒ /dashboard                           3.98 kB         182 kB
├ ƒ /dashboard/agents/[id]               11.3 kB         166 kB
├ ƒ /dashboard/analytics                 3.58 kB         155 kB
├ ƒ /dashboard/artifacts                 7.72 kB         158 kB
├ ƒ /dashboard/conversations             10.6 kB         158 kB
├ ƒ /dashboard/conversations/[id]          127 B         102 kB
├ ƒ /dashboard/docs                      1.98 kB         125 kB
├ ƒ /dashboard/knowledge                 6.31 kB         154 kB
├ ƒ /dashboard/settings/billing          6.13 kB         153 kB
├ ƒ /dashboard/settings/profile          6.47 kB         154 kB
└ ƒ /onboarding                          7.28 kB         182 kB
+ First Load JS shared by all             102 kB
Middleware: 85.7 kB

Tasks:    4 successful, 4 total
Cached:   4 cached, 4 total
Time:     252ms >>> FULL TURBO
```

**API (tsup bundle):**
- `dist/index.js` — 2.78 MB
- `dist/index.js.map` — 6.06 MB
- Build time: 3384ms

**Node engine warning:** All packages warn `Unsupported engine: wanted node 22.x, current 24.14.0`. No functional impact — builds succeed. Recommend updating `engines` field in affected `package.json` files to `>=22.x`.

**No build errors. No type errors.**

---

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migrations 0021–0022 not applied | High | Inbox will show machine IDs instead of visitor names |
| Migration 0022 full-table scan | Medium | Run during off-peak, add index post-apply if needed |
| Inbox no real-time (polling only) | Medium | Acceptable for launch, schedule WebSocket upgrade |
| Dashboard sections no pagination | Low | 50-record cap; silent for low-volume tenants |
| Intent profile static (no per-tenant) | Low | All tenants get same curation; no customization yet |
| `context_curation` telemetry unexposed | Low | Data captured but no dashboard; black box for now |
| Node 22 engine warning | Low | No functional impact; cosmetic fix needed |
