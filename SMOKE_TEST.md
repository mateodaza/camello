# Camello — Manual Smoke Test Checklist

> **Purpose:** Final pre-launch gate. Walk through every user journey end-to-end before real users hit the product.
> **Audience:** Mateo (manual executor).
> **Pass criterion:** Every test case marked ✅. Any ❌ blocks launch.
>
> **Legend:**
> - 🌱 **Empty state** — can run immediately on a fresh tenant (no seed data required)
> - 🌾 **Needs seed data** — requires prior steps or pre-existing records; preconditions listed
> - `[CAM-XXX]` — feature introduced in that task

---

## Phase 1 — Sign-up & Onboarding

### ST-001 · Clerk sign-up and org creation 🌱

**Description:** New user signs up, Clerk creates an org, and the tenant row is provisioned.

**Preconditions:** None.

**Steps:**
1. Open the app in an incognito window.
2. Click **Sign up** → fill email + password → submit.
3. Complete Clerk's email verification step.
4. When prompted, create an organization (enter a name).

**Expected result:**
- Clerk session is created; user is redirected to `/onboarding` or the dashboard.
- A tenant row exists (visible via the dashboard org name in the sidebar).
- No 500 errors in the browser console.

---

### ST-002 · Onboarding Step 1 — Describe business 🌱

**Description:** Owner describes the business; archetype is auto-selected.

**Preconditions:** Fresh sign-up (ST-001 complete).

**Steps:**
1. Land on `/onboarding` — verify Step 1 is active.
2. Enter a business description (e.g., "We sell handmade leather goods online and in our shop").
3. Click **Continue** / **Next**.

**Expected result:**
- An archetype (sales / support / marketing) is shown as selected.
- Step indicator advances to Step 2.

---

### ST-003 · Onboarding Step 2 — Meet your agent 🌱

**Description:** Agent name and archetype are previewed.

**Preconditions:** ST-002 complete.

**Steps:**
1. Confirm the agent name displayed.
2. Read the archetype description.
3. Click **Continue**.

**Expected result:**
- Agent name is non-empty.
- Archetype description matches the selected type.
- Step advances to Step 3.

---

### ST-004 · Onboarding Step 3 — Module badges (CAM-107) 🌱

**Description:** Only modules belonging to the chosen archetype appear as badges — not the full module catalog.

**Preconditions:** ST-003 complete. Note the archetype selected.

**Steps:**
1. Observe the module badge list in Step 3.
2. Note the slugs shown (e.g., `qualify_lead`, `book_meeting`, `send_followup`).

**Expected result:**
- Badge list matches the `ARCHETYPE_MODULE_SLUGS` constant for the selected archetype.
- No extra modules from other archetypes appear.
- All badge text is non-empty (not raw slugs).

---

### ST-005 · Onboarding Step 3 — Quick Profile fields (CAM-107) 🌱

**Description:** Owner fills tagline, bio, and avatar; these surface on the public chat card.

**Preconditions:** ST-004 complete (still on Step 3 / Quick Profile section).

**Steps:**
1. Fill in **Tagline** (e.g., "Premium leather, made by hand").
2. Fill in **Bio** (2–3 sentences).
3. Upload an avatar image (JPG/PNG < 5 MB).
4. Click **Save** / **Continue**.

**Expected result:**
- No error toast.
- Values are persisted (verify by navigating away and returning to settings).

---

### ST-006 · Onboarding Step 4 — Teach agent (CAM-126) 🌱

**Description:** Suggested topics show, knowledge doc is added, knowledge count updates, URL ingestion queued.

**Preconditions:** ST-005 complete.

**Steps:**
1. On Step 4, verify 3–4 archetype-appropriate topic buttons appear (e.g., "Add your pricing info").
2. Click a topic button → confirm it pre-fills the textarea.
3. Edit the content, click **Add**.
4. Observe the progress indicator updates to "1 document added".
5. Paste a URL in the URL field → click **Queue URL**.

**Expected result:**
- After adding text: knowledge count badge increments (teal ≥3, gold 1–2, empty 0).
- After queuing URL: success toast or status message (async — not yet chunked/embedded).
- With 0 docs: soft warning appears ("Your agent works better with knowledge").

---

### ST-007 · Onboarding Step 5 — Connect channel 🌱

**Description:** Owner views channel options (web chat, WhatsApp).

**Preconditions:** ST-006 complete.

**Steps:**
1. Observe available channels.
2. Note the public chat URL shown.

**Expected result:**
- Public chat URL contains tenant slug (e.g., `/chat/acme-leather`).
- WhatsApp option is visible (may show "coming soon" or config instructions).

---

### ST-008 · Onboarding Step 6 — Test chat 🌱

**Description:** Final step lets owner preview the agent in a test chat.

**Preconditions:** ST-007 complete.

**Steps:**
1. Type a test message in the preview chat.
2. Wait for agent response.

**Expected result:**
- Agent responds within ~10 seconds.
- Response references the business description or knowledge added in Step 4.
- No error banner.

---

### ST-009 · Profile fields populate `/chat/[slug]` card (CAM-107) 🌾

**Description:** Tagline, bio, and avatar from onboarding appear on the public chat page.

**Preconditions:** ST-005 complete (tagline, bio, avatar set).

**Steps:**
1. Navigate to `/chat/<slug>` in a new tab.
2. Observe the business card at the top.

**Expected result:**
- Avatar image renders (or initials if no avatar).
- Tagline matches what was set in Step 3.
- Bio matches what was set.

---

## Phase 2 — Knowledge Base

### ST-010 · Add text knowledge + RAG retrieval 🌾

