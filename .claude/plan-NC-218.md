# Plan: NC-218 — Accessibility Audit on Inbox

## Task Summary
Full keyboard navigation, screen-reader semantics, focus management, heading hierarchy, and 36px touch targets across all 4 inbox components.

## Acceptance Criteria → Plan Item Mapping

| AC | Plan item |
|----|-----------|
| Conversation list: arrow keys to navigate, Enter to select | Roving-tabindex listbox pattern on `conversation-list.tsx` |
| Chat thread: `role="log"` + `aria-live="polite"` | Add ARIA attributes to scroll container in `chat-thread.tsx` |
| Owner reply: proper `<label>` on textarea | `<label htmlFor>` + `id` on textarea in `chat-thread.tsx` |
| Right panel sections: proper heading hierarchy (h3) | `<h3>` wrapper in `CollapsibleSection` in `customer-panel.tsx` |
| Focus management: selecting a conversation moves focus to chat thread header | `useRef` + `useEffect` in `ChatThreadInner` |
| Touch targets >= 36px | Fix `size="sm"` buttons + `h-8` inputs |
| `pnpm type-check` passes | TypeScript-safe changes only |

---

## File-by-File Changes

### 1. `apps/web/src/components/inbox/conversation-list.tsx`

**Keyboard navigation (roving tabindex listbox):**
- Add `focusedIdx` state, initialized to the index of `selectedId` in `items` (or 0 if none selected)
- Add a `useEffect` that updates `focusedIdx` when `items` or `selectedId` changes
- Wrap the conversation buttons container in:
  ```tsx
  <div role="listbox" aria-label={t('conversationListLabel')} className="...">
  ```
- On each conversation `<button>`:
  - Add `role="option"`
  - Add `aria-selected={c.id === selectedId}`
  - Add `tabIndex={i === focusedIdx ? 0 : -1}`
  - Add `onFocus={() => setFocusedIdx(i)}`
  - Add `onKeyDown` handler (see below)
- `handleItemKeyDown(e, idx)` — attached to each option button:
  - `ArrowDown` → `e.preventDefault()`, focus next option via `e.currentTarget.closest('[role="listbox"]')?.querySelectorAll('[role="option"]')[idx+1]?.focus()`
  - `ArrowUp` → focus previous option
  - `Home` → focus first option
  - `End` → focus last option
  - Enter/Space are already handled natively by `<button>` → calls `onClick`

**Touch targets:**
- Search input: change `h-8` → `h-9` (36px)
- Filter buttons: add `className="min-h-[36px]"` to each `<Button size="sm">`
- Load more button: add `className="min-h-[36px]"` to `<Button size="sm">`

**New i18n key:** `conversationListLabel`

---

### 2. `apps/web/src/components/inbox/chat-thread.tsx`

**Message log semantics:**
- Add to the scroll container div:
  - `role="log"`
  - `aria-live="polite"`
  - `aria-relevant="additions"`
  - `aria-label={t('chatLogLabel')}`

**Focus management (conversation selection → header focus):**
- Add `const headerRef = useRef<HTMLDivElement>(null)` in `ChatThreadInner`
- Add `tabIndex={-1}` and `ref={headerRef}` to the header `<div>` (the one with `border-b border-charcoal/8`)
- Add effect: `useEffect(() => { headerRef.current?.focus(); }, [conversationId])`
  - This runs on mount AND whenever a new conversation is selected

**Owner reply label:**
- Before the `<textarea>`, add:
  ```tsx
  <label htmlFor="owner-reply-input" className="sr-only">
    {t('ownerReplyLabel')}
  </label>
  ```
- Add `id="owner-reply-input"` to the owner reply `<textarea>`

**Touch targets:**
- Status change buttons: add `className="min-h-[36px]"` to each `<Button size="sm">`
- Owner reply send button: add `className="min-h-[36px]"` to `<Button size="sm">`

**New i18n keys:** `chatLogLabel`, `ownerReplyLabel`

---

### 3. `apps/web/src/components/inbox/customer-panel.tsx`

**Heading hierarchy in `CollapsibleSection`:**
- Add `id: string` to `CollapsibleSection` props interface
- Wrap the `<button>` in `<h3 className="m-0">` — this is the ARIA APG accordion pattern; heading wraps button
- Add `aria-expanded={open}` to the toggle button
- Add `aria-controls={`section-${id}`}` to the toggle button
- Add `aria-hidden="true"` to `ChevronDown` icon
- Change `{open && <div className="px-4 pb-4">...}` to always-rendered `<div id={`section-${id}`} hidden={!open} className="px-4 pb-4">` — keeps DOM target for `aria-controls`

**Update usages** to pass `id` prop:
- `<CollapsibleSection id="info" title={t('customerInfoSection')} ...>`
- `<CollapsibleSection id="timeline" title={t('activitySection')} ...>`
- `<CollapsibleSection id="notes" title={t('notesSection')} ...>`

**Notes textarea label:**
- Before the notes `<textarea>`, add:
  ```tsx
  <label htmlFor="note-textarea" className="sr-only">
    {t('notesPlaceholder')}
  </label>
  ```
- Add `id="note-textarea"` to the notes `<textarea>`

**Touch targets:**
- Add note button: add `className="min-h-[36px]"` to `<Button size="sm">`

---

### 4. `apps/web/messages/en.json` (inbox section)

Add 3 keys under the existing `inbox` object:
```json
"conversationListLabel": "Conversations",
"chatLogLabel": "Conversation messages",
"ownerReplyLabel": "Reply message"
```

### 5. `apps/web/messages/es.json` (inbox section)

Add same 3 keys in Spanish:
```json
"conversationListLabel": "Conversaciones",
"chatLogLabel": "Mensajes de conversación",
"ownerReplyLabel": "Mensaje de respuesta"
```

---

## TypeScript Notes

- `hidden` prop on a `<div>` is a valid `HTMLAttributes<HTMLDivElement>` attribute — no type errors
- `role="listbox"`, `role="option"`, `role="log"` are all valid ARIA roles in `HTMLAttributes`
- `aria-selected`, `aria-expanded`, `aria-controls`, `aria-live`, `aria-relevant` are all standard attributes
- `tabIndex` on button elements is `number` — no issues
- `useRef<HTMLDivElement>(null)` typing is standard

---

## Test Plan

**Type-check:** `pnpm type-check` — all new props/attributes are typed correctly

**Manual a11y verification (keyboard):**
- Tab into conversation list → first/selected item receives focus
- ArrowDown/ArrowUp navigate between items
- Enter selects a conversation and focus moves to chat thread header
- Tab into right panel → CollapsibleSection buttons respond to Enter/Space toggle
- Tab into owner reply textarea (escalated only) → label announced by SR

**Touch target verification:**
- All interactive elements visually >= 36px height
- Search input `h-9` (36px)
- Filter buttons `min-h-[36px]`
- Send/add note buttons `min-h-[36px]`

---

## Commit

Message format: `feat(NC-218): a11y audit on inbox — keyboard nav, ARIA roles, focus management`

After commit:
1. Mark NC-218 `[x]` in TASK_QUEUE.md with summary
2. Add row to PROGRESS.md Done table
