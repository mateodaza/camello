'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare } from 'lucide-react';

export default function ConversationsPage() {
  const t = useTranslations('conversations');
  const tc = useTranslations('common');
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.conversation.list.useInfiniteQuery(
      { limit: 30 },
      {
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
      },
    );

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="rounded-xl border-2 border-charcoal/8 bg-cream p-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
  if (isError) return <QueryError error={error} onRetry={() => refetch()} />;

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('pageTitle')}</h1>
        <div className="flex flex-col items-center gap-3 py-12">
          <MessageSquare className="h-12 w-12 text-dune/40" />
          <p className="font-heading text-lg font-semibold text-charcoal">{t('emptyTitle')}</p>
          <p className="max-w-sm text-center text-sm text-dune">{t('emptyDescription')}</p>
          <Button variant="outline" onClick={() => router.push('/dashboard/settings/profile')}>
            {t('copyLink')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('pageTitle')}</h1>

      <div className="overflow-x-auto rounded-xl border-2 border-charcoal/8 bg-cream">
        <table className="min-w-[500px] w-full text-sm">
          <thead>
            <tr className="border-b border-charcoal/8 text-left text-dune">
              <th className="px-4 py-3 font-medium">{t('columnCustomer')}</th>
              <th className="px-4 py-3 font-medium">{t('columnChannel')}</th>
              <th className="px-4 py-3 font-medium">{t('columnStatus')}</th>
              <th className="px-4 py-3 font-medium">{t('columnUpdated')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr
                key={c.id}
                className="cursor-pointer border-b border-charcoal/8 last:border-0 hover:bg-sand"
                onClick={() => router.push(`/dashboard/conversations/${c.id}`)}
              >
                <td className="px-4 py-3 font-medium">
                  {c.customerName ?? c.customerExternalId ?? t('unknown')}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="default">{c.channel}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={c.status ?? 'default'}>{c.status}</Badge>
                </td>
                <td className="px-4 py-3 text-dune">
                  {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasNextPage && (
        <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? tc('loading') : t('loadMore')}
        </Button>
      )}
    </div>
  );
}
