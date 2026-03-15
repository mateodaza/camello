# NC-282 Mini-Plan — Sprint Audit: Test Sweep + i18n Cleanup + Smoke Test

**Task ID:** NC-282
**Branch:** nightcrawler/dev
**Dependencies:** NC-275 ✅, NC-276 ✅, NC-277 ✅, NC-278 ✅, NC-279 ✅, NC-280 ✅, NC-281 ✅

---

## Audit Findings

### 1. Existing tests — status
All 29 web test files have already been updated during NC-275–NC-281. Imports and page paths are correct:
- `artifacts-hero/advisor/disabled.test.tsx` — import `@/app/dashboard/artifacts/page` (redirect stub) ✅
- `agent-page.test.tsx` — 8 tests for single-page `/dashboard/agent` ✅
- `settings-page.test.tsx` — 3 tests for merged settings (profile redirect in test 3) ✅
- `analytics-page.test.tsx` — tests `/dashboard/analytics` redirect + `/dashboard/docs` 404 ✅
- `section.test.tsx` — 2 tests for NC-281 Section primitive ✅
- `i18n-orphans.test.ts` — 23+ assertions for NC-275–NC-280 cleanups ✅
- `knowledge-page.test.tsx` — 9 tests for NC-279 knowledge page ✅
- `agent-config-page.test.tsx` — 1 test for `/dashboard/agents/[id]` redirect ✅

**MISSING (2 redirect tests):**
- `/dashboard/settings/billing` → `/dashboard/settings` — not covered
- `/dashboard/settings/channels` → `/dashboard/settings` — not covered

### 2. i18n orphan sweep
**Grep audit results** — keys in `en.json`/`es.json` sidebar namespace NOT referenced in any source file:

| Key | Status | Evidence |
|-----|--------|----------|
| `sidebar.billing` | **ORPHANED** | No `t('billing')` call in `sidebar.tsx` or `layout.tsx`; no billing nav item in `navItems` array |
| `sidebar.profile` | **ORPHANED** | No `t('profile')` call in `sidebar.tsx` or `layout.tsx`; no profile nav item |
| `sidebar.home` | **ORPHANED** | No `t('home')` call anywhere in source; no Home nav item |
| `sidebar.analytics` | already removed in NC-280 ✅ |
| `sidebar.help` | already removed in NC-280 ✅ |

Keys currently in `sidebar` namespace and actively used: `inbox`, `agent`, `knowledge`, `settings`, `collapse`, `expand`, `openMenu`.

Note: `profile` and `billing` also exist as **top-level namespaces** (`en.json` lines 26–27, 639+, 832+) and ARE actively used by `settings/page.tsx` (`useTranslations('profile')`, `useTranslations('billing')`). Only the `sidebar.*` sub-keys are orphaned.

### 3. Redirect completeness
All redirect stubs are in place:
- `apps/web/src/app/dashboard/analytics/page.tsx` → `redirect('/dashboard/agent')` ✅
- `apps/web/src/app/dashboard/artifacts/page.tsx` → `redirect('/dashboard/agent')` ✅
- `apps/web/src/app/dashboard/docs/page.tsx` → `notFound()` ✅
- `apps/web/src/app/dashboard/agents/[id]/page.tsx` → `redirect('/dashboard/agent')` ✅
- `apps/web/src/app/dashboard/settings/profile/page.tsx` → `redirect('/dashboard/settings')` ✅
- `apps/web/src/app/dashboard/settings/billing/page.tsx` → `redirect('/dashboard/settings')` ✅
- `apps/web/src/app/dashboard/settings/channels/page.tsx` → `redirect('/dashboard/settings')` ✅

---

## Implementation Plan

### Step 1 — Remove orphaned i18n keys from en.json + es.json

**File:** `apps/web/messages/en.json`
Remove from `"sidebar"` object:
- `"billing": "Billing"`
- `"profile": "Profile"`
- `"home": "Home"`

**File:** `apps/web/messages/es.json`
Remove matching keys from `"sidebar"` object (same three keys).

### Step 2 — Extend i18n-orphans.test.ts with NC-282 assertions

**File:** `apps/web/src/__tests__/i18n-orphans.test.ts`

Add a new `describe` block after the existing NC-280 group:

