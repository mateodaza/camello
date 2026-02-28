'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '../primitives/data-table';
import { CardFeed } from '../primitives/card-feed';
import { fmtMoney, fmtDate, truncate } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, Users, Target, DollarSign } from 'lucide-react';

const STAGES = ['new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;
const SCORES = ['hot', 'warm', 'cold'] as const;

/** Stage key helper: "closed_won" → "ClosedWon" */
function stageKey(s: string): string {
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

const scoreColors: Record<string, string> = { hot: 'escalated', warm: 'marketing', cold: 'default' };
const scoreDots: Record<string, string> = { hot: 'bg-teal', warm: 'bg-gold', cold: 'bg-charcoal/30' };

/** Funnel colors: early stages teal, late stages gold, closed use specific colors */
const funnelColors: Record<string, string> = {
  new: '#00897B',
  qualifying: '#00897B',
  proposal: '#C9A84C',
  negotiation: '#C9A84C',
  closed_won: '#00897B',
  closed_lost: '#7A7268',
};

function SalesOverview({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const pipeline = trpc.agent.salesPipeline.useQuery({ artifactId });
  const funnel = trpc.agent.salesFunnel.useQuery({ artifactId });

  const stages = pipeline.data ?? [];
  const totalValue = stages.reduce((sum, s) => sum + Number(s.totalValue), 0);
  const wonValue = Number(stages.find((s) => s.stage === 'closed_won')?.totalValue ?? 0);
  const wonDeals = stages.find((s) => s.stage === 'closed_won')?.count ?? 0;
  const hotLeads = stages
    .filter((s) => s.stage !== 'closed_won' && s.stage !== 'closed_lost')
    .reduce((sum, s) => sum + s.count, 0);
  const hotValue = stages
    .filter((s) => s.stage !== 'closed_won' && s.stage !== 'closed_lost')
    .reduce((sum, s) => sum + Number(s.totalValue), 0);
  const totalLeads = stages.reduce((sum, s) => sum + s.count, 0);
  const winRate = totalLeads > 0 ? Math.round((wonDeals / totalLeads) * 100) : 0;

  const funnelData = (funnel.data ?? []).filter((s) => s.count > 0);

  return (
    <div className="space-y-4">
      {/* Hero row: Revenue earned + Pipeline value */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Revenue earned (the money question) */}
        <Card className="border-teal/20 bg-teal/5">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-dune">{t('salesRevenueEarned')}</p>
                <p className="mt-1 font-heading text-3xl font-bold text-charcoal tabular-nums">
                  {fmtMoney(wonValue, locale)}
                </p>
                <p className="mt-1 text-sm text-dune">
                  {t('salesWonDealsCount', { count: wonDeals })}
                </p>
              </div>
              <div className="rounded-lg bg-teal/10 p-2">
                <DollarSign className="h-5 w-5 text-teal" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline value (money in play) */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-dune">{t('salesPipelineValue')}</p>
                <p className="mt-1 font-heading text-3xl font-bold text-charcoal tabular-nums">
                  {fmtMoney(totalValue, locale)}
                </p>
                <p className="mt-1 text-sm text-dune">
                  {t('salesActiveLeads', { count: hotLeads })}
                </p>
              </div>
              <div className="rounded-lg bg-charcoal/5 p-2">
                <TrendingUp className="h-5 w-5 text-charcoal/50" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-dune" />
              <span className="text-sm text-dune">{t('salesHotLeads')}</span>
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums">{hotLeads}</p>
            {hotValue > 0 && (
              <p className="text-xs text-dune">{fmtMoney(hotValue, locale)} {t('salesPotential')}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-dune" />
              <span className="text-sm text-dune">{t('salesWinRate')}</span>
            </div>
            <p className={`mt-1 text-xl font-bold tabular-nums ${winRate >= 30 ? 'text-teal' : winRate >= 15 ? 'text-gold' : 'text-charcoal'}`}>
              {winRate}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <span className="text-sm text-dune">{t('salesTotalLeads')}</span>
            <p className="mt-1 text-xl font-bold tabular-nums">{totalLeads}</p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel */}
      {funnelData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('salesFunnel')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {funnelData.map((s, i) => {
                const maxCount = Math.max(...funnelData.map((f) => f.count), 1);
                const pct = Math.round((s.count / maxCount) * 100);
                return (
                  <div key={s.stage} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-right text-sm text-dune">
                      {t(`salesStage${stageKey(s.stage)}` as Parameters<typeof t>[0])}
                    </span>
                    <div className="relative h-7 flex-1 rounded bg-charcoal/5">
                      <div
                        className="flex h-7 items-center rounded px-2 text-xs font-medium text-white transition-all"
                        style={{
                          width: `${Math.max(pct, 8)}%`,
                          backgroundColor: funnelColors[s.stage] ?? '#00897B',
                        }}
                      >
                        {s.count}
                      </div>
                    </div>
                    {/* Drop-off indicator between stages */}
                    {i > 0 && funnelData[i - 1].count > 0 && (
                      <span className="w-12 text-right text-xs text-dune">
                        {Math.round((s.count / funnelData[i - 1].count) * 100)}%
                      </span>
                    )}
                    {i === 0 && <span className="w-12" />}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
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
      title={t('salesLeads')}
      columns={[
        { key: 'customer', label: t('columnCustomer'), render: (row) => (
          <div className="flex items-center gap-2">
            {/* Score dot indicator */}
            <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${scoreDots[row.score] ?? 'bg-charcoal/30'}`}
              title={t(`salesScore${row.score.charAt(0).toUpperCase()}${row.score.slice(1)}` as Parameters<typeof t>[0])}
            />
            <div>
              {row.conversationId ? (
                <Link
                  href={`/dashboard/conversations/${row.conversationId}`}
                  className="font-medium text-charcoal hover:text-teal hover:underline"
                >
                  {row.customerName ?? row.customerEmail ?? '—'}
                </Link>
              ) : (
                <span className="font-medium">{row.customerName ?? row.customerEmail ?? '—'}</span>
              )}
            </div>
          </div>
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
                {t(`salesStage${stageKey(s)}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        )},
        { key: 'value', label: t('columnValue'), render: (row) => (
          <span className="font-semibold tabular-nums">{fmtMoney(row.estimatedValue ?? 0, locale)}</span>
        )},
        { key: 'date', label: t('columnDate'), render: (row) => (
          <span className="text-dune">{fmtDate(row.qualifiedAt, locale)}</span>
        )},
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
            label: t(`salesStage${stageKey(s)}` as Parameters<typeof t>[0]),
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
        const lineItems = Array.isArray(output.items) ? output.items as Array<Record<string, unknown>> : [];
        const total = output.total != null ? Number(output.total) : null;

        return (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={item.status === 'executed' ? 'active' : 'default'} className="text-xs">
                  {t(`status${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}` as Parameters<typeof t>[0])}
                </Badge>
                <span className="text-xs text-dune">{fmtDate(item.createdAt, locale)}</span>
              </div>
              {lineItems.length > 0 && (
                <p className="truncate text-sm text-dune">
                  {lineItems.map((i) => truncate(String(i.description ?? i.name ?? ''), 40)).join(', ')}
                </p>
              )}
            </div>
            {total != null && (
              <span className="shrink-0 text-lg font-bold tabular-nums text-charcoal">
                {fmtMoney(total, locale)}
              </span>
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