**Description:** Text knowledge is indexed and retrieved in chat.

**Preconditions:** At least one agent created (onboarding complete).

**Steps:**
1. Go to **Dashboard → Knowledge**.
2. Add a text snippet: "Our return policy: 30 days, no questions asked, contact support@acme.com."
3. Navigate to `/chat/<slug>`.
4. Ask: "What is your return policy?"

**Expected result:**
- Agent response mentions "30 days" and/or "support@acme.com".
- Response cites the knowledge base (no hallucination of different terms).

---

### ST-011 · URL ingestion queue + embedding (CAM-126) 🌾

**Description:** Queued URL is fetched, chunked, and embedded by the cron job.

**Preconditions:** ST-006 complete. A URL was queued. Cron job (`knowledge-ingest`) has run at least once.

**Steps:**
1. Go to **Dashboard → Knowledge**.
2. Verify the queued URL now shows status **chunked** or **embedded** (not **queued**).
3. Ask the agent a question about content from that URL.

**Expected result:**
- URL status changed from `queued` → `chunked`/`embedded`.
- Agent response references content from the URL.

---

### ST-012 · Knowledge gap detection (CAM-118) 🌾

**Description:** Low-confidence questions surface as knowledge gaps in the support workspace.

**Preconditions:** Agent has had at least one conversation where the answer was uncertain (low `tokens_out` relative to question complexity, or agent said "I'm not sure").

**Steps:**
1. In the public chat, ask a question the agent has no knowledge about (e.g., "What are your enterprise SLAs?").
2. Note the agent hedges or says it doesn't have the info.
3. Go to the agent's **Support Workspace**.
4. Scroll to the **Knowledge Gaps** section.

**Expected result:**
- A gap card appears for the unanswered intent.
- Card shows "Asked N times" badge and a sample question preview.
- **Add Answer** button is visible.

---

### ST-013 · Knowledge gap inline ingest (CAM-118) 🌾

**Description:** Owner answers a gap inline; card is removed optimistically.

**Preconditions:** ST-012 complete — at least one gap card is visible.

**Steps:**
1. Click **Add Answer** on a knowledge gap card.
2. Type the answer in the inline textarea.
3. Click **Submit**.

**Expected result:**
- Gap card disappears immediately (optimistic removal).
- No re-appearance on next poll refresh (30s).
- Success toast or visual confirmation.

---

## Phase 3 — Public Chat (`/chat/[slug]`)

### ST-014 · Business card renders (CAM-107) 🌾

**Description:** Avatar, tagline, bio, social links, and hours show on the public chat page.

**Preconditions:** Profile fully configured (ST-005 + social links set in Settings → Profile).

**Steps:**
1. Open `/chat/<slug>` in an incognito window.
2. Inspect the business card at the top.

**Expected result:**
- Avatar (or initials fallback) renders.
- Tagline and bio display correctly.
- Social links (if set) are clickable.
- Business hours show (if configured).

---

### ST-015 · Quick actions work 🌾

**Description:** Quick action chips send pre-filled messages.

**Preconditions:** Agent has at least one quick action configured (or archetype defaults exist).

**Steps:**
1. On `/chat/<slug>`, observe quick action chips (e.g., "Get a quote", "Book a meeting").
2. Click one.

**Expected result:**
- Chat input is pre-filled or a message is sent immediately.
- Agent responds appropriately to the quick action intent.

---

### ST-016 · Chat sends and receives 🌱

**Description:** Basic round-trip chat works.

**Preconditions:** Public chat page is accessible.

**Steps:**
1. Open `/chat/<slug>`.
2. Type "Hello" → press Enter (or click Send).

**Expected result:**
- Message appears in the chat bubble immediately.
- Agent responds within ~10 seconds.
- No console errors.

---

### ST-017 · Typing indicator shows (CAM-127) 🌱

**Description:** While the agent is processing, an animated typing indicator appears.

**Preconditions:** ST-016 setup.

**Steps:**
1. Send a message.
2. Immediately observe the chat window before the response arrives.

**Expected result:**
- Animated three-dot typing indicator appears below the user message while waiting.
- Indicator disappears when the agent response arrives.

---

### ST-018 · Message status icons (CAM-127) 🌱

**Description:** Sent (✓) → Delivered (✓✓) status shows on user messages.

**Preconditions:** ST-016 setup.

**Steps:**
1. Send a message.
2. Observe the message bubble.

**Expected result:**
- Single check (✓) appears immediately after sending.
- Double check (✓✓) appears once the server acknowledges.
- If API is down: red ✗ with a **Retry** button appears.

---

### ST-019 · Scroll behavior + scroll-to-bottom (CAM-127) 🌾

**Description:** Auto-scroll works; "scroll to bottom" pill shows when scrolled up.

**Preconditions:** Conversation with 10+ messages.

**Steps:**
1. Scroll up in the chat window.
2. Observe a "scroll to bottom" button appears.
3. Click it.

**Expected result:**
- Scroll-to-bottom pill visible when scrolled up.
- Clicking it snaps to latest message.
- New incoming message auto-scrolls when already at bottom.

---

### ST-020 · Abuse limits — 20 msg/min burst 🌾

**Description:** Sending >20 messages in under a minute triggers a rate limit.

**Preconditions:** Access to browser automation or manual fast clicking (21+ sends).

**Steps:**
1. Send 21 messages in rapid succession within 60 seconds.

**Expected result:**
- Message #21 (or around that point) receives a rate-limit error response or the chat input is disabled.
- An appropriate error message shows (not a generic 500).

---

