'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { MetricsGrid } from '../primitives/metrics-grid';
import { DataTable } from '../primitives/data-table';
import { CardFeed } from '../primitives/card-feed';
import { fmtCost, fmtDate, truncate } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';

const STAGES = ['new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;
const SCORES = ['hot', 'warm', 'cold'] as const;

const scoreColors: Record<string, string> = { hot: 'escalated', warm: 'marketing', cold: 'default' };

function SalesOverview({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const pipeline = trpc.agent.salesPipeline.useQuery({ artifactId });
  const funnel = trpc.agent.salesFunnel.useQuery({ artifactId });

  const stages = pipeline.data ?? [];
  const totalValue = stages.reduce((sum, s) => sum + Number(s.totalValue), 0);
  const hotLeads = stages.filter((s) => s.stage === 'qualifying' || s.stage === 'proposal')
    .reduce((sum, s) => sum + s.count, 0);
  const wonDeals = stages.find((s) => s.stage === 'closed_won')?.count ?? 0;
  const totalLeads = stages.reduce((sum, s) => sum + s.count, 0);
  const conversionRate = totalLeads > 0 ? Math.round((wonDeals / totalLeads) * 100) : 0;

  const funnelData = funnel.data ?? [];

  return (
    <MetricsGrid
      metrics={[
        { label: t('salesPipelineValue'), value: fmtCost(totalValue, locale) },
        { label: t('salesHotLeads'), value: hotLeads },
        { label: t('salesWonDeals'), value: wonDeals },
        { label: t('salesConversionRate'), value: `${conversionRate}%` },
      ]}
      barChart={funnelData.length > 0 ? {
        bars: funnelData.map((s) => ({
          label: t(`salesStage${s.stage.charAt(0).toUpperCase()}${s.stage.slice(1).replace(/_(\w)/g, (_, c: string) => c.toUpperCase())}` as Parameters<typeof t>[0]),
          value: s.count,
        })),
      } : undefined}
    />
  );
}

function SalesPipeline({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();
  const { addToast } = useToast();
  const utils = trpc.useUtils();

  const [stage, setStage] = useState('');
  const [score, setScore] = useState('');

  const query = trpc.agent.salesLeads.useQuery({
    artifactId,
    stage: (stage || undefined) as typeof STAGES[number] | undefined,
    score: (score || undefined) as typeof SCORES[number] | undefined,
  });

  const updateStage = trpc.agent.updateLeadStage.useMutation({
    onSuccess: () => {
      utils.agent.salesLeads.invalidate();
      utils.agent.salesPipeline.invalidate();
      utils.agent.salesFunnel.invalidate();
      addToast(t('stageUpdated'), 'success');
    },
  });

  return (
    <DataTable
      title={t('salesPipeline')}
      columns={[
        { key: 'customer', label: t('columnCustomer'), render: (row) => (
          <span className="font-medium">{row.customerName ?? row.customerEmail ?? '—'}</span>
        )},
        { key: 'score', label: t('columnScore'), render: (row) => (
          <Badge variant={scoreColors[row.score] ?? 'default'}>
            {t(`salesScore${row.score.charAt(0).toUpperCase()}${row.score.slice(1)}` as Parameters<typeof t>[0])}
          </Badge>
        )},
        { key: 'stage', label: t('columnStage'), render: (row) => (
          <select
            value={row.stage}
            onChange={(e) => updateStage.mutate({ leadId: row.id, stage: e.target.value as typeof STAGES[number] })}
            className="rounded border border-charcoal/15 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal"
            data-testid="stage-select"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {t(`salesStage${s.charAt(0).toUpperCase()}${s.slice(1).replace(/_(\w)/g, (_, c: string) => c.toUpperCase())}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        )},
        { key: 'value', label: t('columnValue'), render: (row) => fmtCost(row.estimatedValue ?? 0, locale) },
        { key: 'date', label: t('columnDate'), render: (row) => fmtDate(row.qualifiedAt, locale) },
      ]}
      data={query.data}
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error ?? undefined}
      onRetry={() => query.refetch()}
      filters={[
        {
          key: 'stage',
          label: t('columnStage'),
          options: [{ value: '', label: t('filterAllStages') }, ...STAGES.map((s) => ({
            value: s,
            label: t(`salesStage${s.charAt(0).toUpperCase()}${s.slice(1).replace(/_(\w)/g, (_, c: string) => c.toUpperCase())}` as Parameters<typeof t>[0]),
          }))],
          value: stage,
          onChange: setStage,
        },
        {
          key: 'score',
          label: t('columnScore'),
          options: [{ value: '', label: t('filterAllScores') }, ...SCORES.map((s) => ({
            value: s,
            label: t(`salesScore${s.charAt(0).toUpperCase()}${s.slice(1)}` as Parameters<typeof t>[0]),
          }))],
          value: score,
          onChange: setScore,
        },
      ]}
      emptyTitle={t('salesEmptyTitle')}
      emptyDescription={t('salesEmptyDesc')}
    />
  );
}

function SalesQuotes({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const query = trpc.agent.salesQuotes.useQuery({ artifactId, limit: 20, offset: 0 });

  return (
    <CardFeed
      title={t('salesQuotes')}
      items={query.data}
      renderCard={(item) => {
        const output = (item.output ?? {}) as Record<string, unknown>;
        const items = Array.isArray(output.items) ? output.items as Array<Record<string, unknown>> : [];
        const total = output.total != null ? Number(output.total) : null;

        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={item.status === 'executed' ? 'active' : 'default'} className="text-xs">
                {t(`status${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}` as Parameters<typeof t>[0])}
              </Badge>
              {total != null && (
                <span className="text-sm font-semibold">{fmtCost(total, locale)}</span>
              )}
              <span className="text-xs text-dune">{fmtDate(item.createdAt, locale)}</span>
            </div>
            {items.length > 0 && (
              <p className="text-xs text-dune">
                {items.map((i) => truncate(String(i.description ?? i.name ?? ''), 40)).join(', ')}
              </p>
            )}
          </div>
        );
      }}
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error ?? undefined}
      onRetry={() => query.refetch()}
      emptyTitle={t('salesQuotesEmpty')}
      emptyDescription={t('salesQuotesEmptyDesc')}
    />
  );
}

export const salesSections = [SalesOverview, SalesPipeline, SalesQuotes];
