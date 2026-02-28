'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { fmtDateTime, humanize } from '@/lib/format';

const statusColors: Record<string, string> = {
  executed: 'active',
  pending: 'default',
  rejected: 'escalated',
};

/** Map module slug → i18n key. Known slugs get translated; unknown fall back to humanize(). */
const moduleKeys: Record<string, string> = {
  book_meeting: 'moduleBookMeeting',
  capture_interest: 'moduleCaptureInterest',
  collect_payment: 'moduleCollectPayment',
  send_followup: 'moduleSendFollowup',
  qualify_lead: 'moduleQualifyLead',
  send_quote: 'moduleSendQuote',
  create_ticket: 'moduleCreateTicket',
  escalate_to_human: 'moduleEscalateToHuman',
  draft_content: 'moduleDraftContent',
};

export function AgentActivity({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const [limit, setLimit] = useState(20);

  const query = trpc.agent.activityFeed.useQuery({
    artifactId,
    limit,
    offset: 0,
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('activityTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('activityTitle')}</CardTitle></CardHeader>
        <CardContent>
          <QueryError error={query.error} onRetry={() => query.refetch()} />
        </CardContent>
      </Card>
    );
  }

  const items = query.data ?? [];

  return (
    <Card>
      <CardHeader><CardTitle>{t('activityTitle')}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-medium text-charcoal">{t('activityEmpty')}</p>
            <p className="mt-1 text-sm text-dune">{t('activityEmptyDesc')}</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-charcoal/10 pl-4">
            {items.map((item) => (
              <div key={item.id} className="relative mb-4 last:mb-0">
                {/* Timeline dot */}
                <div className="absolute -left-[1.3rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-cream bg-charcoal/20" />

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {moduleKeys[item.moduleSlug]
                      ? t(moduleKeys[item.moduleSlug] as Parameters<typeof t>[0])
                      : humanize(item.moduleSlug)}
                  </Badge>
                  <Badge variant={statusColors[item.status] ?? 'default'} className="text-xs">
                    {t(`status${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}` as Parameters<typeof t>[0])}
                  </Badge>
                  {item.durationMs != null && (
                    <span className="text-xs text-dune">{item.durationMs}ms</span>
                  )}
                  <span className="text-xs text-dune">{fmtDateTime(item.createdAt)}</span>
                </div>
              </div>
            ))}

            {/* Load more */}
            {items.length >= limit && (
              <div className="mt-3 text-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 20)}>
                  {t('loadMore')}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
