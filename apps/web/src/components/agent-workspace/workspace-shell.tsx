'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('agentWorkspace');

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/artifacts"
        className="flex items-center gap-1 text-sm text-dune hover:text-charcoal"
      >
        <ArrowLeft className="h-4 w-4" /> {t('backToAgents')}
      </Link>
      {children}
    </div>
  );
}
