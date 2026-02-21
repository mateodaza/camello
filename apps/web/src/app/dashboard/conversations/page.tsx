'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';

export default function ConversationsPage() {
  const t = useTranslations('conversations');
  const tc = useTranslations('common');
  const router = useRouter();
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.conversation.list.useInfiniteQuery(
      { limit: 30 },
      { getNextPageParam: (last) => last.nextCursor ?? undefined },
    );

  if (isLoading) return <div className="text-gray-500">{t('loading')}</div>;
  if (isError) return <QueryError error={error} />;

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>
        <p className="text-gray-500">{t('noConversations')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>

      <div className="rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
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
                className="cursor-pointer border-b last:border-0 hover:bg-gray-50"
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
                <td className="px-4 py-3 text-gray-500">
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