### ST-021 · Abuse limits — 50 msg/conversation cap 🌾

**Description:** Conversation cap prevents more than 50 messages per session.

**Preconditions:** Existing conversation with 49 messages (requires seed data or patience).

**Steps:**
1. Send message #50.
2. Attempt message #51.

**Expected result:**
- Message #51 is rejected with a "conversation limit reached" message.
- UI shows a clear, non-alarming message.

---

### ST-022 · Session counter increments 🌾

**Description:** Each new visitor session increments the tenant session counter.

**Preconditions:** Agent workspace accessible.

**Steps:**
1. Open `/chat/<slug>` in a fresh incognito window (new session).
2. Send at least one message.
3. Check the agent workspace **Activity** section or dashboard stats.

**Expected result:**
- Conversation count on the dashboard increments by 1.
- The new conversation appears in the conversations list.

---

## Phase 4 — Sales Workspace

### ST-023 · Lead appears in kanban after chat qualifies 🌾

**Description:** When the sales agent qualifies a lead, it appears on the kanban board.

**Preconditions:** Sales agent created. Customer sends qualifying messages (name, interest, budget).

**Steps:**
1. Open `/chat/<slug>` and simulate a qualifying conversation (e.g., "I'm John, I want to buy your premium leather bag, my budget is $500").
2. Wait for agent to execute `qualify_lead` module.
3. Go to **Sales Workspace → Leads**.

**Expected result:**
- A new lead card appears in the kanban (stage: "New" or "Qualifying").
- Lead card shows customer name and score dots.

---

### ST-024 · Lead scoring shows numeric score (CAM-105) 🌾

**Description:** Lead cards display a numeric score (0–100) or score dots.

**Preconditions:** ST-023 complete — at least one lead exists.

**Steps:**
1. Open the sales workspace.
2. Observe lead cards on the kanban.

**Expected result:**
- Each lead card shows score dots (●●●○○) or numeric score.
- Higher-quality leads show more filled dots.

---

### ST-025 · Stage auto-advances on re-qualification (CAM-110) 🌾

**Description:** When a lead re-engages with new qualifying data, the stage advances automatically.

**Preconditions:** Lead exists at "New" or "Qualifying" stage (ST-023).

**Steps:**
1. The same customer returns to chat and provides more qualifying info (e.g., upgraded budget, confirmed purchase intent).
2. Wait for agent to re-run `qualify_lead`.
3. Observe the kanban.

**Expected result:**
- Lead card advances to the next stage (e.g., New → Qualifying, or Qualifying → Proposal).
- A `stage_advanced` notification fires (check bell icon).

---

### ST-026 · Stale lead alerts fire 🌾

**Description:** Leads with no activity for the configured stale threshold surface in alerts.

**Preconditions:** At least one lead with no activity for > stale threshold (e.g., 7 days). Requires seed data or adjusted threshold.

**Steps:**
1. Go to the sales workspace.
2. Scroll to the **Stale Lead Alerts** section.

**Expected result:**
- Stale lead cards appear with time-since-last-contact.
- "Re-engage" or action button is present.

---

### ST-027 · Source attribution bar chart populates (CAM-113) 🌾

**Description:** Lead source breakdown chart shows bars for each source channel.

**Preconditions:** At least 3 leads from different sources (web_chat, whatsapp).

**Steps:**
1. Go to the sales workspace.
2. Scroll to the **Source Attribution** / **Lead Sources** chart.

**Expected result:**
- `BarChartCss` renders with bars proportional to lead counts per source.
- Each bar has an accessible label.

---

### ST-028 · Week-over-week comparison shows deltas (CAM-111) 🌾

**Description:** `DeltaBadge` components on stat cards show green/red/dash deltas vs. last week.

**Preconditions:** Leads/conversations exist in both the current week and the previous week (requires seed data spanning two Monday–Sunday UTC windows).

**Steps:**
1. Go to the sales workspace.
2. Observe the hero stat cards (New Leads, Won Deals, Revenue, Conversations).
3. Check the "This Week" 4-cell comparison card.

**Expected result:**
- Delta badges show `↑X%` (green), `↓X%` (sunset red), or `—` (no data).
- Zero-division case: last week = 0 → shows "+N new" in teal.
- "This Week" card cells reflect Monday 00:00 UTC to current time.

---

### ST-029 · Revenue forecast card renders (CAM-114) 🌾

**Description:** 30-day forecast card shows pipeline value * conversion rates.

**Preconditions:** At least 5 leads across multiple stages (otherwise fallback rates apply).

**Steps:**
1. Go to sales workspace.
2. Find the **Revenue Forecast** card.

**Expected result:**
- "30-day forecast: $X" with currency formatted.
- Per-stage breakdown shows (qualifying, proposal, negotiation).
- If < 5 leads: fallback rates shown (qualifying 20%, proposal 50%, negotiation 70%).

---

### ST-030 · Sparklines populate 🌾

**Description:** Volume and resolution rate sparklines show daily trend lines.

**Preconditions:** At least 7 days of conversation data.

**Steps:**
1. Go to the sales workspace performance panel.

**Expected result:**
- Volume sparkline shows 30 data points (daily).
- Flat if no data — no crash or "undefined" error.

---

### ST-031 · Returning customers table (CAM-131) 🌾

**Description:** Customers who visited more than once appear in the "Returning Customers" table.

**Preconditions:** At least one customer has 2+ conversations.

**Steps:**
1. Go to sales workspace.
2. Scroll to **Returning Customers** section.

**Expected result:**
- Table shows customer name, visit count, last seen date, last topic.
- Clicking a row navigates to `/dashboard/conversations?customerId=<id>`.

