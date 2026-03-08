'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
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

  const [statusFilter, setStatusFilter] = useState<'active' | 'resolved' | 'escalated' | undefined>(undefined);
  const [channelFilter, setChannelFilter] = useState<'web_chat' | 'whatsapp' | undefined>(undefined);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.conversation.list.useInfiniteQuery(
      {
        limit: 30,
        ...(statusFilter && { status: statusFilter }),
        ...(channelFilter && { channel: channelFilter }),
        ...(dateRange !== 'all' && { dateRange }),
        ...(searchDebounced && { search: searchDebounced }),
      },
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

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('pageTitle')}</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status */}
        <div className="flex gap-1">
          {([['all', undefined], ['active', 'active'], ['resolved', 'resolved'], ['escalated', 'escalated']] as const).map(([label, val]) => (
            <Button
              key={label}
              size="sm"
              type="button"
              variant={statusFilter === val ? 'default' : 'outline'}
              onClick={() => setStatusFilter(val)}
            >
              {t(`filterStatus${label.charAt(0).toUpperCase() + label.slice(1)}`)}
            </Button>
          ))}
        </div>

        {/* Channel */}
        <div className="flex gap-1">
          <Button size="sm" type="button" variant={!channelFilter ? 'default' : 'outline'} onClick={() => setChannelFilter(undefined)}>
            {t('filterChannelAll')}
          </Button>
          <Button size="sm" type="button" variant={channelFilter === 'web_chat' ? 'default' : 'outline'} onClick={() => setChannelFilter('web_chat')}>
            {t('filterChannelWebChat')}
          </Button>
          <Button size="sm" type="button" variant={channelFilter === 'whatsapp' ? 'default' : 'outline'} onClick={() => setChannelFilter('whatsapp')}>
            {t('filterChannelWhatsApp')}
          </Button>
        </div>

        {/* Date range */}
        <div className="flex gap-1">
          {(['all', '7d', '30d'] as const).map((d) => (
            <Button key={d} size="sm" type="button" variant={dateRange === d ? 'default' : 'outline'} onClick={() => setDateRange(d)}>
              {t(d === 'all' ? 'filterDateAll' : d === '7d' ? 'filterDate7d' : 'filterDate30d')}
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto min-w-[200px]">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-dune" aria-hidden="true" />
          <input
            type="search"
            className="h-8 w-full rounded-lg border-2 border-charcoal/8 bg-cream pl-8 pr-3 text-sm focus:border-teal focus:outline-none"
            placeholder={t('searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={t('searchPlaceholder')}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <MessageSquare className="h-12 w-12 text-dune/40" />
          <p className="font-heading text-lg font-semibold text-charcoal">{t('emptyTitle')}</p>
          <p className="max-w-sm text-center text-sm text-dune">{t('emptyDescription')}</p>
          <Button variant="outline" onClick={() => router.push('/dashboard/settings/profile')}>
            {t('copyLink')}
          </Button>
        </div>
      ) : (
        <>
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
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.customerName ?? c.customerExternalId ?? t('unknown')}</div>
                      {c.summary && (
                        <div className="mt-0.5 max-w-[240px] truncate text-xs text-dune">
                          {c.summary.length > 80 ? `${c.summary.slice(0, 80)}…` : c.summary}
                        </div>
                      )}
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
        </>
      )}
    </div>
  );
}
