'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable } from '../primitives/data-table';
import { CardFeed } from '../primitives/card-feed';
import { Sparkline } from '../primitives/sparkline';
import { BarChartCss } from '../primitives/bar-chart-css';
import { KanbanBoard, KanbanLead } from '../sales/kanban-board';
import { LeadDetailSheet } from '../sales/lead-detail-sheet';
import { SalesAlerts } from '../sales/sales-alerts';
// SalesPayments import removed — payments section hidden until gateway (Wompi) integration.
// Re-add: import { SalesPayments, LeadSummary, PaymentPrefill } from '../sales/sales-payments';
import { AfterHoursCard } from '../sales/after-hours-card';
import { fmtMoney, fmtDate, truncate } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { Trophy, Crosshair, Gauge, DollarSign, TrendingUp, BarChart2 } from 'lucide-react';
import { STAGES, SCORES, type Stage, scoreDots, stageKey } from '../sales/constants';

const STAGE_PROBABILITIES: Record<string, number> = {
  new: 0.1, qualifying: 0.2, proposal: 0.4, negotiation: 0.6, closed_won: 1, closed_lost: 0,
};

// ---------------------------------------------------------------------------
// DeltaBadge — period-over-period comparison badge
// ---------------------------------------------------------------------------

interface DeltaBadgeProps {
  current: number;
  pct: number | null;
  format?: 'count' | 'currency';
  locale?: string;
}

function DeltaBadge({ current, pct, format = 'count', locale }: DeltaBadgeProps) {
  const t = useTranslations('agentWorkspace');

  if (pct === null && current === 0) {
    return <span className="text-xs text-dune">—</span>;
  }
  if (pct === null && current > 0) {
    const text = format === 'currency'
      ? t('salesComparisonBadgeCurrencyNew', { amount: fmtMoney(current, locale!) })
      : t('salesComparisonBadgeCountNew', { count: current });
    return <span className="text-xs font-medium text-teal">{text}</span>;
  }
  if (pct === null || pct === 0) {
    return <span className="text-xs text-dune">—</span>;
  }
  if (pct > 0) {
    return <span className="text-xs font-medium text-teal">↑{pct}%</span>;
  }
  return <span className="text-xs font-medium" style={{ color: 'var(--color-sunset)' }}>↓{Math.abs(pct)}%</span>;
}

const SUPPORTED_CURRENCIES = ['USD', 'COP', 'MXN', 'BRL'];

const funnelColors: Record<string, string> = {
  new: 'var(--color-teal)', qualifying: 'var(--color-teal)', proposal: 'var(--color-gold)',
  negotiation: 'var(--color-gold)', closed_won: 'var(--color-teal)', closed_lost: 'var(--color-dune)',
};

// ---------------------------------------------------------------------------
// ForecastCard — 30-day revenue forecast with per-stage breakdown
// ---------------------------------------------------------------------------

interface ForecastData {
  totalForecast: number;
  stages: Array<{
    stage: string;
    leadCount: number;
    pipelineValue: number;
    conversionRate: number;
    isFallback: boolean;
    forecastValue: number;
  }>;
}