---

## Phase 5 — Approvals & Notifications

### ST-032 · `send_quote` triggers approval card 🌾

**Description:** When the agent executes `send_quote` with `autonomyLevel = 'ask'`, an approval card appears.

**Preconditions:** Sales agent with `send_quote` module set to **Ask** autonomy. Lead at proposal/negotiation stage.

**Steps:**
1. In the public chat, drive the conversation to a quote request.
2. Agent should trigger `send_quote` module.
3. Go to the agent workspace.

**Expected result:**
- An approval card appears in the **Pending Approvals** section.
- Card shows quote amount and recipient.
- Unread badge on bell icon increments.

---

### ST-033 · Approve quote → payment record created (CAM-109) 🌾

**Description:** Approving a quote creates a payment record.

**Preconditions:** ST-032 complete — approval card is visible.

**Steps:**
1. Click **Approve** on the quote card.

**Expected result:**
- Card disappears (optimistic removal).
- Success toast.
- A payment record is created (visible in Sales Payments section or via database).
- Notification of type `approval_needed` is marked read.

---

### ST-034 · Reject quote with reason 🌾

**Description:** Rejecting a quote with a reason dismisses the card.

**Preconditions:** ST-032 complete — approval card is visible.

**Steps:**
1. Click **Reject** on the quote card.
2. Enter a reason in the textarea.
3. Click **Confirm Reject**.

**Expected result:**
- Card disappears.
- Error/rejection toast with the reason text.
- Card does not re-appear on next poll.

---

### ST-035 · Bell icon shows unread count 🌾

**Description:** Notification bell shows a badge with unread count.

**Preconditions:** At least one unread notification exists (from prior steps).

**Steps:**
1. Look at the top-right bell icon in the workspace header.

**Expected result:**
- Red/teal dot or number badge visible.
- Count matches the number of unread notifications.

---

### ST-036 · Notification panel — chronological feed 🌾

**Description:** Clicking the bell shows a chronological list of notifications.

**Preconditions:** Multiple notifications exist.

**Steps:**
1. Click the bell icon.
2. Observe the notification panel.

**Expected result:**
- Panel slides in.
- Notifications listed most-recent first.
- Each notification shows type label, body text, and relative timestamp.
- Panel is keyboard-accessible (Tab navigates items, Escape closes).

---

### ST-037 · Mark all read 🌾

**Description:** "Mark all read" clears the unread badge.

**Preconditions:** ST-036 — panel open with unread items.

**Steps:**
1. Click **Mark all read** in the notification panel.

**Expected result:**
- All notifications lose the unread dot.
- Bell badge count drops to 0 (or badge disappears).
- Action does not reload the page.

---

### ST-038 · `stage_advanced` notification fires on auto-progression (CAM-110) 🌾

**Description:** Auto-stage progression fires a notification.

**Preconditions:** ST-025 complete — a lead auto-advanced stages.

**Steps:**
1. After auto-stage advancement, open the notification panel.

**Expected result:**
- A `stage_advanced` notification exists in the feed.
- It references the lead customer name and new stage.

---

## Phase 6 — Lead Detail

### ST-039 · Click lead → sheet opens 🌾

**Description:** Clicking a lead card on the kanban opens the lead detail sheet.

**Preconditions:** At least one lead exists on the kanban.

**Steps:**
1. Click a lead card on the kanban board.

**Expected result:**
- A side sheet slides in from the right.
- Sheet shows customer name, stage, score.
- Sheet has accessible focus trap (Tab stays within sheet).
- Escape key closes the sheet; focus returns to the card.

---

### ST-040 · Timeline shows messages, notes, stage changes, summaries 🌾

**Description:** Lead timeline is comprehensive.

**Preconditions:** ST-039 — lead has multiple chat messages, at least one stage change, and a conversation summary (requires cron to have run for summaries).

**Steps:**
1. Open the lead detail sheet.
2. Scroll the timeline.

**Expected result:**
- Messages from the chat conversation appear.
- Stage change events show old → new stage with timestamp.
- Conversation summary (if generated) shows as a distinct entry.
- Notes (if added) appear inline.

---

### ST-041 · Add note → appears in timeline 🌾

**Description:** Owner can add a note to a lead.

**Preconditions:** ST-039 — lead detail sheet open.

**Steps:**
1. Find the **Add Note** field in the sheet.
2. Type a note: "Customer mentioned competitor pricing concerns."
3. Click **Save Note**.

**Expected result:**
- Note appears immediately in the timeline (optimistic or after refetch).
- Note shows the current user's name and timestamp.

---

### ST-042 · Close reason dialog (won/lost) 🌾

**Description:** Closing a deal requires selecting won or lost + optional reason.

**Preconditions:** ST-039 — lead detail sheet open.

**Steps:**
1. Click **Close Deal** (or drag lead card to "Closed Won" / "Closed Lost" column).
2. Select **Won** or **Lost**.
3. Enter a reason (optional).
4. Confirm.

**Expected result:**
- Lead moves to the correct closed stage on kanban.
- A `deal_closed` event appears in the activity feed.
- Closed stage card is visually distinct (greyed out or tagged).

---

## Phase 7 — Follow-ups

### ST-043 · Warm/hot lead generates follow-up (CAM-115) 🌾

**Description:** A warm or hot lead automatically has a follow-up queued.

**Preconditions:** Lead exists with score >= warm threshold.

**Steps:**
1. Verify a lead with a warm/hot score exists.
2. Check `follow_ups` table or the cron logs.

