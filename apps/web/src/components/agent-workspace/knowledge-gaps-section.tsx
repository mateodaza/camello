'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { BookOpen } from 'lucide-react';
import { trpc } from '@/lib/trpc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTimeAgo(date: Date | null, locale: string): string {
  if (!date) return '';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  const diffSecs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (Math.abs(diffSecs) < 60) return rtf.format(-diffSecs, 'second');
  const diffMins = Math.floor(diffSecs / 60);
  if (Math.abs(diffMins) < 60) return rtf.format(-diffMins, 'minute');
  const diffHours = Math.floor(diffMins / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(-diffHours, 'hour');
  const diffDays = Math.floor(diffHours / 24);
  return rtf.format(-diffDays, 'day');
}

// ---------------------------------------------------------------------------
// KnowledgeGapsSection
// ---------------------------------------------------------------------------

interface KnowledgeGapsSectionProps {
  artifactId: string;
}

export function KnowledgeGapsSection({ artifactId }: KnowledgeGapsSectionProps) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const { data: gaps, isLoading } = trpc.agent.knowledgeGapNotifications.useQuery(
    { artifactId },
    { retry: 2 },
  );

  const sectionClass = 'rounded-xl border border-charcoal/8 bg-cream p-5';

  return (
    <div className={sectionClass}>
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-teal" />
        <h2 className="font-heading text-base font-semibold text-charcoal">
          {t('configKnowledgeGapsTitle')}
        </h2>
      </div>
      <p className="mt-1 text-sm text-dune">{t('configKnowledgeGapsDesc')}</p>

      {isLoading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-charcoal/6" />
          ))}
        </div>
      ) : !gaps || gaps.length === 0 ? (
        <p className="mt-3 text-sm text-dune">{t('configKnowledgeGapsEmpty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-charcoal/6">
          {gaps.map((gap) => {
            const meta = (gap.metadata ?? {}) as { intentType?: string; sampleQuestion?: string };
            const intentType = meta.intentType ?? 'unknown';
            const sampleQuestion = meta.sampleQuestion ?? '';
            return (
              <li key={gap.id} className="flex items-start justify-between gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <span className="inline-block rounded bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal lowercase">
                    {intentType}
                  </span>
                  <p className="mt-1 text-sm text-charcoal line-clamp-3">{sampleQuestion}</p>
                  <p className="mt-0.5 text-[10px] text-dune/70">{fmtTimeAgo(gap.createdAt, locale)}</p>
                </div>
                <Link
                  href={`/dashboard/knowledge?q=${encodeURIComponent(sampleQuestion)}`}
                  className="shrink-0 text-xs font-medium text-teal hover:underline"
                >
                  {t('configAddToKnowledge')}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
