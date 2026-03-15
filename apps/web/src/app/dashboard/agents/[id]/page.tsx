import { redirect } from 'next/navigation';

// Redirect all /dashboard/agents/[id] URLs to the unified agent page.
// MVP has exactly one sales agent — the single-page view handles it.
export default function AgentConfigPage() {
  redirect('/dashboard/agent');
}