**Expected result:**
- A `follow_up` record exists for the lead.
- Status is `queued` (not yet sent).

---

### ST-044 · Cron processes follow-up (CAM-007) 🌾

**Description:** The follow-up cron job sends the queued follow-up.

**Preconditions:** ST-043 complete. Cron job (`follow-up-processor`) has run.

**Steps:**
1. Check the `job_runs` table for a recent `follow-up-processor` entry.
2. Verify the follow-up record's status changed to `sent`.

**Expected result:**
- `job_runs` ledger shows a successful run with `status = 'completed'`.
- Follow-up record status is `sent`.
- The outbound message appears in the conversation timeline.

---

### ST-045 · No duplicate follow-ups (CAM-020) 🌾

**Description:** Unique index prevents double follow-ups for the same lead.

**Preconditions:** ST-044 complete.

**Steps:**
1. Trigger the follow-up cron again (or simulate a second queue attempt for the same lead).

**Expected result:**
- Second insertion is rejected by the unique index.
- No duplicate follow-up record exists.
- Cron completes without error (handles the unique constraint gracefully).

---

## Phase 8 — Support Workspace

### ST-046 · Tickets list renders 🌾

**Description:** Support workspace shows a list of open tickets (conversations).

**Preconditions:** At least one support conversation exists.

**Steps:**
1. Go to the support agent's workspace.
2. Scroll to the **Tickets** section.

**Expected result:**
- Table of tickets with customer, channel, status, and date columns.
- Rows are clickable (navigates to conversation detail).

---

### ST-047 · Resolve button → CSAT prompt (CAM-117) 🌾

**Description:** Clicking Resolve marks ticket as resolved and shows a CSAT rating.

**Preconditions:** ST-046 — open ticket visible.

**Steps:**
1. Click **Resolve** on an open ticket row.

**Expected result:**
- Ticket row turns grey (resolved state) with a star badge if rated.
- An inline 1–5 star CSAT prompt appears.
- Selecting a star rating stores the value (no page reload).

---

### ST-048 · Resolution stats populate (CAM-117) 🌾

**Description:** MetricsGrid at the top of the support workspace shows resolution stats.

**Preconditions:** At least one resolved ticket.

**Steps:**
1. Go to support workspace.
2. Observe the stats row at the top.

**Expected result:**
- "Resolved count", "Avg CSAT", "Resolution rate" metrics show non-zero values.
- Avg CSAT displays a decimal (e.g., 4.2/5).

---

### ST-049 · Knowledge gaps with inline ingest (CAM-118) 🌾

**Description:** Knowledge gaps section shows gap cards with actionable ingest.

**Preconditions:** ST-012/013 setup (gaps exist).

**Steps:**
1. Go to support workspace, scroll to **Knowledge Gaps**.
2. Verify "Asked N times" badge and sample question on a card.
3. Use **Add Answer** to submit an answer.

**Expected result:**
- Cards display correctly (not DataTable rows — Card feed layout).
- Add Answer flow works (ST-013 verification).
- Intents are de-duplicated (normalized lowercase, trimmed).

---

## Phase 9 — Marketing Workspace

### ST-050 · Interest stats populate (CAM-119) 🌾

**Description:** Marketing workspace metrics grid shows interest capture counts.

**Preconditions:** Marketing agent has had conversations where `capture_interest` module executed.

**Steps:**
1. Go to the marketing agent's workspace.
2. Observe the metrics grid at the top.

**Expected result:**
- "Interests Captured", "Top Categories", "Drafts Pending" metrics show.
- Non-zero values if the module has fired.

---

### ST-051 · Content drafts feed — approve (CAM-119) 🌾

**Description:** Draft content executions appear in the feed; owner can approve.

**Preconditions:** Marketing agent has executed `draft_content` at least once.

**Steps:**
1. Scroll to the **Content Drafts** section in the marketing workspace.
2. Observe draft cards (title, 80-char preview, date).
3. Click **Approve** on one draft.

**Expected result:**
- Draft disappears from the feed after approval (optimistic removal).
- Only unreviewed drafts appear (`output.draft_status` is null).

---

### ST-052 · Content drafts feed — edit (CAM-119) 🌾

**Description:** Owner can edit a draft before approving.

**Preconditions:** ST-051 setup — draft card visible.

**Steps:**
1. Click **Edit** on a draft card.
2. Modify the content in the editor.
3. Click **Save**.

**Expected result:**
- Updated content is persisted in `output` JSONB.
- Draft is marked `approved` with the edited content.
- Card disappears from the unreviewed feed.

---

### ST-053 · Content drafts feed — discard (CAM-119) 🌾

**Description:** Discarded drafts are removed from the feed.

**Preconditions:** ST-051 setup — draft card visible.

**Steps:**
1. Click **Discard** on a draft card.

**Expected result:**
- Card disappears immediately.
- `output.draft_status = 'discarded'` persisted.
- Draft does not re-appear on next poll.

---

## Phase 10 — Conversations Page

### ST-054 · Conversations list with summaries (CAM-116) 🌾

**Description:** Conversation list shows AI-generated summaries below customer names.

**Preconditions:** At least one conversation where the summarization cron has run.

**Steps:**
1. Go to `/dashboard/conversations`.

**Expected result:**
- Each row shows customer name + truncated summary (80 chars max, `…` if longer).
- Conversations without summaries show name only (no crash).

---

### ST-055 · Filter by status 🌾

**Description:** Status filter chips narrow the conversation list.

**Preconditions:** Conversations with `active`, `resolved`, and `escalated` status exist.

