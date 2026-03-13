'use client';

import { ChatOnboarding } from './components/ChatOnboarding';

// Re-exported for backward-compat with Step1–Step5 files (kept as reference, not rendered)
export type { Suggestion } from './components/ChatOnboarding';

export default function OnboardingPage() {
  return <ChatOnboarding />;
}
