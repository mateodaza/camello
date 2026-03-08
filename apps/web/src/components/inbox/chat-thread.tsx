'use client';
import { useRef, useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Zap, ArrowRight, ChevronDown, MessageSquare } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/query-error';
import { fmtTimeAgo, fmtMoney, humanize } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ChatThreadProps {
  conversationId: string | null;
}

type TimelineItem =
  | {
      kind: 'message';
      id: string;
      role: 'customer' | 'artifact' | 'human' | 'system';
      content: string;
      createdAt: Date;
      metadata: unknown;
    }
  | {
      kind: 'execution';
      timestamp: Date;
      moduleName?: string;
      moduleSlug?: string;
      output?: unknown;
    }
  | {
      kind: 'stage_change';
      timestamp: Date;
      fromStage?: string;
      toStage?: string;
    };

function badgeLabel(
  t: ReturnType<typeof useTranslations<'inbox'>>,
  moduleSlug?: string,
  output?: unknown,
): string {
  const out = output as Record<string, unknown> | null | undefined;
  switch (moduleSlug) {
    case 'qualify_lead':
      return out?.score != null
        ? t('chatModuleQualifyLead', { score: String(out.score) })
        : t('chatModuleQualifyLeadNoScore');
    case 'send_quote':
      return out?.amount != null
        ? t('chatModuleSendQuote', { amount: fmtMoney(Number(out.amount)) })
        : t('chatModuleSendQuoteNoAmount');
    case 'book_meeting':       return t('chatModuleBookMeeting');
    case 'send_followup':      return t('chatModuleSendFollowup');
    case 'create_ticket':      return t('chatModuleCreateTicket');
    case 'escalate_to_human':  return t('chatModuleEscalateToHuman');
    case 'collect_payment':
      return out?.amount != null
        ? t('chatModuleCollectPayment', { amount: fmtMoney(Number(out.amount)) })
        : t('chatModuleCollectPaymentNoAmount');
    case 'capture_interest':   return t('chatModuleCaptureInterest');
    case 'draft_content':      return t('chatModuleDraftContent');
    default:
      return t('chatModuleFallback', { name: humanize(moduleSlug ?? 'action') });
  }
}

const STATUS_LABELS = {
  active: 'chatStatusActive',
  resolved: 'chatStatusResolved',
  escalated: 'chatStatusEscalated',
} as const;

export function ChatThread({ conversationId }: ChatThreadProps) {
  const t = useTranslations('inbox');

  // Empty state guard
  if (conversationId === null) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-2 text-dune">
        <MessageSquare className="h-8 w-8 opacity-30" aria-hidden="true" />
        <p className="text-sm">{t('chatEmpty')}</p>
      </div>
    );
  }

  return <ChatThreadInner conversationId={conversationId} />;
}

