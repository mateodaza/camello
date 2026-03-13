# Plan: NC-267 — Onboarding Polish: Skip/Resume + Mobile + i18n

## Pre-read findings

### Existing state
- `ChatOnboarding.tsx` (547 lines): Full chat onboarding. Already has `skipForNow`/`whatsAppSkip` buttons that skip **within** the flow (to `ask_channel` / `done` stage). Does NOT have an escape-to-dashboard "finish later" flow.
- `ChatBubble.tsx`: Already has `max-w-[85%]` on bubble content. No animation. Avatar always visible.
- `dashboard/page.tsx`: Has `KnowledgeBanner` (knowledge score). Does NOT have onboarding resume nudge.
- `onboardingChat` i18n namespace: 35 keys in en+es. Already has `skipForNow`/`whatsAppSkip`. Missing `finishLater`.
- `dashboard` i18n namespace: Missing `resumeSetupBanner` + `resumeSetupCta`.
- `globals.css`: Tailwind v4 `@theme` block with color tokens. No custom animation keyframes yet.
- `knowledge-nudge.test.tsx`: Explicit trpc mock—adding `onboarding.getStatus` to dashboard will break it without a mock update.
- `chat-onboarding.test.tsx`: Router mock uses inline `vi.fn()` per call—cannot inspect `push` from outside. Must hoist router spies.

---

## Files to modify

1. `apps/web/src/app/globals.css`
2. `apps/web/src/app/onboarding/components/ChatBubble.tsx`
3. `apps/web/src/app/onboarding/components/ChatOnboarding.tsx`
4. `apps/web/src/app/dashboard/page.tsx`
5. `apps/web/messages/en.json`
6. `apps/web/messages/es.json`
7. `apps/web/src/__tests__/chat-onboarding.test.tsx`
8. `apps/web/src/__tests__/knowledge-nudge.test.tsx`

---

## Step-by-step plan

### Step 1 — `globals.css`: add fade-in keyframe

Inside `@theme` block, append:
```css
--animate-fade-in: fade-in 300ms ease-in both;
```

After the `@theme` block, append:
```css
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

This makes `animate-fade-in` a valid Tailwind v4 utility class.

---

### Step 2 — `ChatBubble.tsx`: animation + avatar visibility

Two changes:
1. Add `animate-fade-in` to the outer `<div className="flex items-start gap-2">` → `"flex items-start gap-2 animate-fade-in"`.
2. Avatar div: change `flex h-7 w-7 shrink-0 ...` → `hidden min-[360px]:flex h-7 w-7 shrink-0 ...` (hidden below 360px, shown at ≥360px).

User replies are NOT rendered via `ChatBubble`, so they receive no animation automatically.

---

### Step 3 — `ChatOnboarding.tsx`: finish-later escape + sticky inputs

#### 3a. Add `stageToStep` helper (near the existing `stepToStage`):
```typescript
function stageToStep(stage: Stage): number {
  switch (stage) {
    case 'ask_description':     return 1;
    case 'generating_agent':    return 2;
    case 'confirm_agent':       return 3;
    case 'collecting_knowledge':return 4;
    case 'ask_channel':         return 5;
    default:                    return 0;
  }
}
```

#### 3b. Add `handleFinishLater` inside the component, below `handleWebchatDone`:
```typescript
const handleFinishLater = () => {
  const step = stageToStep(stage);
  if (step > 0) saveStep.mutate({ step });
  router.push('/dashboard');
};
```

#### 3c. Add finish-later button in each stage's input section

The button appears **below** the primary action button(s) in stages `ask_description`, `confirm_agent`, `collecting_knowledge`, `ask_channel` (all sub-states). It is a plain text link styled as a subtle affordance:

```tsx
<button
  type="button"
  onClick={handleFinishLater}
  className="text-xs text-dune hover:text-charcoal underline-offset-2 hover:underline mt-1 block"
>
  {t('finishLater')}
