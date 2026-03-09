'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { CardFeed } from '../primitives/card-feed';

interface FollowupsSectionProps {
  artifactId: string;
}

function FollowupStatusBadge({ status }: { status: string | null }) {
  const t = useTranslations('agentWorkspace');
  if (status === null) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-charcoal/10 text-dune">
        —
      </span>
    );
  }
  if (status === 'queued') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-gold/15 text-gold">
        {t('followupStatusQueued')}
      </span>
    );
  }
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-teal/15 text-teal">
        {t('followupStatusSent')}
      </span>
    );
  }
  if (status === 'processed') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-teal/15 text-teal">
        {t('followupStatusProcessed')}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-sunset/15 text-sunset">
        {t('followupStatusFailed')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-charcoal/10 text-dune">
      {status}
    </span>
  );
}

export function FollowupsSection({ artifactId }: FollowupsSectionProps) {
  const t = useTranslations('agentWorkspace');
  const router = useRouter();

  const followups = trpc.agent.salesFollowups.useQuery({ artifactId, limit: 50, offset: 0 });

  type FollowupItem = NonNullable<typeof followups.data>[number];

  const renderCard = (item: FollowupItem) => (
    <button
      type="button"
      className="w-full text-left"
      onClick={() => {
        if (item.conversationId) {
          router.push(`/dashboard/conversations?selected=${item.conversationId}`);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-charcoal">{item.customerName ?? '—'}</span>
        <FollowupStatusBadge status={item.followupStatus} />
      </div>
      <div className="mt-1 text-xs text-dune">{item.messageTemplate ?? '—'}</div>
      <div className="mt-0.5 text-xs text-dune">
        {item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString() : '—'}
        {item.channel ? ` · ${item.channel}` : ''}
      </div>
    </button>
  );

  return (
    <CardFeed
      title={t('followupsTitle')}
      icon={<Send className="h-4 w-4 text-teal" />}
      cardClassName="bg-sand/20"
      items={followups.data ?? []}
      isLoading={followups.isLoading}
      isError={followups.isError}
      error={followups.error ?? undefined}
      onRetry={() => followups.refetch()}
      emptyTitle={t('followupsEmptyTitle')}
      emptyDescription={t('followupsEmptyDescription')}
      renderCard={renderCard}
    />
  );
}