function ForecastCard({ artifactId: _artifactId, salesForecast }: { artifactId: string; salesForecast: ForecastData | undefined }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('salesForecast30d')}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-bold tabular-nums text-charcoal">
          {fmtMoney(salesForecast?.totalForecast ?? 0, locale)}
        </p>
        {salesForecast && salesForecast.stages.length > 0 ? (
          <div className="mt-3 space-y-2">
            {salesForecast.stages.map((s) => (
              <div key={s.stage} className="flex items-center justify-between text-sm">
                <span className="text-dune">
                  {t(`salesStage${stageKey(s.stage)}` as Parameters<typeof t>[0])}
                </span>
                <span className="text-dune">
                  {Math.round(s.conversionRate * 100)}%
                  {s.isFallback && (
                    <span className="ml-1 text-xs text-dune/70">({t('salesForecastEstimated')})</span>
                  )}
                </span>
                <span className="tabular-nums text-charcoal">{fmtMoney(s.forecastValue, locale)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-dune">{t('salesForecastEmpty')}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SalesOverview — hero cards + funnel + sparklines + velocity + forecast
// ---------------------------------------------------------------------------

function SalesOverview({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const pipeline = trpc.agent.salesPipeline.useQuery(
    { artifactId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
  );
  const funnel = trpc.agent.salesFunnel.useQuery({ artifactId });
  const sourceBreakdown = trpc.agent.salesSourceBreakdown.useQuery({ artifactId });
  const comparison = trpc.agent.salesComparison.useQuery(
    { artifactId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
  );
  const salesForecast = trpc.agent.salesForecast.useQuery(
    { artifactId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
  );

  const stages = pipeline.data?.stages ?? [];
  const avgDaysToClose = pipeline.data?.avgDaysToClose ?? null;
  const sparklines = pipeline.data?.sparklines;

  const { totalValue, wonValue, wonDeals, activeLeads, totalLeads, winRate, forecast } = useMemo(() => {
    const tv = stages.reduce((sum, s) => sum + Number(s.totalValue), 0);
    const wv = Number(stages.find((s) => s.stage === 'closed_won')?.totalValue ?? 0);
    const wd = stages.find((s) => s.stage === 'closed_won')?.count ?? 0;
    const al = stages.filter((s) => s.stage !== 'closed_won' && s.stage !== 'closed_lost').reduce((sum, s) => sum + s.count, 0);
    const tl = stages.reduce((sum, s) => sum + s.count, 0);
    return {
      totalValue: tv,
      wonValue: wv,
      wonDeals: wd,
      activeLeads: al,
      totalLeads: tl,
      winRate: tl > 0 ? Math.round((wd / tl) * 100) : 0,
      forecast: stages.reduce((sum, s) => sum + Number(s.totalValue) * (STAGE_PROBABILITIES[s.stage] ?? 0), 0),
    };
  }, [stages]);

  const newLeadsSpark = useMemo(() => sparklines?.newLeadsDaily.map((d) => d.count) ?? [], [sparklines]);
  const wonValueSpark = useMemo(() => sparklines?.wonValueDaily.map((d) => Number(d.value)) ?? [], [sparklines]);

  const { funnelData, maxCount } = useMemo(() => {
    const fd = (funnel.data ?? []).filter((s) => s.count > 0);
    return { funnelData: fd, maxCount: Math.max(...fd.map((f) => f.count), 1) };
  }, [funnel.data]);

  return (
    <div className="space-y-5">
      <h2 className="font-heading text-lg font-semibold text-charcoal">{t('salesOverviewTitle')}</h2>

      {/* Hero row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-teal/20 bg-teal/5">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-dune">{t('salesRevenueEarned')}</p>
                <p className="mt-1 font-heading text-3xl font-bold text-charcoal tabular-nums">
                  {fmtMoney(wonValue, locale)}
                </p>
                <p className="mt-1 text-sm text-dune">
                  {t('salesWonDealsCount', { count: wonDeals })}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <DeltaBadge
                    current={comparison.data?.thisWeek.wonDeals ?? 0}
                    pct={comparison.data?.deltas.wonDeals ?? null}
                    format="count"
                  />
                  <span className="text-xs text-dune">{t('salesComparisonVsLastWeek')}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="rounded-lg bg-teal/15 p-2.5">
                  <DollarSign className="h-5 w-5 text-teal" />
                </div>
                {wonValueSpark.length > 0 && (
                  <Sparkline data={wonValueSpark} color="var(--color-teal)" className="h-6 w-20 opacity-70" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gold/20 bg-gold/5">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-dune">{t('salesPipelineValue')}</p>
                <p className="mt-1 font-heading text-3xl font-bold text-charcoal tabular-nums">
                  {fmtMoney(totalValue, locale)}
                </p>
                <p className="mt-1 text-sm text-dune">
                  {t('salesActiveLeads', { count: activeLeads })}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <DeltaBadge
                    current={comparison.data?.thisWeek.newLeads ?? 0}
                    pct={comparison.data?.deltas.newLeads ?? null}
                    format="count"
                  />
                  <span className="text-xs text-dune">{t('salesComparisonVsLastWeek')}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="rounded-lg bg-gold/15 p-2.5">
                  <TrendingUp className="h-5 w-5 text-gold" />
                </div>
                {newLeadsSpark.length > 0 && (
                  <Sparkline data={newLeadsSpark} color="var(--color-gold)" className="h-6 w-20 opacity-70" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* This Week comparison card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('salesComparisonTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 divide-x divide-charcoal/10 sm:grid-cols-4">
            <div className="px-4 first:pl-0 last:pr-0">
              <p className="text-xs font-medium text-dune">{t('salesComparisonNewLeads')}</p>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">
                {comparison.data?.thisWeek.newLeads ?? 0}
              </p>
              <div className="mt-0.5">
                <DeltaBadge
                  current={comparison.data?.thisWeek.newLeads ?? 0}
                  pct={comparison.data?.deltas.newLeads ?? null}
                  format="count"
                />
              </div>
            </div>
            <div className="px-4 first:pl-0 last:pr-0">
              <p className="text-xs font-medium text-dune">{t('salesComparisonWonDeals')}</p>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">
                {comparison.data?.thisWeek.wonDeals ?? 0}
              </p>
              <div className="mt-0.5">
                <DeltaBadge
                  current={comparison.data?.thisWeek.wonDeals ?? 0}
                  pct={comparison.data?.deltas.wonDeals ?? null}
                  format="count"
                />
              </div>
            </div>
            <div className="px-4 first:pl-0 last:pr-0">
              <p className="text-xs font-medium text-dune">{t('salesComparisonRevenue')}</p>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">
                {fmtMoney(comparison.data?.thisWeek.totalRevenue ?? 0, locale)}
              </p>
              <div className="mt-0.5">
                <DeltaBadge
                  current={comparison.data?.thisWeek.totalRevenue ?? 0}
                  pct={comparison.data?.deltas.totalRevenue ?? null}
                  format="currency"
                  locale={locale}
                />
              </div>
            </div>
            <div className="px-4 first:pl-0 last:pr-0">
              <p className="text-xs font-medium text-dune">{t('salesComparisonConversations')}</p>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">
                {comparison.data?.thisWeek.conversations ?? 0}
              </p>
              <div className="mt-0.5">
                <DeltaBadge
                  current={comparison.data?.thisWeek.conversations ?? 0}
                  pct={comparison.data?.deltas.conversations ?? null}
                  format="count"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats strip — single card, divided, breaks the 4-card grid pattern */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 divide-x divide-charcoal/10 sm:grid-cols-4">
            <div className="px-4 first:pl-0 last:pr-0">
              <div className="flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-dune" />
                <span className="text-xs font-medium text-dune">{t('salesWinRate')}</span>
              </div>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">
                {winRate}%
                {winRate >= 30 && <span aria-hidden="true" className="ml-1.5 inline-block h-2 w-2 rounded-full bg-teal" />}
                {winRate >= 15 && winRate < 30 && <span aria-hidden="true" className="ml-1.5 inline-block h-2 w-2 rounded-full bg-gold" />}
              </p>
            </div>
            <div className="px-4 first:pl-0 last:pr-0">
              <div className="flex items-center gap-1.5">
                <Crosshair className="h-3.5 w-3.5 text-dune" />
                <span className="text-xs font-medium text-dune">{t('salesForecast')}</span>
              </div>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">{fmtMoney(salesForecast.data?.totalForecast ?? forecast, locale)}</p>
            </div>
            <div className="px-4 first:pl-0 last:pr-0">
              <div className="flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-dune" />
                <span className="text-xs font-medium text-dune">{t('salesVelocity')}</span>
              </div>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">
                {avgDaysToClose != null ? t('salesVelocityDays', { days: avgDaysToClose }) : '—'}
              </p>
            </div>
            <div className="px-4 first:pl-0 last:pr-0">
              <div className="flex items-center gap-1.5">
                <BarChart2 className="h-3.5 w-3.5 text-dune" />
                <span className="text-xs font-medium text-dune">{t('salesTotalLeads')}</span>
              </div>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">{totalLeads}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ForecastCard artifactId={artifactId} salesForecast={salesForecast.data} />

      {/* Funnel */}
      {funnelData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('salesFunnel')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {funnelData.map((s, i) => {
                const pct = Math.round((s.count / maxCount) * 100);
                return (
                  <div key={s.stage} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-right text-sm text-dune">
                      {t(`salesStage${stageKey(s.stage)}` as Parameters<typeof t>[0])}
                    </span>
                    <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-charcoal/5">
                      <div
                        className="flex h-8 items-center rounded-md px-2.5 text-xs font-semibold text-white transition-all"
                        style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: funnelColors[s.stage] ?? 'var(--color-teal)' }}
                      >
                        {s.count}
                      </div>
                    </div>
                    {i > 0 && funnelData[i - 1].count > 0 ? (
                      <span className="w-12 text-right text-xs tabular-nums text-dune">
                        {Math.round((s.count / funnelData[i - 1].count) * 100)}%
                      </span>
                    ) : <span className="w-12" />}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source breakdown */}
      {sourceBreakdown.data && sourceBreakdown.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('salesSourceBreakdownTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartCss
              bars={sourceBreakdown.data.map(r => ({
                label: t(`sourceChannel${r.channel.charAt(0).toUpperCase()}${r.channel.slice(1)}` as Parameters<typeof t>[0]),
                value: r.count,
              }))}
              ariaLabel={t('salesSourceBreakdownTitle')}
            />
          </CardContent>
        </Card>
      )}

      {/* After-hours ROI */}
      <AfterHoursCard artifactId={artifactId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SalesPipeline — Board (kanban) + Table tabs
// ---------------------------------------------------------------------------

function SalesPipeline({
  artifactId,
  leads,
  leadsLoading,
  leadsError,
  onLeadClick,
  onStageChange,
}: {
  artifactId: string;
  leads: KanbanLead[];
  leadsLoading: boolean;
  leadsError: boolean;
  onLeadClick: (id: string) => void;
  onStageChange: (leadId: string, stage: Stage) => void;
}) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();
  const utils = trpc.useUtils();
  const { addToast } = useToast();

  const [stage, setStage] = useState('');
  const [score, setScore] = useState('');

  const query = trpc.agent.salesLeads.useQuery(
    {
      artifactId,
      stage: (stage || undefined) as Stage | undefined,
      score: (score || undefined) as typeof SCORES[number] | undefined,
    },
    { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
  );

  const updateStage = trpc.agent.updateLeadStage.useMutation({
    onSuccess: () => {
      utils.agent.salesLeads.invalidate();
      utils.agent.salesPipeline.invalidate();
      utils.agent.salesFunnel.invalidate();
      addToast(t('stageUpdated'), 'success');
    },
    onError: () => addToast(t('errorLoading'), 'error'),
  });

  const tableData = query.data ?? [];

  return (
    <Tabs defaultValue="board">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-charcoal">{t('salesLeads')}</h2>
        <TabsList>
          <TabsTrigger value="board">{t('viewBoard')}</TabsTrigger>
          <TabsTrigger value="table">{t('viewTable')}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="board">
        {leadsLoading && <p className="py-4 text-sm text-dune">{t('loading')}</p>}
        {!leadsLoading && (
          <KanbanBoard
            leads={leads}
            onStageChange={onStageChange}
            onLeadClick={onLeadClick}
            isPending={updateStage.isPending}
          />
        )}
      </TabsContent>

      <TabsContent value="table">
        <DataTable
          title=""
          columns={[
            { key: 'customer', label: t('columnCustomer'), render: (row) => (
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${scoreDots[row.score] ?? 'bg-charcoal/30'}`}
                  role="img"
                  aria-label={t('scoreLabel', { score: row.score })}
                />
                <div>
                  {row.conversationId ? (
                    <Link href={`/dashboard/conversations/${row.conversationId}`} className="font-medium text-charcoal hover:text-teal hover:underline">
                      {row.customerName ?? row.customerEmail ?? '—'}
                    </Link>
                  ) : (
                    <button type="button" className="font-medium text-charcoal hover:text-teal" onClick={() => onLeadClick(row.id)}>
                      {row.customerName ?? row.customerEmail ?? '—'}
                    </button>
                  )}
                </div>
              </div>
            )},
            { key: 'stage', label: t('columnStage'), render: (row) => (
              <select
                value={row.stage}
                onChange={(e) => updateStage.mutate({ leadId: row.id, stage: e.target.value as Stage })}
                aria-label={t('changeStageFor', { name: row.customerName ?? row.customerEmail ?? '—' })}
                className="rounded border border-charcoal/15 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal"
              >
                {STAGES.map((s) => <option key={s} value={s}>{t(`salesStage${stageKey(s)}` as Parameters<typeof t>[0])}</option>)}
              </select>
            )},
            { key: 'value', label: t('columnValue'), render: (row) => (
              <span className="font-semibold tabular-nums">{fmtMoney(row.estimatedValue ?? 0, locale)}</span>
            )},
            { key: 'date', label: t('columnDate'), render: (row) => (
              <span className="text-dune">{fmtDate(row.qualifiedAt, locale)}</span>
            )},
          ]}
          data={tableData}
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error ?? undefined}
          onRetry={() => query.refetch()}
          filters={[
            {
              key: 'stage',
              label: t('columnStage'),
              options: [{ value: '', label: t('filterAllStages') }, ...STAGES.map((s) => ({ value: s, label: t(`salesStage${stageKey(s)}` as Parameters<typeof t>[0]) }))],
              value: stage,
              onChange: setStage,
            },
            {
              key: 'score',
              label: t('columnScore'),
              options: [{ value: '', label: t('filterAllScores') }, ...SCORES.map((s) => ({ value: s, label: t(`salesScore${s.charAt(0).toUpperCase()}${s.slice(1)}` as Parameters<typeof t>[0]) }))],
              value: score,
              onChange: setScore,
            },
          ]}
          emptyTitle={t('salesEmptyTitle')}
          emptyDescription={t('salesEmptyDesc')}
        />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// SalesQuotes — quote feed with Convert to Payment
// ---------------------------------------------------------------------------

function SalesQuotes({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();
  const { addToast } = useToast();
  const utils = trpc.useUtils();

  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null);

  const query = trpc.agent.salesQuotes.useQuery({ artifactId, limit: 20, offset: 0 });

  const createPayment = trpc.agent.createPayment.useMutation({
    onSuccess: () => {
      utils.agent.salesPayments.invalidate();
      addToast(t('paymentCreated'), 'success');
      setPendingQuoteId(null);
    },
    onError: (err) => {
      addToast(err.message, 'error');
      setPendingQuoteId(null);
    },
  });

  return (
    <CardFeed
      title={t('salesQuotes')}
      items={query.data}
      renderCard={(item) => {
        const output = (item.output ?? {}) as Record<string, unknown>;
        const lineItems = Array.isArray(output.items) ? output.items as Array<Record<string, unknown>> : [];
        const total = output.total != null ? Number(output.total) : null;
        const currency = (output.currency as string | undefined) ?? 'USD';

        const canConvert = SUPPORTED_CURRENCIES.includes(currency) && item.leadId != null;
        const unsupportedCurrency = !SUPPORTED_CURRENCIES.includes(currency);
        const noLead = item.leadId == null;

        function handleConvert() {
          if (unsupportedCurrency) {
            addToast(t('quoteUnsupportedCurrency', { currency }), 'error');
            return;
          }
          if (noLead) {
            addToast(t('quoteNoLead'), 'error');
            return;
          }
          setPendingQuoteId(item.id);
          const desc = lineItems.map((i) => `${i.description} ×${i.quantity}`).join(', ');
          createPayment.mutate({
            artifactId,
            quoteExecutionId: item.id,
            leadId: item.leadId!,
            conversationId: item.conversationId ?? undefined,
            customerId: item.customerId ?? undefined,
            amount: total!,
            currency: currency as 'USD' | 'COP' | 'MXN' | 'BRL',
            description: desc,
          });
        }

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
            <div className="flex shrink-0 flex-col items-end gap-1">
              {total != null && (
                <span className="text-lg font-bold tabular-nums text-charcoal">{fmtMoney(total, locale)}</span>
              )}
              {item.status === 'executed' && total != null && (
                <button
                  onClick={handleConvert}
                  disabled={pendingQuoteId === item.id}
                  className="rounded-md border border-teal/40 px-3 py-2 text-xs font-medium text-teal hover:bg-teal/5 disabled:opacity-50"
                >
                  {t('convertToPayment')}
                </button>
              )}
            </div>
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

// ---------------------------------------------------------------------------
// SalesWorkspace — owns all cross-section state
// ---------------------------------------------------------------------------

export function SalesWorkspace({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const utils = trpc.useUtils();
  const { addToast } = useToast();

  // Shared state
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Shared queries
  const leadsQuery = trpc.agent.salesLeads.useQuery(
    { artifactId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
  );

  const kanbanLeads = useMemo<KanbanLead[]>(() =>
    (leadsQuery.data ?? []).map((l) => ({
      id: l.id,
      score: l.score,
      stage: l.stage,
      estimatedValue: l.estimatedValue ?? null,
      qualifiedAt: l.qualifiedAt,
      customerName: l.customerName ?? null,
      customerEmail: l.customerEmail ?? null,
    })),
    [leadsQuery.data],
  );

  // Shared updateLeadStage mutation
  const updateStage = trpc.agent.updateLeadStage.useMutation({
    onSuccess: () => {
      utils.agent.salesLeads.invalidate();
      utils.agent.salesPipeline.invalidate();
      utils.agent.salesFunnel.invalidate();
      addToast(t('stageUpdated'), 'success');
    },
    onError: () => addToast(t('errorLoading'), 'error'),
  });

  const handleStageChange = useCallback((leadId: string, stage: Stage, closeReason?: string) => {
    updateStage.mutate({ leadId, stage, closeReason });
  }, [updateStage]);

  const handleCloseSheet = useCallback(() => setSelectedLeadId(null), []);

  return (
    <div className="space-y-6">
      {/* 1. Alerts */}
      <SalesAlerts artifactId={artifactId} onLeadClick={setSelectedLeadId} />

      {/* 2. Overview + funnel + after-hours ROI */}
      <SalesOverview artifactId={artifactId} />

      {/* 3. Pipeline (kanban + table) */}
      <SalesPipeline
        artifactId={artifactId}
        leads={kanbanLeads}
        leadsLoading={leadsQuery.isLoading}
        leadsError={leadsQuery.isError}
        onLeadClick={setSelectedLeadId}
        onStageChange={handleStageChange}
      />

      {/* 4. Quotes */}
      <SalesQuotes artifactId={artifactId} />

      {/* Lead detail sheet (global, controlled by selectedLeadId) */}
      <LeadDetailSheet
        leadId={selectedLeadId}
        onClose={handleCloseSheet}
        onStageChange={handleStageChange}
      />
    </div>
  );
}

export const salesSections = [SalesWorkspace];
