'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { MetricsGrid } from '../primitives/metrics-grid';
import { DataTable } from '../primitives/data-table';
import { AlertList } from '../primitives/alert-list';
import { fmtDate } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';

const STATUSES = ['open', 'in_progress', 'waiting', 'closed'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const priorityColors: Record<string, string> = {
  urgent: 'escalated', high: 'escalated', medium: 'marketing', low: 'default',
};

/** Map snake_case status to i18n key suffix: "in_progress" → "InProgress" */
function statusKeyFor(s: string): string {
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function SupportOverview({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const query = trpc.agent.supportMetrics.useQuery(
    { artifactId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );
  const data = query.data;

  return (
    <MetricsGrid
      metrics={[
        { label: t('supportOpenTickets'), value: data?.openTickets ?? 0 },
        { label: t('supportResolutionRate'), value: `${data?.resolutionRate ?? 0}%` },
        { label: t('supportEscalations'), value: data?.escalatedConversations ?? 0 },
        { label: t('supportTotalTickets'), value: data?.totalTickets ?? 0 },
      ]}
      barChart={data?.topCategories && data.topCategories.length > 0 ? {
        bars: data.topCategories.map((c) => ({
          label: c.category ?? t('unknown'),
          value: c.count,
        })),
      } : undefined}
    />
  );
}

function SupportResolutionStats({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const query = trpc.agent.supportResolutionStats.useQuery(
    { artifactId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );
  const data = query.data;

  return (
    <MetricsGrid
      metrics={[
        { label: t('supportResolvedCount'), value: data?.resolvedCount ?? 0 },
        { label: t('supportAvgCsat'), value: data?.avgCsat != null ? `${data.avgCsat} ★` : '—' },
        { label: t('supportResolutionRate30d'), value: `${data?.resolutionRate ?? 0}%` },
      ]}
    />
  );
}

function SupportTickets({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();
  const { addToast } = useToast();
  const utils = trpc.useUtils();

  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [csatFor, setCsatFor] = useState<string | null>(null);

  const query = trpc.agent.supportTickets.useQuery(
    {
      artifactId,
      status: (status || undefined) as typeof STATUSES[number] | undefined,
      priority: (priority || undefined) as typeof PRIORITIES[number] | undefined,
    },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );

  const updateStatus = trpc.agent.updateTicketStatus.useMutation({
    onSuccess: () => {
      utils.agent.supportTickets.invalidate();
      utils.agent.supportMetrics.invalidate();
      addToast(t('ticketUpdated'), 'success');
    },
  });

  const resolveConversation = trpc.conversation.updateStatus.useMutation({
    onSuccess: (_data, vars) => {
      setCsatFor(vars.id);
      utils.agent.supportTickets.invalidate();
      utils.agent.supportResolutionStats.invalidate();
      addToast(t('ticketResolved'), 'success');
    },
  });

  const storeCsatRating = trpc.agent.storeCsatRating.useMutation({
    onSuccess: () => {
      setCsatFor(null);
      utils.agent.supportResolutionStats.invalidate();
      utils.agent.supportTickets.invalidate();
      addToast(t('csatSaved'), 'success');
    },
  });

  type TicketRow = NonNullable<typeof query.data>[number];

  return (
    <DataTable
      title={t('supportTickets')}
      columns={[
        { key: 'id', label: t('columnTicketId'), render: (row: TicketRow) => (
          <span className="font-mono text-xs">{row.id.slice(0, 8)}</span>
        )},
        { key: 'subject', label: t('columnSubject'), render: (row: TicketRow) => {
          const output = (row.output ?? {}) as Record<string, unknown>;
          return <span className="text-sm">{String(output.subject ?? output.summary ?? '—')}</span>;
        }},
        { key: 'priority', label: t('supportPriority'), render: (row: TicketRow) => {
          const output = (row.output ?? {}) as Record<string, unknown>;
          const p = String(output.priority ?? 'medium');
          return <Badge variant={priorityColors[p] ?? 'default'}>{t(`priority${p.charAt(0).toUpperCase()}${p.slice(1)}` as Parameters<typeof t>[0])}</Badge>;
        }},
        { key: 'status', label: t('supportStatus'), render: (row: TicketRow) => {
          const output = (row.output ?? {}) as Record<string, unknown>;
          const s = String(output.status ?? 'open');
          return (
            <select
              value={s}
              onChange={(e) => updateStatus.mutate({ executionId: row.id, status: e.target.value as typeof STATUSES[number] })}
              className="rounded border border-charcoal/15 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal"
            >
              {STATUSES.map((st) => <option key={st} value={st}>{t(`ticketStatus${statusKeyFor(st)}` as Parameters<typeof t>[0])}</option>)}
            </select>
          );
        }},
        { key: 'date', label: t('columnDate'), render: (row: TicketRow) => fmtDate(row.createdAt, locale) },
        { key: 'actions', label: '', render: (row: TicketRow) => {
          const isResolved = row.conversationStatus === 'resolved';
          const showCsat = csatFor === row.conversationId;

          if (isResolved && !showCsat) {
            return (
              <span className="flex items-center gap-1 text-xs text-dune">
                <span>{t('ticketResolvedLabel')}</span>
                {row.csat && <span className="text-gold">{'★'.repeat(Number(row.csat))}</span>}
              </span>
            );
          }

          if (showCsat) {
            return (
              <div className="flex items-center gap-1" role="group" aria-label={t('csatPrompt')}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => storeCsatRating.mutate({ conversationId: row.conversationId!, rating: star })}
                    className="text-lg leading-none text-dune hover:text-gold focus:text-gold min-h-[36px] min-w-[36px]"
                    aria-label={t('csatStarLabel', { star: String(star) })}
                  >
                    ★
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCsatFor(null)}
                  className="text-xs text-dune hover:underline ml-1"
                >
                  {t('skipCsat')}
                </button>
              </div>
            );
          }

          const ticketStatus = (row.output as { status?: string } | null)?.status;
          if (ticketStatus !== 'open') {
            return null;
          }

          return (
            <button
              type="button"
              disabled={resolveConversation.isPending || !row.conversationId}
              onClick={() => resolveConversation.mutate({ id: row.conversationId!, status: 'resolved' })}
              className="rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal hover:bg-teal/20 disabled:opacity-50 min-h-[36px]"
            >
              {t('resolveTicket')}
            </button>
          );
        }},
      ]}
      data={query.data}
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error ?? undefined}
      onRetry={() => query.refetch()}
      rowClassName={(row: TicketRow) =>
        row.conversationStatus === 'resolved' ? 'opacity-50' : ''
      }
      filters={[
        {
          key: 'status',
          label: t('supportStatus'),
          options: [{ value: '', label: t('filterAll') }, ...STATUSES.map((s) => ({ value: s, label: t(`ticketStatus${statusKeyFor(s)}` as Parameters<typeof t>[0]) }))],
          value: status,
          onChange: setStatus,
        },
        {
          key: 'priority',
          label: t('supportPriority'),
          options: [{ value: '', label: t('filterAll') }, ...PRIORITIES.map((p) => ({ value: p, label: t(`priority${p.charAt(0).toUpperCase()}${p.slice(1)}` as Parameters<typeof t>[0]) }))],
          value: priority,
          onChange: setPriority,
        },
      ]}
      emptyTitle={t('supportEmptyTitle')}
      emptyDescription={t('supportEmptyDesc')}
    />
  );
}

function SupportEscalations({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();
  const { addToast } = useToast();
  const utils = trpc.useUtils();

  const query = trpc.agent.supportEscalations.useQuery(
    { artifactId, limit: 20, offset: 0 },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );

  const acknowledge = trpc.agent.acknowledgeEscalation.useMutation({
    onSuccess: () => {
      utils.agent.supportEscalations.invalidate();
      utils.agent.supportMetrics.invalidate();
      addToast(t('escalationAcknowledged'), 'success');
    },
  });

  return (
    <AlertList
      title={t('supportEscalationsTitle')}
      items={query.data}
      renderAlert={(item) => (
        <div>
          <p className="text-sm font-medium">{item.customerName ?? item.customerEmail ?? '—'}</p>
          <p className="text-xs text-dune">{fmtDate(item.updatedAt, locale)}</p>
        </div>
      )}
      actionLabel={t('supportAcknowledge')}
      onAction={(item) => acknowledge.mutate({ conversationId: item.conversationId })}
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error ?? undefined}
      onRetry={() => query.refetch()}
      emptyTitle={t('supportNoEscalations')}
      emptyDescription={t('supportNoEscalationsDesc')}
    />
  );
}

function SupportKnowledgeGaps({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const query = trpc.agent.supportKnowledgeGaps.useQuery(
    { artifactId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );

  return (
    <DataTable
      title={t('supportKnowledgeGaps')}
      columns={[
        { key: 'intent', label: t('columnIntent'), render: (row) => (
          <Badge variant="default">{row.intent}</Badge>
        )},
        { key: 'count', label: t('columnOccurrences'), render: (row) => row.count },
        { key: 'lastSeen', label: t('columnLastSeen'), render: (row) => fmtDate(row.lastSeen, locale) },
        { key: 'action', label: '', render: () => (
          <Link href="/dashboard/knowledge" className="text-xs font-medium text-teal hover:underline">
            {t('supportAddToKnowledge')}
          </Link>
        )},
      ]}
      data={query.data}
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error ?? undefined}
      onRetry={() => query.refetch()}
      emptyTitle={t('supportEmptyTitle')}
      emptyDescription={t('supportEmptyDesc')}
    />
  );
}

export const supportSections = [SupportOverview, SupportResolutionStats, SupportTickets, SupportEscalations, SupportKnowledgeGaps];
