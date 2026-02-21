'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryError } from '@/components/query-error';
import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

const statusOptions = ['active', 'resolved', 'escalated'] as const;

export default function ConversationDetailPage() {
  const t = useTranslations('conversations');
  const tc = useTranslations('common');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const conversation = trpc.conversation.byId.useQuery({ id });
  const messagesQuery = trpc.conversation.messages.useQuery({ conversationId: id });
  const updateStatus = trpc.conversation.updateStatus.useMutation({
    onSuccess: () => {
      utils.conversation.byId.invalidate({ id });
    },
  });

  if (conversation.isLoading) return <div className="text-gray-500">{tc('loading')}</div>;
  if (conversation.isError) return <QueryError error={conversation.error} />;
  if (!conversation.data) return <div className="text-gray-500">Conversation not found.</div>;

  const conv = conversation.data;
  const msgs = messagesQuery.data ?? [];
  // Messages come desc from API — reverse for chronological display
  const chronological = [...msgs].reverse();

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.push('/dashboard/conversations')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" /> {t('backToList')}
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{t('conversation')}</h1>
          <Badge variant={conv.status ?? 'default'}>{conv.status}</Badge>
          {conv.channel && <Badge>{conv.channel}</Badge>}
        </div>

        <div className="flex gap-2">
          {statusOptions.map((s) => (
            <Button
              key={s}
              variant={conv.status === s ? 'default' : 'outline'}
              size="sm"
              disabled={conv.status === s || updateStatus.isPending}
              onClick={() => updateStatus.mutate({ id, status: s })}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('messages')}</CardTitle>
        </CardHeader>
        <CardContent>
          {messagesQuery.isError ? (
            <QueryError error={messagesQuery.error} />
          ) : chronological.length === 0 ? (
            <p className="text-gray-500">{t('noMessages')}</p>
          ) : (
            <div className="space-y-3">
              {chronological.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'max-w-[75%] rounded-lg px-4 py-2',
                    msg.role === 'customer'
                      ? 'self-start bg-gray-100 text-gray-800'
                      : msg.role === 'artifact'
                        ? 'ml-auto bg-gray-900 text-white'
                        : 'ml-auto bg-blue-100 text-blue-800',
                  )}
                >
                  <p className="text-xs font-medium opacity-70">{msg.role}</p>
                  <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  <p className="mt-1 text-xs opacity-50">
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