**Steps:**
1. Click **Active** filter.
2. Verify list shows only active conversations.
3. Click **Resolved**.
4. Click **All** to reset.

**Expected result:**
- List updates immediately per filter.
- Pagination resets to page 1 on filter change.
- Switching back to **All** shows all conversations.

---

### ST-056 · Filter by channel 🌾

**Description:** Channel filter shows only web_chat or whatsapp conversations.

**Preconditions:** Conversations from both channels exist.

**Steps:**
1. Click **Web Chat** filter.
2. Verify all rows show `web_chat` badge.
3. Click **WhatsApp**.
4. Reset to **All channels**.

**Expected result:**
- Correct channel filter applied; no cross-channel leakage.

---

### ST-057 · Filter by date range 🌾

**Description:** Date range filter (Last 7d / 30d) limits results.

**Preconditions:** Conversations older than 30 days exist in seed data.

**Steps:**
1. Click **Last 7d**.
2. Note the number of rows.
3. Click **Last 30d** — more rows should appear.
4. Click **All time**.

**Expected result:**
- Row count increases as date range widens.
- "All time" shows the full list.

---

### ST-058 · Search — by customer name 🌾

**Description:** Search input filters by customer name (ILIKE).

**Preconditions:** Conversations with known customer names exist.

**Steps:**
1. Type the first 3 letters of a customer name.
2. Wait 300ms (debounce).

**Expected result:**
- List narrows to conversations with that customer.
- Clearing the search restores the full list.

---

### ST-059 · Search — by message content 🌾

**Description:** Search matches message content (EXISTS subquery, no duplicate rows).

**Preconditions:** Conversations where a specific phrase appears in a message.

**Steps:**
1. Type a phrase that appears in a message (e.g., "leather bag").
2. Wait 300ms.

**Expected result:**
- Conversations containing that phrase appear.
- No duplicate rows for conversations with multiple matching messages (EXISTS subquery prevents duplication).

---

### ST-060 · Pagination stable with search active 🌾

**Description:** Load more works correctly while a search query is active.

**Preconditions:** More than 30 search results exist.

**Steps:**
1. Enter a common search term.
2. Click **Load More** button.

**Expected result:**
- Next page appends without duplicating existing rows.
- Cursor-based pagination uses correct `nextCursor`.

---

### ST-061 · Click-through from returning customers (CAM-131) 🌾

**Description:** Clicking a returning customer row in the sales workspace filters the conversation list.

**Preconditions:** ST-031 — returning customers table visible.

**Steps:**
1. Click a row in the **Returning Customers** table in the sales workspace.

**Expected result:**
- Browser navigates to `/dashboard/conversations?customerId=<uuid>`.
- Conversations list shows only that customer's conversations.

---

## Phase 11 — Dashboard Home

### ST-062 · Activity feed shows recent events (CAM-124) 🌾

**Description:** Activity feed on the dashboard home shows the last 10 cross-agent events.

**Preconditions:** Some leads, resolved conversations, and/or approvals exist.

**Steps:**
1. Go to `/dashboard`.
2. Scroll to **Activity Feed** card.

**Expected result:**
- Up to 10 events listed, most recent first.
- Each shows event type dot (teal for leads, gold for resolved, sunset for approvals, charcoal for closed deals), agent name, and timestamp.
- "No recent activity" placeholder if empty.

---

### ST-063 · Quick stats cards (CAM-124) 🌱

**Description:** Dashboard quick stats show today's conversations, unread notifications, pending approvals, active leads.

**Preconditions:** Fresh tenant acceptable (all zeros is valid).

**Steps:**
1. Go to `/dashboard`.
2. Observe **Quick Stats** card.

**Expected result:**
- 5 metrics: Today's Conversations, Week Conversations, Unread Notifications, Pending Approvals, Active Leads.
- All show integers ≥ 0 (no NaN, undefined, or blank).

---

### ST-064 · Agent list with status indicators 🌾

**Description:** "Your Agents" card shows active/inactive status per agent.

**Preconditions:** At least one active and one deactivated agent.

**Steps:**
1. Observe the **Your Agents** card on the dashboard.

**Expected result:**
- Active agents show a teal dot.
- Deactivated agents show a grey dot.
- Each agent name links to its workspace.
- Deactivated agents do NOT appear (filtered by `isActive = true`).

---

## Phase 12 — Settings

### ST-065 · Profile page — tagline, bio, avatar, social, QR 🌾

**Description:** Settings profile page allows editing all public-facing profile fields.

**Preconditions:** Agent exists.

**Steps:**
1. Go to **Settings → Profile**.
2. Update tagline, bio, avatar, and add a social link.
3. Save.
4. Navigate to `/chat/<slug>` to verify changes.

**Expected result:**
- Saves without error.
- `/chat/<slug>` reflects the updated tagline, bio, and avatar.
- QR code renders (download works).

---

### ST-066 · Module settings — autonomy + config overrides (CAM-102) 🌾

**Description:** Module autonomy levels and config can be changed per agent.

**Preconditions:** Agent exists with at least one module.

**Steps:**
1. In the agent workspace, expand **Module Settings**.
2. Change autonomy level of a module from **Auto** to **Ask**.
3. Save.

**Expected result:**
- Change persists after page reload.
- Module now creates approval cards instead of auto-executing.

---

### ST-067 · Billing page — plan display and upgrade flow 🌱

**Description:** Billing page shows current plan and an upgrade button.

**Preconditions:** Paddle sandbox configured.

**Steps:**
1. Go to **Settings → Billing**.
2. Observe plan name and limits.
3. Click **Upgrade**.

