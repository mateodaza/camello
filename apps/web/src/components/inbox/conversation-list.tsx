'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Search, Monitor, MessageCircle, MessageSquare } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/query-error';
import { fmtTimeAgo, truncate } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  artifactId?: string;
}

export function ConversationList({ selectedId, onSelect, artifactId }: ConversationListProps) {
  const t = useTranslations('inbox');

  const [statusFilter, setStatusFilter] = useState<'active' | 'escalated' | 'resolved' | undefined>(undefined);
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
        ...(searchDebounced && { search: searchDebounced }),
        ...(artifactId && { artifactId }),
      },
      {
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
      },
    );

  const FILTERS = [
    { label: t('filterAll'),       value: undefined },
    { label: t('filterActive'),    value: 'active'    as const },
    { label: t('filterEscalated'), value: 'escalated' as const },
    { label: t('filterResolved'),  value: 'resolved'  as const },
  ] satisfies Array<{ label: string; value: typeof statusFilter }>;

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs row */}
      <div className="flex gap-1 overflow-x-auto px-3 pt-3 pb-2 shrink-0">
        {FILTERS.map(({ label, value }) => (
          <Button
            key={label}
            size="sm"
            type="button"
            variant={statusFilter === value ? 'default' : 'ghost'}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative px-3 pb-2 shrink-0">
        <Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-dune" aria-hidden="true" />
        <input
          type="search"
          className="h-8 w-full rounded-lg border-2 border-charcoal/8 bg-cream pl-8 pr-3 text-sm focus:border-teal focus:outline-none"
          placeholder={t('searchPlaceholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label={t('searchPlaceholder')}
        />
      </div>

      {/* Conversation rows — scrollable area */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 px-3 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded" />
            ))}
          </div>
        ) : isError ? (
          <div className="px-3 py-2">
            <QueryError error={error} onRetry={() => refetch()} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
            <MessageSquare className="h-8 w-8 text-dune/40" />
            <p className="font-medium text-sm text-charcoal">{t('emptyTitle')}</p>
            <p className="text-xs text-dune">{t('emptyDescription')}</p>
          </div>
        ) : (
          <>
            {items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 min-h-[48px] text-left border-l-2 transition-colors',
                  c.status === 'escalated'
                    ? 'border-l-sunset'
                    : c.id === selectedId
                      ? 'border-l-teal'
                      : 'border-l-transparent',
                  c.id === selectedId
                    ? 'bg-sand'
                    : 'hover:bg-sand/50',
                )}
              >
                {/* Status dot */}
                <span
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    c.status === 'active'    && 'bg-teal',
                    c.status === 'escalated' && 'bg-sunset',
                    c.status === 'resolved'  && 'bg-dune',
                  )}
                />

                {/* Channel icon */}
                {c.channel === 'whatsapp' ? (
                  <MessageCircle className="h-4 w-4 shrink-0 text-dune" />
                ) : (
                  <Monitor className="h-4 w-4 shrink-0 text-dune" />
                )}

                {/* Content column */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-sm truncate text-charcoal">
                      {c.customerName ?? c.customerExternalId ?? '—'}
                    </span>
                    <span className="text-xs text-dune shrink-0">
                      {fmtTimeAgo(c.updatedAt)}
                    </span>
                  </div>
                  {c.summary && (
                    <p className="text-xs text-dune truncate mt-0.5">
                      {truncate(c.summary, 80)}
                    </p>
                  )}
                </div>
              </button>
            ))}

            {hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                className="mx-3 my-2"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? '...' : t('loadMore')}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
