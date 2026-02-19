'use client';

import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';

export default function ConversationsPage() {
  const router = useRouter();
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.conversation.list.useInfiniteQuery(
      { limit: 30 },
      { getNextPageParam: (last) => last.nextCursor ?? undefined },
    );

  if (isLoading) return <div className="text-gray-500">Loading conversations...</div>;
  if (isError) return <QueryError error={error} />;

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Conversations</h1>
        <p className="text-gray-500">No conversations yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Conversations</h1>

      <div className="rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Updated</th>
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
                  {c.customerName ?? c.customerExternalId ?? 'Unknown'}
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
          {isFetchingNextPage ? 'Loading...' : 'Load more'}
        </Button>
      )}
    </div>
  );
}