</button>
```

Placement:
- `ask_description`: inside the `<div className="space-y-2">`, below the `<Button>` (submit)
- `confirm_agent`: inside the `<div className="space-y-2">`, below the flex gap-2 buttons div
- `collecting_knowledge`: inside the buttons `<div className="flex gap-2">` section, add as a third element after "Skip for now"
- `ask_channel` (no choice): below the existing `<Button variant="ghost">` skipForNow
- `ask_channel` + webchat: in the `<div className="flex gap-2">` section, after Continue button
- `ask_channel` + whatsapp: in the `<div className="flex gap-2">` at the bottom of the form, after the whatsAppSkip button

#### 3d. Sticky input wrappers

Wrap the input section div in each stage with `sticky bottom-0 bg-sand py-2`. This pins the active input to the bottom on mobile when content overflows.

Specifically:
- `ask_description`: wrap `<div className="space-y-2">` → `<div className="sticky bottom-0 bg-sand py-2 space-y-2">`
- `confirm_agent`: wrap `<div className="space-y-2">` (contains name input + buttons) → add `sticky bottom-0 bg-sand py-2`
- `collecting_knowledge`: wrap the final `<div className="space-y-2">` that contains the website input + action buttons → add `sticky bottom-0 bg-sand py-2`
- `ask_channel` (no choice): wrap the `<div className="grid gap-3 sm:grid-cols-2">` + skip button in a sticky wrapper div
- `ask_channel` + webchat: wrap the `<div className="flex gap-2">` button row → add sticky
- `ask_channel` + whatsapp: the outer `<div className="space-y-4">` gets `sticky bottom-0 bg-sand` — but the entire WhatsApp form is long, so only the submit buttons `<div className="flex gap-2">` at the bottom gets sticky

---

### Step 4 — `dashboard/page.tsx`: resume nudge

#### 4a. Add query after `sufficiencyScore`:
```typescript
const onboardingStatus = trpc.onboarding.getStatus.useQuery(undefined, {
  enabled: !!organization,
  retry: false,
});
```

#### 4b. Compute show condition after `showKnowledgeBanner`:
```typescript
const showResumeBanner =
  !onboardingStatus.isLoading &&
  onboardingStatus.data !== undefined &&
  !(onboardingStatus.data.settings as Record<string, unknown>)?.onboardingComplete;
