import { redirect } from 'next/navigation';

// Permanent redirect to the canonical agents page.
export default function AgentPageRedirect() {
  redirect('/dashboard/agents');
}
