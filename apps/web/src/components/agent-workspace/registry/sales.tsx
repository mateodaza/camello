'use client';

import { useState } from 'react';
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
import { KanbanBoard, KanbanLead } from '../sales/kanban-board';
import { LeadDetailSheet } from '../sales/lead-detail-sheet';
import { SalesAlerts } from '../sales/sales-alerts';
import { SalesPayments, LeadSummary, PaymentPrefill } from '../sales/sales-payments';
import { AfterHoursCard } from '../sales/after-hours-card';
import { fmtMoney, fmtDate, truncate } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, Users, Target, DollarSign, Timer } from 'lucide-react';

const STAGES = ['new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;
type Stage = typeof STAGES[number];
const SCORES = ['hot', 'warm', 'cold'] as const;

const STAGE_PROBABILITIES: Record<string, number> = {
  new: 0.1, qualifying: 0.2, proposal: 0.4, negotiation: 0.6, closed_won: 1, closed_lost: 0,
};

const SUPPORTED_CURRENCIES = ['USD', 'COP', 'MXN', 'BRL'];

function stageKey(s: string): string {
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

const scoreDots: Record<string, string> = { hot: 'bg-teal', warm: 'bg-gold', cold: 'bg-charcoal/30' };

const funnelColors: Record<string, string> = {
  new: '#00897B', qualifying: '#00897B', proposal: '#C9A84C',
  negotiation: '#C9A84C', closed_won: '#00897B', closed_lost: '#7A7268',
};

// ---------------------------------------------------------------------------
// SalesOverview — hero cards + funnel + sparklines + velocity + forecast
// ---------------------------------------------------------------------------

function SalesOverview({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const pipeline = trpc.agent.salesPipeline.useQuery({ artifactId });
  const funnel = trpc.agent.salesFunnel.useQuery({ artifactId });

  const stages = pipeline.data?.stages ?? [];
  const avgDaysToClose = pipeline.data?.avgDaysToClose ?? null;
  const sparklines = pipeline.data?.sparklines;

  const totalValue = stages.reduce((sum, s) => sum + Number(s.totalValue), 0);
  const wonValue = Number(stages.find((s) => s.stage === 'closed_won')?.totalValue ?? 0);
  const wonDeals = stages.find((s) => s.stage === 'closed_won')?.count ?? 0;
  const activeLeads = stages
    .filter((s) => s.stage !== 'closed_won' && s.stage !== 'closed_lost')
    .reduce((sum, s) => sum + s.count, 0);
  const totalLeads = stages.reduce((sum, s) => sum + s.count, 0);
  const winRate = totalLeads > 0 ? Math.round((wonDeals / totalLeads) * 100) : 0;
  const forecast = stages.reduce((sum, s) => sum + Number(s.totalValue) * (STAGE_PROBABILITIES[s.stage] ?? 0), 0);

  const newLeadsSpark = sparklines?.newLeadsDaily.map((d) => d.count) ?? [];
  const wonValueSpark = sparklines?.wonValueDaily.map((d) => Number(d.value)) ?? [];

  const funnelData = (funnel.data ?? []).filter((s) => s.count > 0);

  return (
    <div className="space-y-4">
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
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="rounded-lg bg-teal/10 p-2">
                  <DollarSign className="h-5 w-5 text-teal" />
                </div>
                {wonValueSpark.length > 0 && (
                  <Sparkline data={wonValueSpark} color="#00897B" className="h-6 w-20 opacity-70" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
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
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="rounded-lg bg-charcoal/5 p-2">
                  <TrendingUp className="h-5 w-5 text-charcoal/50" />
                </div>
                {newLeadsSpark.length > 0 && (
                  <Sparkline data={newLeadsSpark} color="#C9A84C" className="h-6 w-20 opacity-70" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-dune" />
              <span className="text-sm text-dune">{t('salesWinRate')}</span>
            </div>
            <p className={`mt-1 text-xl font-bold tabular-nums ${winRate >= 30 ? 'text-teal' : winRate >= 15 ? 'text-gold' : 'text-charcoal'}`}>
              {winRate}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-dune" />
              <span className="text-sm text-dune">{t('salesForecast')}</span>
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums">{fmtMoney(forecast, locale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-dune" />
              <span className="text-sm text-dune">{t('salesVelocity')}</span>
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {avgDaysToClose != null ? t('salesVelocityDays', { days: avgDaysToClose }) : '—'}
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
                        style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: funnelColors[s.stage] ?? '#00897B' }}
                      >
                        {s.count}
                      </div>
                    </div>
                    {i > 0 && funnelData[i - 1].count > 0 ? (
                      <span className="w-12 text-right text-xs text-dune">
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

  const query = trpc.agent.salesLeads.useQuery({
    artifactId,
    stage: (stage || undefined) as Stage | undefined,
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

  const tableData = query.data ?? [];

  return (
    <Tabs defaultValue="board">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold text-charcoal">{t('salesLeads')}</span>
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
                <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${scoreDots[row.score] ?? 'bg-charcoal/30'}`} />
                <div>
                  {row.conversationId ? (
                    <Link href={`/dashboard/conversations/${row.conversationId}`} className="font-medium text-charcoal hover:text-teal hover:underline">
                      {row.customerName ?? row.customerEmail ?? '—'}
                    </Link>
                  ) : (
                    <span className="cursor-pointer font-medium text-charcoal hover:text-teal" onClick={() => onLeadClick(row.id)}>
                      {row.customerName ?? row.customerEmail ?? '—'}
                    </span>
                  )}
                </div>
              </div>
            )},
            { key: 'stage', label: t('columnStage'), render: (row) => (
              <select
                value={row.stage}
                onChange={(e) => updateStage.mutate({ leadId: row.id, stage: e.target.value as Stage })}
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

function SalesQuotes({
  artifactId,
  onOpenRecordPayment,
}: {
  artifactId: string;
  onOpenRecordPayment: (prefill: PaymentPrefill | null) => void;
}) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();
  const { addToast } = useToast();
  const utils = trpc.useUtils();

  const query = trpc.agent.salesQuotes.useQuery({ artifactId, limit: 20, offset: 0 });

  const createPayment = trpc.agent.createPayment.useMutation({
    onSuccess: () => {
      utils.agent.salesPayments.invalidate();
      addToast(t('paymentCreated'), 'success');
    },
    onError: (err) => addToast(err.message, 'error'),
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
            const desc = lineItems.map((i) => truncate(String(i.description ?? ''), 40)).join(', ');
            onOpenRecordPayment({ description: desc, leadId: null });
            return;
          }
          if (noLead) {
            addToast(t('quoteNoLead'), 'error');
            const desc = lineItems.map((i) => truncate(String(i.description ?? ''), 40)).join(', ');
            onOpenRecordPayment({ description: desc, leadId: null });
            return;
          }
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
                  disabled={createPayment.isPending}
                  className="rounded-md border border-teal/40 px-2 py-0.5 text-xs font-medium text-teal hover:bg-teal/5 disabled:opacity-50"
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
  const locale = useLocale();
  const utils = trpc.useUtils();
  const { addToast } = useToast();

  // Shared state
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [recordPaymentPrefill, setRecordPaymentPrefill] = useState<PaymentPrefill | null>(null);

  // Shared queries
  const leadsQuery = trpc.agent.salesLeads.useQuery({ artifactId });
  const leadSummariesQuery = trpc.agent.salesLeadSummaries.useQuery({ artifactId });

  const kanbanLeads: KanbanLead[] = (leadsQuery.data ?? []).map((l) => ({
    id: l.id,
    score: l.score,
    stage: l.stage,
    estimatedValue: l.estimatedValue ?? null,
    qualifiedAt: l.qualifiedAt,
    customerName: l.customerName ?? null,
    customerEmail: l.customerEmail ?? null,
  }));

  const leadSummaries: LeadSummary[] = leadSummariesQuery.data ?? [];

  function openRecordPayment(prefill: PaymentPrefill | null) {
    setRecordPaymentPrefill(prefill);
    setRecordPaymentOpen(true);
  }

  // Shared updateLeadStage mutation
  const updateStage = trpc.agent.updateLeadStage.useMutation({
    onSuccess: () => {
      utils.agent.salesLeads.invalidate();
      utils.agent.salesPipeline.invalidate();
      utils.agent.salesFunnel.invalidate();
      utils.agent.salesLeadSummaries.invalidate();
      addToast(t('stageUpdated'), 'success');
    },
  });

  function handleStageChange(leadId: string, stage: Stage, closeReason?: string) {
    updateStage.mutate({ leadId, stage, closeReason });
  }

  return (
    <div className="space-y-6">
      {/* 1. After-hours ROI */}
      <AfterHoursCard artifactId={artifactId} />

      {/* 2. Alerts */}
      <SalesAlerts artifactId={artifactId} onLeadClick={setSelectedLeadId} />

      {/* 3. Overview + funnel */}
      <SalesOverview artifactId={artifactId} />

      {/* 4. Pipeline (kanban + table) */}
      <SalesPipeline
        artifactId={artifactId}
        leads={kanbanLeads}
        leadsLoading={leadsQuery.isLoading}
        leadsError={leadsQuery.isError}
        onLeadClick={setSelectedLeadId}
        onStageChange={handleStageChange}
      />

      {/* 5. Payments */}
      <SalesPayments
        artifactId={artifactId}
        leadSummaries={leadSummaries}
        recordPaymentOpen={recordPaymentOpen}
        recordPaymentPrefill={recordPaymentPrefill}
        onRecordPaymentClose={() => setRecordPaymentOpen(false)}
        onOpenRecordPayment={openRecordPayment}
      />

      {/* 6. Quotes */}
      <SalesQuotes artifactId={artifactId} onOpenRecordPayment={openRecordPayment} />

      {/* Lead detail sheet (global, controlled by selectedLeadId) */}
      <LeadDetailSheet
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onStageChange={handleStageChange}
      />
    </div>
  );
}

export const salesSections = [SalesWorkspace];
