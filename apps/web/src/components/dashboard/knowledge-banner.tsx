'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

// TODO: spec ambiguity — plan specified this as a named export from page.tsx,
// but Next.js App Router forbids non-reserved named exports from page files.
// Moved to this component file instead.
export function KnowledgeBanner({
  agentName,
  t,
}: {
  agentName: string;
  t: ReturnType<typeof useTranslations<'dashboard'>>;
}) {
  return (
    <div
      data-testid="knowledge-banner"
      className="flex items-center justify-between rounded-lg border border-sunset/30 bg-sunset/5 px-4 py-3"
    >
      <p className="text-sm text-charcoal">
        {t('knowledgeBannerText', { name: agentName })}
      </p>
      <Link
        href="/dashboard/knowledge"
        className="ml-4 shrink-0 rounded-md bg-teal px-3 py-1.5 text-xs font-medium text-white hover:bg-teal/90"
      >
        {t('knowledgeBannerAction')}
      </Link>
    </div>
  );
}
