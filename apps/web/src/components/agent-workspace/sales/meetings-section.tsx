'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Calendar } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { CardFeed } from '../primitives/card-feed';

interface MeetingsSectionProps {
  artifactId: string;
}

function MeetingStatusBadge({ booked }: { booked: boolean | null }) {
  const t = useTranslations('agentWorkspace');
  if (booked === true) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-teal/15 text-teal">
        {t('meetingStatusConfirmed')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-gold/15 text-gold">
      {t('meetingStatusPending')}
    </span>
  );
}

export function MeetingsSection({ artifactId }: MeetingsSectionProps) {
  const t = useTranslations('agentWorkspace');
  const router = useRouter();

  const meetings = trpc.agent.salesMeetings.useQuery({ artifactId, limit: 50, offset: 0 });

  type MeetingItem = NonNullable<typeof meetings.data>[number];

  const now = new Date();

  const { upcoming, past } = useMemo(() => {
    const items = meetings.data ?? [];
    const upcoming = items
      .filter((item) => item.datetime && new Date(item.datetime) >= now)
      .sort((a, b) => new Date(a.datetime!).getTime() - new Date(b.datetime!).getTime());
    const past = items
      .filter((item) => !item.datetime || new Date(item.datetime) < now)
      .sort((a, b) => {
        if (!a.datetime && !b.datetime) return 0;
        if (!a.datetime) return -1;
        if (!b.datetime) return 1;
        return new Date(b.datetime).getTime() - new Date(a.datetime).getTime();
      });
    return { upcoming, past };
  }, [meetings.data]);

  const renderCard = (item: MeetingItem) => (
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
        <MeetingStatusBadge booked={item.booked} />
      </div>
      <div className="mt-1 text-xs text-dune">{item.topic ?? '—'}</div>
      <div className="mt-0.5 text-xs text-dune">
        {item.datetime ? new Date(item.datetime).toLocaleDateString() : '—'}
      </div>
    </button>
  );

  return (
    <>
      <CardFeed
        title={t('meetingsUpcoming')}
        icon={<Calendar className="h-4 w-4 text-teal" />}
        cardClassName="bg-sand/20"
        items={upcoming}
        isLoading={meetings.isLoading}
        isError={meetings.isError}
        error={meetings.error ?? undefined}
        onRetry={() => meetings.refetch()}
        emptyTitle={t('meetingsUpcomingEmptyTitle')}
        emptyDescription={t('meetingsUpcomingEmptyDescription')}
        renderCard={renderCard}
      />
      {!meetings.isLoading && !meetings.isError && (
        <CardFeed
          title={t('meetingsPast')}
          icon={<Calendar className="h-4 w-4 text-teal" />}
          cardClassName="bg-sand/20"
          items={past}
          isLoading={false}
          isError={false}
          emptyTitle={t('meetingsPastEmptyTitle')}
          emptyDescription={t('meetingsPastEmptyDescription')}
          renderCard={renderCard}
        />
      )}
    </>
  );
}
