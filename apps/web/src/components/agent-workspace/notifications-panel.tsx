'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Bell, BookOpen, ClipboardList, Flame, Trophy, Clock, AlertTriangle, DollarSign, TrendingUp, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Sheet, SheetHeader, SheetTitle, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTimeAgo(date: Date | null, locale: string): string {
  if (!date) return '';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  const diffSecs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (Math.abs(diffSecs) < 60) return rtf.format(-diffSecs, 'second');
  const diffMins = Math.floor(diffSecs / 60);
  if (Math.abs(diffMins) < 60) return rtf.format(-diffMins, 'minute');
  const diffHours = Math.floor(diffMins / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(-diffHours, 'hour');
  const diffDays = Math.floor(diffHours / 24);
  return rtf.format(-diffDays, 'day');
}

type NotifType = 'approval_needed' | 'hot_lead' | 'deal_closed' | 'lead_stale' | 'escalation' | 'budget_warning' | 'stage_advanced' | 'knowledge_gap';

const TYPE_ICON: Record<NotifType, React.ReactNode> = {
  approval_needed: <ClipboardList className="h-4 w-4" />,
  hot_lead: <Flame className="h-4 w-4" />,
  deal_closed: <Trophy className="h-4 w-4" />,
  lead_stale: <Clock className="h-4 w-4" />,
  escalation: <AlertTriangle className="h-4 w-4" />,
  budget_warning: <DollarSign className="h-4 w-4" />,
  stage_advanced: <TrendingUp className="h-4 w-4" />,
  knowledge_gap: <BookOpen className="h-4 w-4" />,
};

const TYPE_COLOR: Record<NotifType, string> = {
  approval_needed: 'text-gold bg-gold/10',
  hot_lead: 'text-sunset bg-sunset/10',
  deal_closed: 'text-teal bg-teal/10',
  lead_stale: 'text-dune bg-dune/10',
  escalation: 'text-sunset bg-sunset/10',
  budget_warning: 'text-gold bg-gold/10',
  stage_advanced: 'text-teal bg-teal/10',
  knowledge_gap: 'text-teal bg-teal/10',
};

// ---------------------------------------------------------------------------
// NotificationsPanel
// ---------------------------------------------------------------------------

interface NotificationsPanelProps {
  artifactId: string;
  open: boolean;
}

export function NotificationsPanel({ artifactId, open }: NotificationsPanelProps) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const utils = trpc.useUtils();
  const { addToast } = useToast();

  const { data } = trpc.agent.ownerNotifications.useQuery(
    { artifactId, limit: 30, offset: 0 },
    { refetchInterval: 15_000, refetchIntervalInBackground: false, enabled: open, retry: 2 },
  );

  const markRead = trpc.agent.markNotificationRead.useMutation({
    onSuccess: () => {
      void utils.agent.ownerNotifications.invalidate({ artifactId });
      void utils.agent.unreadNotificationCount.invalidate({ artifactId });
    },
    onError: () => addToast(t('errorLoading'), 'error'),
  });

  const markAllRead = trpc.agent.markAllNotificationsRead.useMutation({
    onSuccess: () => {
      void utils.agent.ownerNotifications.invalidate({ artifactId });
      void utils.agent.unreadNotificationCount.invalidate({ artifactId });
    },
    onError: () => addToast(t('errorLoading'), 'error'),
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-4 border-b border-charcoal/8">
        <h2 className="font-heading text-lg font-bold text-charcoal">{t('panelTitle')}</h2>
        {unreadCount > 0 && (
          <button
            type="button"
            className="text-xs font-medium text-teal hover:underline min-h-[36px] px-2"
            onClick={() => markAllRead.mutate({ artifactId })}
          >
            {t('markAllRead')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="p-6 text-sm text-dune text-center">{t('emptyState')}</p>
        ) : (
          <ul className="divide-y divide-charcoal/6">
            {notifications.map((n) => {
              const meta = (n.metadata ?? {}) as Record<string, unknown>;
              const href = meta.conversationId
                ? `/dashboard/conversations?selected=${meta.conversationId}`
                : null;
              const isUnread = !n.readAt;
              const typeKey = (n.type as NotifType);
              const iconColor = TYPE_COLOR[typeKey] ?? 'text-charcoal bg-charcoal/10';

              const isKnowledgeGap = n.type === 'knowledge_gap';
              const notifMeta = (n.metadata ?? {}) as Record<string, unknown>;
              const displayTitle = isKnowledgeGap
                ? t('titleKnowledgeGap', { intentType: String(notifMeta.intentType ?? '') })
                : n.title;
              const displayBody = isKnowledgeGap
                ? t('bodyKnowledgeGap', { question: String(notifMeta.sampleQuestion ?? '') })
                : n.body;

              const content = (
                <div className="flex items-start gap-3 p-4 hover:bg-charcoal/[0.03] transition-colors">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
                    {TYPE_ICON[typeKey] ?? <Bell className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isUnread && (
                        <>
                          <span className="h-2 w-2 shrink-0 rounded-full bg-teal" />
                          <span className="sr-only">{t('unread')}</span>
                        </>
                      )}
                      <p className="text-sm font-medium text-charcoal truncate">{displayTitle}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-dune line-clamp-2">{displayBody}</p>
                    <p className="mt-1 text-[10px] text-dune/70">{fmtTimeAgo(n.createdAt, locale)}</p>
                  </div>
                </div>
              );

              if (href) {
                return (
                  <li key={n.id}>
                    <Link
                      href={href}
                      onClick={() => {
                        if (isUnread) markRead.mutate({ notificationId: n.id });
                      }}
                    >
                      {content}
                    </Link>
                  </li>
                );
              }

              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      if (isUnread) markRead.mutate({ notificationId: n.id });
                    }}
                  >
                    {content}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationsBell
// ---------------------------------------------------------------------------

interface NotificationsBellProps {
  artifactId: string;
}

export function NotificationsBell({ artifactId }: NotificationsBellProps) {
  const t = useTranslations('notifications');
  const [open, setOpen] = useState(false);

  const { data } = trpc.agent.unreadNotificationCount.useQuery(
    { artifactId },
    { refetchInterval: 15_000, refetchIntervalInBackground: false, retry: 2 },
  );

  const count = data?.count ?? 0;
  const badgeLabel = count > 9 ? '9+' : String(count);

  return (
    <>
      <button
        type="button"
        aria-label={t('bellLabel', { count })}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-dune hover:bg-charcoal/[0.06] transition-colors"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-teal px-0.5 text-[10px] font-bold text-cream">
            {badgeLabel}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} side="right">
        <SheetHeader>
          <SheetTitle>{t('panelTitle')}</SheetTitle>
          <button
            type="button"
            aria-label={t('close')}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-dune hover:bg-charcoal/[0.06] transition-colors"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>
        <SheetContent className="p-0">
          <NotificationsPanel artifactId={artifactId} open={open} />
        </SheetContent>
      </Sheet>
    </>
  );
}
