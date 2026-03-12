'use client';
import { useRef, useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Zap, ArrowRight, ArrowLeft, ChevronDown, MessageSquare, PanelRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/query-error';
import { fmtTimeAgo, fmtMoney, humanize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useInboxPanel } from './inbox-layout';
import { useToast } from '@/hooks/use-toast';

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

const STATUS_COLORS = {
  active:    { badge: 'bg-teal/15 text-teal', dot: 'bg-teal' },
  escalated: { badge: 'bg-sunset/15 text-sunset', dot: 'bg-sunset' },
  resolved:  { badge: 'bg-dune/15 text-dune', dot: 'bg-dune' },
} as const;

const statusKeys = ['active', 'escalated', 'resolved'] as const;

type ConversationStatus = (typeof statusKeys)[number];

function StatusDropdown({
  status,
  isPending,
  onSelect,
}: {
  status: string;
  isPending: boolean;
  onSelect: (s: ConversationStatus) => void;
}) {
  const t = useTranslations('inbox');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const colors = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.active;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-colors min-h-[28px]',
          colors.badge,
          'hover:opacity-80',
        )}
        disabled={isPending}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {t(STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? 'chatStatusActive')}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full left-0 mt-1 z-20 min-w-[140px] rounded-lg border border-charcoal/10 bg-cream shadow-md py-1"
        >
          {statusKeys.map((s) => {
            const c = STATUS_COLORS[s];
            const isCurrent = s === status;
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={isCurrent}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors min-h-[36px]',
                  isCurrent ? 'bg-sand font-medium' : 'hover:bg-sand/50',
                )}
                disabled={isPending || isCurrent}
                onClick={() => {
                  onSelect(s);
                  setOpen(false);
                }}
              >
                <span className={cn('h-2 w-2 rounded-full shrink-0', c.dot)} />
                {t(STATUS_LABELS[s])}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const { goToList, goToDetails } = useInboxPanel();
  const { addToast } = useToast();

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

  const statusMut = trpc.conversation.updateStatus.useMutation({
    onSuccess: () => { void conv.refetch(); },
    onError: () => { addToast(t('statusUpdateError'), 'error'); },
  });
  const replyMut = trpc.conversation.replyAsOwner.useMutation();
  const [replyText, setReplyText] = useState('');
  const [optimisticMessages, setOptimisticMessages] = useState<Extract<TimelineItem, { kind: 'message' }>[]>([]);

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

    const mergedMsgItems = [...msgItems, ...optimisticMessages];

    return [...mergedMsgItems, ...actItems].sort((x, y) => {
      const tx = x.kind === 'message' ? x.createdAt.getTime() : x.timestamp.getTime();
      const ty = y.kind === 'message' ? y.createdAt.getTime() : y.timestamp.getTime();
      return tx - ty;
    });
  }, [msgs.data, act.data, optimisticMessages]);

  function handleSend() {
    const text = replyText.trim();
    if (!text || replyMut.isPending) return;

    const tempId = `optimistic-${Date.now()}`;
    const optimisticItem: Extract<TimelineItem, { kind: 'message' }> = {
      kind: 'message',
      id: tempId,
      role: 'human',
      content: text,
      createdAt: new Date(),
      metadata: null,
    };
    setOptimisticMessages((prev) => [...prev, optimisticItem]);
    setReplyText('');

    replyMut.mutate(
      { conversationId, message: text },
      {
        onSuccess: () => {
          setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
          void msgs.refetch();
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        },
        onError: () => {
          setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
          setReplyText(text);
          addToast(t('ownerReplySendError'), 'error');
        },
      },
    );
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  useEffect(() => {
    if (!isScrolledUp && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timeline, isScrolledUp]);

  useEffect(() => {
    headerRef.current?.focus();
  }, [conversationId]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setIsScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  }

  const status = conv.isError ? 'active' : (conv.data?.status ?? 'active');
  const isSandbox = (conv.data?.metadata as Record<string, unknown> | null)?.sandbox === true;

  return (
    <div className="flex flex-col h-full">
      {/* HEADER */}
      <div ref={headerRef} tabIndex={-1} className="flex items-center gap-3 px-4 py-3 border-b border-charcoal/8 shrink-0 focus:outline-none">
        {/* Group 1 — mobile back button */}
        <button
          type="button"
          className="md:hidden flex items-center justify-center h-9 w-9 rounded-md hover:bg-sand shrink-0"
          aria-label={t('chatBackToList')}
          onClick={goToList}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* Group 2 — name + status dropdown badge */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {conv.isLoading ? (
            <>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </>
          ) : conv.isError ? (
            <span className="text-sm text-sunset">{t('convLoadError')}</span>
          ) : (
            <>
              <span className="text-sm font-semibold text-charcoal truncate">
                {conv.data?.customerName}
              </span>
              <StatusDropdown
                status={status}
                isPending={statusMut.isPending}
                onSelect={(s) => statusMut.mutate({ id: conversationId, status: s })}
              />
            </>
          )}
        </div>

        {/* Group 3 — right actions (details toggle on mobile) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="md:hidden flex items-center justify-center h-9 w-9 rounded-md hover:bg-sand"
            aria-label={t('chatToggleDetails')}
            onClick={goToDetails}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* SANDBOX BANNER */}
      {!conv.isLoading && !conv.isError && isSandbox && (
        <div
          data-testid="sandbox-banner"
          role="status"
          className="shrink-0 px-4 py-2 text-xs text-gold bg-gold/10 border-b border-gold/20"
        >
          {t('sandboxBanner')}
        </div>
      )}

      {/* LOADING SKELETON */}
      {msgs.isLoading && (
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
      {!msgs.isLoading && !msgs.isError && (
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label={t('chatLogLabel')}
          onScroll={onScroll}
          className="relative flex-1 overflow-y-auto px-4 py-4 space-y-2"
        >
          {act.isError && (
            <p className="text-xs text-sunset text-center py-1">{t('activityLoadError')}</p>
          )}
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

      {/* OWNER REPLY INPUT — shown for active and escalated conversations */}
      {status !== 'resolved' && (
        <div className="shrink-0 border-t border-charcoal/8 px-4 py-3 flex flex-col gap-2">
          <p className="text-xs text-sunset bg-sunset/8 rounded-md px-3 py-2">
            {t('ownerReplyBanner')}
          </p>
          <div className="flex gap-2 items-end">
            <label htmlFor="owner-reply-input" className="sr-only">
              {t('ownerReplyLabel')}
            </label>
            <textarea
              id="owner-reply-input"
              className="flex-1 resize-none rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-dune focus:outline-none focus:ring-2 focus:ring-teal/30 disabled:opacity-50 min-h-[72px]"
              placeholder={t('ownerReplyPlaceholder')}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              disabled={replyMut.isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
              }}
              rows={3}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={replyMut.isPending || replyText.trim().length === 0}
              className="shrink-0 self-end min-h-[36px]"
            >
              {replyMut.isPending ? t('ownerReplySending') : t('ownerReplySend')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
