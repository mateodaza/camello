'use client';

import { redirect, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AdvisorPanel } from '@/components/dashboard/advisor-panel';

// Standalone advisor page — NC-293 will replace this with the full advisor workspace.
function AdvisorPageContent() {
  const t = useTranslations('agents');
  return (
    <div className="p-6 flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-semibold text-charcoal">{t('advisorCard')}</h1>
      <AdvisorPanel />
    </div>
  );
}

// /dashboard/agents/advisor → advisor page (AdvisorPanel standalone)
// /dashboard/agents/[other-id] → card grid index
export default function AgentConfigPage() {
  const params = useParams<{ id: string }>();
  if (params?.id === 'advisor') {
    return <AdvisorPageContent />;
  }
  redirect('/dashboard/agents');
}