```

#### 4c. Add banner JSX inside `DashboardOverview` return, between the title section and `ShareLinkCard`:
```tsx
{showResumeBanner && <OnboardingResumeBanner t={t} />}
```

#### 4d. New `OnboardingResumeBanner` sub-component at bottom of file:
```typescript
function OnboardingResumeBanner({
  t,
}: {
  t: ReturnType<typeof useTranslations<'dashboard'>>;
}) {
  return (
    <div
      data-testid="onboarding-resume-banner"
      className="flex items-center justify-between gap-4 rounded-lg border border-teal/20 bg-teal/5 px-4 py-3"
    >
      <p className="text-sm text-charcoal">{t('resumeSetupBanner')}</p>
      <Link
        href="/onboarding"
        className="shrink-0 text-sm font-medium text-teal hover:underline"
      >
        {t('resumeSetupCta')} →
      </Link>
    </div>
  );
}
```

---

### Step 5 — i18n: `en.json`

**In `onboardingChat` object**, add (after `finishing`):
```json
"finishLater": "I'll finish this later"
```

**In `dashboard` object**, add (after existing keys):
```json
"resumeSetupBanner": "Finish setting up your agent",
"resumeSetupCta": "Continue setup"
```

---

### Step 6 — i18n: `es.json`

Same structure:

**In `onboardingChat`**:
```json
"finishLater": "Terminaré esto más tarde"
```

**In `dashboard`**:
```json
"resumeSetupBanner": "Termina de configurar tu agente",
"resumeSetupCta": "Continuar configuración"
```

---

### Step 7 — `chat-onboarding.test.tsx`: router spies + Test 7

#### 7a. Hoist router push/replace mocks (replace current anonymous inline fns):
```typescript
const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
```

#### 7b. Add `mockPush.mockReset(); mockReplace.mockReset();` to `beforeEach`.

#### 7c. **Test 7**: Skip saves step and redirects to /dashboard
```typescript
it('finishLater at ask_description saves step 1 and pushes /dashboard', () => {
  renderChat({ _testStage: 'ask_description' });
  fireEvent.click(screen.getByText('finishLater'));
  const spy = mutateSpies.get('onboarding.saveStep');
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ step: 1 }));
  expect(mockPush).toHaveBeenCalledWith('/dashboard');
});
```

---

### Step 8 — `knowledge-nudge.test.tsx`: add onboarding mock + Tests 6 & 7

#### 8a. Add `mockGetStatus` to `vi.hoisted()` block:
```typescript
const { ..., mockGetStatus } = vi.hoisted(() => ({
  ...,
  mockGetStatus: vi.fn(),
}));
```

#### 8b. Add to `vi.mock('@/lib/trpc', ...)` factory:
```typescript
onboarding: {
  getStatus: { useQuery: mockGetStatus },
},
```

#### 8c. Set default in `beforeEach` (onboarding complete → banner hidden by default, so existing tests pass unchanged):
```typescript
mockGetStatus.mockReturnValue({
  data: { settings: { onboardingComplete: true }, tenantName: 'Test Co', previewCustomerId: null },
  isLoading: false,
});
```

#### 8d. **Test 6**: Resume nudge shown when onboarding incomplete
```typescript
it('6 — onboarding resume banner shown when onboardingComplete is false', () => {
  mockGetStatus.mockReturnValue({
    data: { settings: { onboardingComplete: false }, tenantName: 'Test Co', previewCustomerId: null },
    isLoading: false,
  });
  render(React.createElement(DashboardOverview));
  expect(screen.getByTestId('onboarding-resume-banner')).toBeInTheDocument();
});
```

#### 8e. **Test 7**: Resume nudge hidden when onboarding complete
```typescript
it('7 — onboarding resume banner hidden when onboardingComplete is true', () => {
  render(React.createElement(DashboardOverview));
  expect(screen.queryByTestId('onboarding-resume-banner')).not.toBeInTheDocument();
});
```

---

## Acceptance criteria coverage

| AC | Satisfied by |
|---|---|
| "I'll finish this later" on ask_description onward | Step 3c: button in all input stages |
| Saves current step via `saveStep` | Step 3b: `handleFinishLater` calls `saveStep.mutate({ step: stageToStep(stage) })` |
| Redirects to `/dashboard` | Step 3b: `router.push('/dashboard')` |
| Resume banner when `onboardingComplete !== true` | Step 4: `showResumeBanner` logic + `OnboardingResumeBanner` |
| Banner text + link to `/onboarding` | Step 4d: `href="/onboarding"` |
| Banner hidden after complete | `showResumeBanner` false when `onboardingComplete: true` |
| Bubbles max-w 85% on mobile | Already done (`max-w-[85%]` in ChatBubble). No change needed. |
| Input sticky bottom-0 | Step 3d |
| Bot avatar hidden < 360px | Step 2 |
| Bot message fade-in 300ms | Steps 1 + 2 |
| User reply no animation | User replies not via ChatBubble → no change needed |
| `finishLater` i18n key en+es | Steps 5 + 6 |
| `resumeSetupBanner` / `resumeSetupCta` en+es | Steps 5 + 6 |
| All existing onboardingChat keys already in en+es | Verified: 35 keys present and matching |
| Test: skip saves step + redirects | Test 7 in chat-onboarding.test.tsx |
| Test: resume nudge when incomplete | Test 6 in knowledge-nudge.test.tsx |
| Test: resume nudge when complete (bonus) | Test 7 in knowledge-nudge.test.tsx |
| `pnpm type-check` passes | All new code fully typed; `settings as Record<string, unknown>` pattern matches dashboard.page.tsx existing patterns |

## Notes / Edge cases

- `handleFinishLater` guard: `if (step > 0)` prevents calling `saveStep` on `creating_org`/`provisioning`/`done` stages (step 0).
- `onboardingStatus` enabled only when `organization` is truthy — avoids spurious calls before Clerk loads.
- The `showResumeBanner` cast `(settings as Record<string, unknown>)?.onboardingComplete` matches the same pattern used in `ChatOnboarding.tsx` line 139.
- Dashboard's explicit trpc mock in `knowledge-nudge.test.tsx` must include `onboarding.getStatus` or `DashboardOverview` tests crash. Default mock returns complete=true so all 5 existing tests pass unchanged.
- The router mock change in `chat-onboarding.test.tsx` (hoisting push/replace) is backwards-compatible: existing tests that don't inspect `push` still pass; Test 7 uses the new `mockPush` spy.