function ChatThreadInner({ conversationId }: { conversationId: string }) {
  const t = useTranslations('inbox');

  const conv = trpc.conversation.byId.useQuery(
    { id: conversationId },
    { refetchInterval: 30_000 },
  );
  const msgs = trpc.conversation.messages.useQuery(
    { conversationId, limit: 100 },
    { refetchInterval: 30_000 },
  );
  const act = trpc.conversation.activity.useQuery(
    { conversationId },
    { refetchInterval: 30_000 },
  );

  const statusMut = trpc.conversation.updateStatus.useMutation();

  const timeline = useMemo<TimelineItem[]>(() => {
    const msgItems: TimelineItem[] = [...(msgs.data ?? [])].reverse().map((m) => ({
      kind: 'message',
      id: m.id,
      role: m.role as 'customer' | 'artifact' | 'human' | 'system',
      content: m.content,
      createdAt: m.createdAt,
      metadata: m.metadata,
    }));

    const actItems: TimelineItem[] = (act.data ?? []).map((a) =>
      a.type === 'execution'
        ? {
            kind: 'execution' as const,
            timestamp: a.timestamp,
            moduleName: a.moduleName,
            moduleSlug: a.moduleSlug,
            output: a.output,
          }
        : {
            kind: 'stage_change' as const,
            timestamp: a.timestamp,
            fromStage: a.fromStage,
            toStage: a.toStage,
          },
    );

    return [...msgItems, ...actItems].sort((x, y) => {
      const tx = x.kind === 'message' ? x.createdAt.getTime() : x.timestamp.getTime();
      const ty = y.kind === 'message' ? y.createdAt.getTime() : y.timestamp.getTime();
      return tx - ty;
    });
  }, [msgs.data, act.data]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  useEffect(() => {
    if (!isScrolledUp && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timeline, isScrolledUp]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setIsScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  }

  const status = conv.data?.status ?? 'active';
  const statusKeys = ['active', 'resolved', 'escalated'] as const;

  return (
    <div className="flex flex-col h-full">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-charcoal/8 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {conv.isLoading ? (
            <>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </>
          ) : (
            <>
              <span className="text-sm font-semibold text-charcoal truncate">
                {conv.data?.customerName}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs shrink-0',
                  status === 'active'    && 'bg-teal/15 text-teal',
                  status === 'escalated' && 'bg-sunset/15 text-sunset',
                  status === 'resolved'  && 'bg-dune/15 text-dune',
                )}
              >
                {t(STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? 'chatStatusActive')}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {statusKeys.map((s) => (
            <Button
              key={s}
              size="sm"
              type="button"
              variant={conv.data?.status === s ? 'default' : 'ghost'}
              disabled={statusMut.isPending}
              onClick={() => statusMut.mutate({ id: conversationId, status: s })}
            >
              {t(STATUS_LABELS[s])}
            </Button>
          ))}
        </div>
      </div>

      {/* LOADING SKELETON */}
      {(msgs.isLoading || act.isLoading) && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn('h-10 rounded-lg', i % 2 === 0 ? 'w-3/4' : 'w-2/3 ml-auto')}
            />
          ))}
        </div>
      )}

      {/* ERROR STATE */}
      {msgs.isError && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <QueryError error={msgs.error} onRetry={() => msgs.refetch()} />
        </div>
      )}

      {/* SCROLL CONTAINER */}
      {!msgs.isLoading && !act.isLoading && !msgs.isError && (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="relative flex-1 overflow-y-auto px-4 py-4 space-y-2"
        >
          {timeline.map((item, idx) => {
            if (item.kind === 'message') {
              if (item.role === 'customer') {
                return (
                  <div key={item.id} className="flex justify-start">
                    <div className="max-w-[70%] bg-sand text-charcoal rounded-lg px-3 py-2">
                      <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                      <p className="text-xs opacity-50 mt-1">{fmtTimeAgo(item.createdAt)}</p>
                    </div>
                  </div>
                );
              }
              if (item.role === 'artifact') {
                return (
                  <div key={item.id} className="flex justify-start">
                    <div className="max-w-[70%] bg-midnight text-cream rounded-lg px-3 py-2">
                      <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                      <p className="text-xs opacity-50 mt-1">{fmtTimeAgo(item.createdAt)}</p>
                    </div>
                  </div>
                );
              }
              if (item.role === 'human') {
                return (
                  <div key={item.id} className="flex justify-end">
                    <div className="max-w-[70%] bg-teal text-cream rounded-lg px-3 py-2">
                      <p className="text-xs font-medium mb-0.5 opacity-75">{t('chatYou')}</p>
                      <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                      <p className="text-xs opacity-50 mt-1">{fmtTimeAgo(item.createdAt)}</p>
                    </div>
                  </div>
                );
              }
              // system
              return (
                <div key={item.id} className="flex justify-center">
                  <span className="text-xs text-dune italic opacity-70 px-2">{item.content}</span>
                </div>
              );
            }

            if (item.kind === 'execution') {
              return (
                <div key={`exec-${idx}-${item.timestamp.getTime()}`} className="flex justify-center my-1">
                  <span className="flex items-center gap-1.5 rounded-full border border-charcoal/8 bg-cream px-3 py-1 text-xs text-dune">
                    <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {badgeLabel(t, item.moduleSlug, item.output)}
                    <span className="opacity-50 ml-1">{fmtTimeAgo(item.timestamp)}</span>
                  </span>
                </div>
              );
            }

            // stage_change
            return (
              <div key={`stage-${idx}-${item.timestamp.getTime()}`} className="flex justify-center my-1">
                <span className="flex items-center gap-1.5 rounded-full border border-charcoal/8 bg-cream px-3 py-1 text-xs text-dune">
                  <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {t('chatStageChanged', { from: item.fromStage ?? '?', to: item.toStage ?? '?' })}
                  <span className="opacity-50 ml-1">{fmtTimeAgo(item.timestamp)}</span>
                </span>
              </div>
            );
          })}

          {/* Scroll-to-bottom button */}
          <button
            type="button"
            aria-label={t('chatScrollToBottom')}
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
              setIsScrolledUp(false);
            }}
            className={cn(
              'absolute bottom-2 right-2 h-9 w-9 flex items-center justify-center',
              'rounded-full bg-cream border border-charcoal/8 shadow-sm hover:bg-sand',
              !isScrolledUp && 'hidden',
            )}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