**Expected result:**
- Current plan label shows (Starter / Pro / Enterprise).
- Monthly limits are displayed.
- Clicking Upgrade opens the Paddle checkout overlay.

---

### ST-068 · Danger zone — deactivate agent (CAM-125) 🌾

**Description:** Deactivating an agent soft-deletes it.

**Preconditions:** At least two agents exist (keep one active as fallback).

**Steps:**
1. Go to the agent workspace for the secondary agent.
2. Scroll to **Danger Zone** in the Settings Panel.
3. Click **Deactivate Agent**.
4. Type the confirmation text in the dialog.
5. Confirm.

**Expected result:**
- Success toast.
- Agent disappears from the dashboard "Your Agents" list.
- Navigating directly to `/dashboard/agents/<id>` shows a 404/not-found error (agent inactive).
- Data is preserved (leads, conversations not deleted — only `isActive = false`).

---

### ST-069 · Export data download (CAM-125) 🌾

**Description:** Export Data button downloads a JSON blob of leads + conversations.

**Preconditions:** Agent with at least a few leads and conversations.

**Steps:**
1. Go to the agent workspace → Settings Panel.
2. Click **Export Data**.

**Expected result:**
- Browser initiates a file download named something like `camello-export-<id>.json`.
- File contains `leads`, `conversations`, and `notes` arrays.
- If records exceed 1000: a `truncated: true` flag or warning is present in the JSON.

---

## Phase 13 — Error Handling

### ST-070 · Error boundaries render retry cards (CAM-120) 🌾

**Description:** When the API is unavailable, each workspace section shows an inline error card — not a full-page crash.

**Preconditions:** Browser DevTools access to block network requests.

**Steps:**
1. Open the agent workspace.
2. In DevTools → Network, block the API host.
3. Reload the page.

**Expected result:**
- Each workspace section that fails to load shows an inline "Something went wrong" card with a **Retry** button.
- Other sections that loaded from cache still render.
- No full-page white screen.
- Clicking **Retry** attempts to refetch.

---

### ST-071 · Mutations show error toasts 🌾

**Description:** Failed mutations surface an error toast (not silent failure).

**Preconditions:** A reliable way to trigger a mutation failure (e.g., use an invalid payload or throttle the network).

**Steps:**
1. With a slow/broken network, attempt to approve a quote or add a note.

**Expected result:**
- Error toast appears within 3 seconds.
- Toast message is human-readable (not "Internal Server Error").
- Action can be retried.

---

### ST-072 · Polling retries with backoff 🌾

**Description:** Polling queries retry up to 2 times before giving up; they don't hammer a down backend.

**Preconditions:** API temporarily unavailable (simulated with DevTools).

**Steps:**
1. Open the workspace.
2. Block the API.
3. Watch the Network tab for refetch attempts.

**Expected result:**
- No more than 2 retry attempts per failed query (matching `retry: 2` config).
- Backoff between retries (exponential, not immediate successive calls).

---

## Phase 14 — i18n

### ST-073 · Dashboard locale switch to Spanish 🌱

**Description:** Switching to Spanish translates all dashboard UI text.

**Preconditions:** Spanish locale is accessible (locale switcher in settings or URL).

**Steps:**
1. Switch locale to `es` (e.g., via URL `/es/dashboard` or settings).
2. Navigate through: Dashboard home, Conversations, Agent Workspace.

**Expected result:**
- All headings, labels, buttons, and placeholders display in Spanish.
- No English "fallback" strings visible (unless intentionally untranslated, like proper nouns).
- Numbers and currencies format correctly for `es` locale.

---

### ST-074 · Chat page respects artifact language 🌾

**Description:** The public chat page renders in the correct language based on artifact locale settings.

**Preconditions:** Agent configured with a specific locale (e.g., `es`).

**Steps:**
1. Open `/chat/<slug>` for a Spanish-configured agent.

**Expected result:**
- Quick action chips are in Spanish.
- Agent responds in Spanish.
- Any system messages (e.g., rate limit warnings) are in Spanish.

---

### ST-075 · Relative timestamps localize 🌱

**Description:** "2 hours ago", "yesterday" etc. display in the active locale.

**Preconditions:** Some conversations/notifications with timestamps.

**Steps:**
1. Switch to Spanish locale.
2. Check conversation list timestamps and notification panel timestamps.

**Expected result:**
- Timestamps render in Spanish (e.g., "hace 2 horas", "ayer").
- No raw ISO date strings visible.

---

## Phase 15 — Widget Embed

### ST-076 · Widget loads from snippet 🌱

**Description:** The embed snippet loads the widget in an external HTML page.

**Preconditions:** Widget CDN URL or local build available. An artifact ID/slug to embed.

**Steps:**
1. Copy the embed snippet from Settings (or construct manually):
   ```html
   <script src="https://<widget-cdn>/widget.iife.js"
     data-artifact-id="<artifact-id>"></script>
   ```
2. Create a minimal HTML file:
   ```html
   <!DOCTYPE html>
   <html><body><h1>Test Page</h1></body></html>
   ```
3. Paste the snippet before `</body>`.
4. Open the HTML file in a browser (or serve locally with `python3 -m http.server`).

**Expected result:**
- Widget bubble appears in the bottom-right corner.
- No JS errors in the console from the host page's CSS cascade.
- Widget styles are self-contained (no leakage to/from the host page).

---

### ST-077 · Widget chat works end-to-end 🌾

**Description:** Full chat round-trip via the embedded widget.

**Preconditions:** ST-076 — widget loaded on external page.

