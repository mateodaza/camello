'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ArrowLeft, ChevronDown, ChevronRight, User } from 'lucide-react';

const statusOptions = ['active', 'resolved', 'escalated'] as const;

/** Parse customer memory JSONB into a typed facts array. */
function parseMemoryFacts(raw: unknown): Array<{ key: string; value: string }> {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.facts)) return [];
  return obj.facts
    .filter(
      (f: unknown) =>
        f &&
        typeof f === 'object' &&
        typeof (f as Record<string, unknown>).key === 'string' &&
        typeof (f as Record<string, unknown>).value === 'string',
    )
    .map((f: unknown) => ({
      key: (f as Record<string, unknown>).key as string,
      value: (f as Record<string, unknown>).value as string,
    }));
}

export default function ConversationDetailPage() {
  const t = useTranslations('conversations');
  const tc = useTranslations('common');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [customerInfoOpen, setCustomerInfoOpen] = useState(true);

  const conversation = trpc.conversation.byId.useQuery({ id });
  const messagesQuery = trpc.conversation.messages.useQuery(
    { conversationId: id },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );
  const updateStatus = trpc.conversation.updateStatus.useMutation({
    onSuccess: () => {
      utils.conversation.byId.invalidate({ id });
    },
  });

  if (conversation.isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-32" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Card>
        <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className={cn('h-12 rounded-lg', i % 2 === 0 ? 'w-3/4' : 'ml-auto w-2/3')} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
  if (conversation.isError) return <QueryError error={conversation.error} onRetry={() => conversation.refetch()} />;
  if (!conversation.data) return <div className="text-dune">Conversation not found.</div>;

  const conv = conversation.data;
  const msgs = messagesQuery.data ?? [];
  // Messages come desc from API — reverse for chronological display
  const chronological = [...msgs].reverse();

  // Parse customer memory from the byId response (now includes customer fields)
  const memoryFacts = parseMemoryFacts(conv.customerMemory);
  const hasCustomerInfo = conv.customerName || conv.customerEmail || conv.customerPhone || memoryFacts.length > 0;

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.push('/dashboard/conversations')}
        className="flex items-center gap-1 text-sm text-dune hover:text-charcoal"
      >
        <ArrowLeft className="h-4 w-4" /> {t('backToList')}
      </button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('conversation')}</h1>
          <Badge variant={conv.status ?? 'default'}>{conv.status}</Badge>
          {conv.channel && <Badge>{conv.channel}</Badge>}
        </div>

        <div className="flex flex-wrap gap-2">
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

      {/* Customer Info Card */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setCustomerInfoOpen(!customerInfoOpen)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-dune" />
              <CardTitle className="text-base">{t('customerInfo')}</CardTitle>
              {memoryFacts.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {t('factCount', { count: memoryFacts.length })}
                </Badge>
              )}
            </div>
            {customerInfoOpen
              ? <ChevronDown className="h-4 w-4 text-dune" />
              : <ChevronRight className="h-4 w-4 text-dune" />
            }
          </div>
        </CardHeader>
        {customerInfoOpen && (
          <CardContent>
            {!hasCustomerInfo ? (
              <p className="text-sm text-dune">{t('noMemory')}</p>
            ) : (
              <div className="space-y-3">
                {/* Basic info row */}
                <div className="flex flex-wrap gap-3 text-sm">
                  {conv.customerName && (
                    <span className="text-charcoal">
                      <span className="font-medium text-dune">name:</span> {conv.customerName}
                    </span>
                  )}
                  {conv.customerEmail && (
                    <span className="text-charcoal">
                      <span className="font-medium text-dune">email:</span> {conv.customerEmail}
                    </span>
                  )}
                  {conv.customerPhone && (
                    <span className="text-charcoal">
                      <span className="font-medium text-dune">phone:</span> {conv.customerPhone}
                    </span>
                  )}
                  {conv.customerChannel && (
                    <Badge variant="outline">{conv.customerChannel}</Badge>
                  )}
                  {conv.customerFirstSeenAt && (
                    <span className="text-dune text-xs">
                      {t('firstSeen')}: {new Date(conv.customerFirstSeenAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Memory facts */}
                {memoryFacts.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-dune">
                      {t('customerMemory')}
                    </p>
                    <div className="space-y-1">
                      {memoryFacts.map((fact, i) => (
                        <div key={i} className="flex items-baseline gap-2 text-sm">
                          <Badge variant="outline" className="shrink-0 text-xs font-mono">
                            {fact.key}
                          </Badge>
                          <span className="text-charcoal">{fact.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('messages')}</CardTitle>
        </CardHeader>
        <CardContent>
          {messagesQuery.isError ? (
            <QueryError error={messagesQuery.error} onRetry={() => messagesQuery.refetch()} />
          ) : chronological.length === 0 ? (
            <p className="text-dune">{t('noMessages')}</p>
          ) : (
            <div className="space-y-3">
              {chronological.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'max-w-[75%] rounded-lg px-4 py-2',
                    msg.role === 'customer'
                      ? 'self-start bg-sand text-charcoal'
                      : msg.role === 'artifact'
                        ? 'ml-auto bg-midnight text-cream'
                        : 'ml-auto bg-teal/15 text-charcoal',
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