```typescript
describe("i18n orphan guard — NC-282 sidebar sub-keys removed", () => {
  for (const locale of ["en", "es"]) {
    const parsed = parseJson(join(messagesDir, `${locale}.json`));

    describe(`${locale}.json — NC-282 orphaned sidebar sub-keys absent`, () => {
      const sidebar = (parsed as Record<string, Record<string, unknown>>).sidebar;

      it("sidebar.billing key is absent", () => {
        expect(sidebar.billing).toBeUndefined();
      });
      it("sidebar.profile key is absent", () => {
        expect(sidebar.profile).toBeUndefined();
      });
      it("sidebar.home key is absent", () => {
        expect(sidebar.home).toBeUndefined();
      });
    });
  }
});
```

This adds **6 new assertions** (3 keys × 2 locales).

### Step 3 — Add 2 new redirect tests to settings-page.test.tsx

**File:** `apps/web/src/__tests__/settings-page.test.tsx`

The existing mock setup already covers `redirect` via `vi.mock('next/navigation', ...)`. The `redirect` mock is imported in the existing test 3 pattern using dynamic import:

```typescript
it('4 — old /dashboard/settings/billing redirects to /dashboard/settings', async () => {
  const { redirect } = await import('next/navigation');
  const { default: BillingPage } = await import(
    '../app/dashboard/settings/billing/page'
  );
  BillingPage();
  expect(redirect).toHaveBeenCalledWith('/dashboard/settings');
});

it('5 — old /dashboard/settings/channels redirects to /dashboard/settings', async () => {
  const { redirect } = await import('next/navigation');
  const { default: ChannelsPage } = await import(
    '../app/dashboard/settings/channels/page'
  );
  ChannelsPage();
  expect(redirect).toHaveBeenCalledWith('/dashboard/settings');
});
```

These follow the exact same pattern as existing test 3 in `settings-page.test.tsx`.

### Step 4 — Run pnpm type-check

```bash
pnpm type-check
```

No source file changes → type-check cannot regress from these edits (JSON deletions + test file additions only).

### Step 5 — Update tracking files

**TASK_QUEUE.md:** Mark `NC-282 [x]`, add one-line summary.
**PROGRESS.md:** Add row: NC-282 | Sprint audit | Mar 15 | Removed sidebar.billing/profile/home from en+es.json; added 8 new tests (2 redirect + 6 i18n assertions); all tests pass; type-check clean.

---

## Acceptance Criteria Mapping

| Criterion | How Met |
|-----------|---------|
| `pnpm type-check` passes | No new source types introduced; JSON-only changes |
| All existing tests pass | No imports changed; all tests already use correct paths |
| No orphaned i18n keys | Remove `sidebar.billing/profile/home`; 6 new assertions guard against re-introduction |
| `/dashboard` → inbox | Verified by existing NC-275 tests |
| Sidebar 4 items | Verified by sidebar.tsx `navItems` array (Inbox/Agent/Knowledge/Settings) |
| `/dashboard/agent` → collapsible sections | Verified by `agent-page.test.tsx` test 7 (7 sections present) |
| Edit greeting/save/test chat | Manual smoke test — not automated |
| Approve pending execution | Covered by `agent-page.test.tsx` test 3 (auto-expand approvals) |
| Knowledge page + modal | Covered by `knowledge-page.test.tsx` (9 tests) |
| Knowledge gaps teachable | Covered by `knowledge-page.test.tsx` test "Teach button expands..." |
| Settings → 3 sections | Covered by `settings-page.test.tsx` test 1 |
| Old URL redirects | `analytics-page`, `artifacts-*`, `agent-config-page`, settings sub-page tests |
| Mobile responsive | Manual smoke test — not automated |
| At least 2 new tests | Tests 4+5 in `settings-page.test.tsx` (billing + channels redirects) |

---

## File Change Summary

| File | Change | Lines |
|------|--------|-------|
| `apps/web/messages/en.json` | Remove 3 keys from `sidebar` object | -3 |
| `apps/web/messages/es.json` | Remove 3 keys from `sidebar` object | -3 |
| `apps/web/src/__tests__/i18n-orphans.test.ts` | Add NC-282 describe block (6 new it-assertions) | +25 |
| `apps/web/src/__tests__/settings-page.test.tsx` | Add tests 4+5 (billing + channels redirects) | +20 |

Total new test cases: **8** (2 redirect + 6 i18n assertions)