**Steps:**
1. Click the widget bubble to open.
2. Type "Hello" → send.
3. Wait for agent response.
4. Verify typing indicator appears while waiting (CAM-127).
5. Verify message status icons show (✓ → ✓✓).

**Expected result:**
- Chat opens and closes smoothly.
- Agent responds through the widget (same API as `/chat/[slug]`).
- Typing indicator (animated dots) shows during response.
- Double-check (✓✓) appears on user message after delivery.
- No CORS errors in the console.

---

### ST-078 · Widget style isolation (CAM-127) 🌾

**Description:** Widget CSS does not bleed into or inherit from the host page.

**Preconditions:** Host page has custom CSS (e.g., `* { font-size: 30px; color: red; }`).

**Steps:**
1. Add aggressive CSS to the test HTML page: `<style>* { font-size: 30px !important; color: red !important; }</style>`.
2. Open the page with the widget.

**Expected result:**
- Widget text is NOT affected by the host's CSS.
- Widget renders with its own fonts and colors (injected via `injectStyles` utility).

---

## Appendix A — Seed Data Guide

Some tests require pre-existing records. The following seed scenarios cover all `🌾` tests:

| Scenario | Records needed |
|---|---|
| **Lead with score** | 1 qualifying conversation with name + budget + interest |
| **Stale leads** | 1 lead with `updated_at` > 7 days ago |
| **Multi-week data** | Conversations in the previous Mon–Sun UTC window |
| **Resolved tickets** | 2+ support conversations with `status = resolved` |
| **Content drafts** | 1+ `module_executions` with `module_slug = 'draft_content'` and `status = 'executed'` |
| **Knowledge gaps** | 1+ conversations with low-confidence responses |
| **Returning customers** | 1 customer with 2+ conversations |
| **Multi-channel** | Conversations from both `web_chat` and `whatsapp` |
| **Old conversations** | 1 conversation with `created_at` > 30 days ago |

---

## Appendix B — Test Execution Checklist

Use this to track pass/fail during the walkthrough:

| ID | Phase | Pass? | Notes |
|---|---|---|---|
| ST-001 | Sign-up & Onboarding | | |
| ST-002 | Sign-up & Onboarding | | |
| ST-003 | Sign-up & Onboarding | | |
| ST-004 | Sign-up & Onboarding | | |
| ST-005 | Sign-up & Onboarding | | |
| ST-006 | Sign-up & Onboarding | | |
| ST-007 | Sign-up & Onboarding | | |
| ST-008 | Sign-up & Onboarding | | |
| ST-009 | Sign-up & Onboarding | | |
| ST-010 | Knowledge Base | | |
| ST-011 | Knowledge Base | | |
| ST-012 | Knowledge Base | | |
| ST-013 | Knowledge Base | | |
| ST-014 | Public Chat | | |
| ST-015 | Public Chat | | |
| ST-016 | Public Chat | | |
| ST-017 | Public Chat | | |
| ST-018 | Public Chat | | |
| ST-019 | Public Chat | | |
| ST-020 | Public Chat | | |
| ST-021 | Public Chat | | |
| ST-022 | Public Chat | | |
| ST-023 | Sales Workspace | | |
| ST-024 | Sales Workspace | | |
| ST-025 | Sales Workspace | | |
| ST-026 | Sales Workspace | | |
| ST-027 | Sales Workspace | | |
| ST-028 | Sales Workspace | | |
| ST-029 | Sales Workspace | | |
| ST-030 | Sales Workspace | | |
| ST-031 | Sales Workspace | | |
| ST-032 | Approvals & Notifications | | |
| ST-033 | Approvals & Notifications | | |
| ST-034 | Approvals & Notifications | | |
| ST-035 | Approvals & Notifications | | |
| ST-036 | Approvals & Notifications | | |
| ST-037 | Approvals & Notifications | | |
| ST-038 | Approvals & Notifications | | |
| ST-039 | Lead Detail | | |
| ST-040 | Lead Detail | | |
| ST-041 | Lead Detail | | |
| ST-042 | Lead Detail | | |
| ST-043 | Follow-ups | | |
| ST-044 | Follow-ups | | |
| ST-045 | Follow-ups | | |
| ST-046 | Support Workspace | | |
| ST-047 | Support Workspace | | |
| ST-048 | Support Workspace | | |
| ST-049 | Support Workspace | | |
| ST-050 | Marketing Workspace | | |
| ST-051 | Marketing Workspace | | |
| ST-052 | Marketing Workspace | | |
| ST-053 | Marketing Workspace | | |
| ST-054 | Conversations Page | | |
| ST-055 | Conversations Page | | |
| ST-056 | Conversations Page | | |
| ST-057 | Conversations Page | | |
| ST-058 | Conversations Page | | |
| ST-059 | Conversations Page | | |
| ST-060 | Conversations Page | | |
| ST-061 | Conversations Page | | |
| ST-062 | Dashboard Home | | |
| ST-063 | Dashboard Home | | |
| ST-064 | Dashboard Home | | |
| ST-065 | Settings | | |
| ST-066 | Settings | | |
| ST-067 | Settings | | |
| ST-068 | Settings | | |
| ST-069 | Settings | | |
| ST-070 | Error Handling | | |
| ST-071 | Error Handling | | |
| ST-072 | Error Handling | | |
| ST-073 | i18n | | |
| ST-074 | i18n | | |
| ST-075 | i18n | | |
| ST-076 | Widget Embed | | |
| ST-077 | Widget Embed | | |
| ST-078 | Widget Embed | | |

**Total: 78 test cases** (20 empty-state 🌱, 58 require seed data 🌾)
