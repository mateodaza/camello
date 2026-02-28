'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryError } from '@/components/query-error';
import { AlertTriangle } from 'lucide-react';
import { fmtDate, humanize } from '@/lib/format';

/** Map intent type → i18n key. Closed enum from intentSchema. */
const intentKeys: Record<string, string> = {
  greeting: 'intentGreeting',
  pricing: 'intentPricing',
  availability: 'intentAvailability',
  product_question: 'intentProductQuestion',
  complaint: 'intentComplaint',
  booking_request: 'intentBookingRequest',
  followup: 'intentFollowup',
  negotiation: 'intentNegotiation',
  technical_support: 'intentTechnicalSupport',
  general_inquiry: 'intentGeneralInquiry',
  escalation_request: 'intentEscalationRequest',
  simple_question: 'intentSimpleQuestion',
  farewell: 'intentFarewell',
  thanks: 'intentThanks',
};

export function PriorityIntents({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const query = trpc.agent.highPriorityIntents.useQuery({ artifactId });

  if (query.isLoading) return null;

  if (query.isError && query.error) {
    return (
      <Card className="border-sunset/20">
        <CardContent className="pt-4">
          <QueryError error={query.error} onRetry={() => query.refetch()} />
        </CardContent>
      </Card>
    );
  }

  const items = query.data ?? [];
  if (items.length === 0) return null;

  return (
    <Card className="border-sunset/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-sunset" />
          {t('priorityIntentsTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.intent}
              className="flex items-center justify-between rounded-lg border border-sunset/15 bg-sunset/5 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Badge variant="escalated">
                  {intentKeys[item.intent]
                    ? t(intentKeys[item.intent] as Parameters<typeof t>[0])
                    : humanize(item.intent)}
                </Badge>
                <span className="text-sm text-dune">
                  {t('priorityIntentCount', { count: item.count })}
                </span>
                <span className="text-xs text-dune/70">{fmtDate(item.lastSeen)}</span>
              </div>
              {item.latestConversationId && (
                <Link
                  href={`/dashboard/conversations/${item.latestConversationId}`}
                  className="text-xs font-medium text-teal hover:underline"
                >
                  {t('viewConversation')}
                </Link>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
