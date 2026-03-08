'use client';

import { useState, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { localDateStr, thirtyDaysAgoStr, fmtCost, fmtMicroCost, fmtInt, fmtDateTime, fmtMoney } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard, Metric } from '@/components/stat-card';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChartCss } from '@/components/agent-workspace/primitives/bar-chart-css';
import { AgentPerformance } from '@/components/agent-workspace/performance-panel';
import { DeltaBadge, ForecastCard } from '@/components/agent-workspace/registry/sales';

// ---------------------------------------------------------------------------
// SalesComparisonSection — week-over-week deltas for a sales agent
// ---------------------------------------------------------------------------

function SalesComparisonSection({ artifactId }: { artifactId: string }) {
  const taw = useTranslations('agentWorkspace');
  const locale = useLocale();
  const comparison = trpc.agent.salesComparison.useQuery({ artifactId });

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="grid grid-cols-2 divide-x divide-charcoal/10 sm:grid-cols-4">
          <div className="px-4 first:pl-0 last:pr-0">
            <p className="text-xs font-medium text-dune">{taw('salesComparisonNewLeads')}</p>
            <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">
              {comparison.data?.thisWeek.newLeads ?? 0}
            </p>
            <div className="mt-0.5">
              <DeltaBadge
                current={comparison.data?.thisWeek.newLeads ?? 0}
                pct={comparison.data?.deltas.newLeads ?? null}
              />
            </div>
          </div>
          <div className="px-4 first:pl-0 last:pr-0">
            <p className="text-xs font-medium text-dune">{taw('salesComparisonWonDeals')}</p>
            <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">
              {comparison.data?.thisWeek.wonDeals ?? 0}
            </p>
            <div className="mt-0.5">
              <DeltaBadge
                current={comparison.data?.thisWeek.wonDeals ?? 0}
                pct={comparison.data?.deltas.wonDeals ?? null}
              />
            </div>
          </div>
          <div className="px-4 first:pl-0 last:pr-0">
            <p className="text-xs font-medium text-dune">{taw('salesComparisonRevenue')}</p>
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
            <p className="text-xs font-medium text-dune">{taw('salesComparisonConversations')}</p>
            <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">
              {comparison.data?.thisWeek.conversations ?? 0}
            </p>
            <div className="mt-0.5">
              <DeltaBadge
                current={comparison.data?.thisWeek.conversations ?? 0}
                pct={comparison.data?.deltas.conversations ?? null}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ForecastSection — 30-day forecast for a sales agent
// ---------------------------------------------------------------------------

function ForecastSection({ artifactId }: { artifactId: string }) {
  const salesForecast = trpc.agent.salesForecast.useQuery({ artifactId });
  return <ForecastCard artifactId={artifactId} salesForecast={salesForecast.data} />;
}

// ---------------------------------------------------------------------------
// AnalyticsPage
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const t = useTranslations('analytics');
  const tc = useTranslations('common');
  const locale = useLocale();

  // --- Date range (local time) ---
  const [from, setFrom] = useState(thirtyDaysAgoStr);
  const [to, setTo] = useState(localDateStr);

  // Ensure from <= to; swap if inverted
  const validFrom = from <= to ? from : to;
  const validTo = from <= to ? to : from;
  const dateSwapped = from > to;

  // --- Unified agent selector ---
  const [selectedArtifactId, setSelectedArtifactId] = useState('');

  // --- Queries ---
  const overview = trpc.analytics.overview.useQuery({ from: validFrom, to: validTo });
  const artifacts = trpc.artifact.list.useQuery({ activeOnly: false });

  const artifactMetrics = trpc.analytics.artifactMetrics.useQuery(
    { artifactId: selectedArtifactId, from: validFrom, to: validTo },
    { enabled: !!selectedArtifactId },
  );

  const recentLogs = trpc.analytics.recentLogs.useQuery({
    artifactId: selectedArtifactId || undefined,
    limit: 50,
  });

  const usageRecords = trpc.analytics.usage.useQuery({ limit: 6 });

  // --- Derived ---
  const selectedArtifact = artifacts.data?.find((a) => a.id === selectedArtifactId);
  const isSalesAgent = selectedArtifact?.type === 'sales';

  const intentBars = useMemo(() => {
    if (!selectedArtifactId || !recentLogs.data) return [];
    const freq: Record<string, number> = {};
    for (const log of recentLogs.data) {
      if (log.intent) freq[log.intent] = (freq[log.intent] ?? 0) + 1;
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));
  }, [recentLogs.data, selectedArtifactId]);

  // --- Primary query gate ---
  if (overview.isLoading) return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-36" />
      <div className="flex gap-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-xl" />
    </div>
  );
  if (overview.isError) return <QueryError error={overview.error} onRetry={() => overview.refetch()} />;

  const convStats = overview.data?.conversations ?? {};
  const cost = overview.data?.cost;
  const total = Object.values(convStats).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-8">
      <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('pageTitle')}</h1>

      {/* Secondary error banners */}
      {artifacts.isError && <QueryError error={artifacts.error} onRetry={() => artifacts.refetch()} />}

      {/* Date range controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-charcoal">{t('labelFrom')}</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-charcoal">{t('labelTo')}</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          />
        </div>
        {dateSwapped && (
          <span className="text-xs text-gold">{t('datesSwapped')}</span>
        )}
      </div>

      {/* Unified agent selector */}
      <div className="flex flex-wrap items-center gap-3">
        {artifacts.isLoading ? (
          <span className="text-sm text-dune">{t('loadingArtifacts')}</span>
        ) : (
          <select
            value={selectedArtifactId}
            onChange={(e) => setSelectedArtifactId(e.target.value)}
            className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          >
            <option value="">{t('allAgents')}</option>
            {artifacts.data?.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        {!selectedArtifactId && (
          <span className="text-sm text-dune">{t('agentSpecificPrompt')}</span>
        )}
      </div>

      {/* ===== SECTION A: Overview Stats ===== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t('totalConversations')} value={total} />
        <StatCard title={t('active')} value={convStats['active'] ?? 0} />
        <StatCard title={t('resolved')} value={convStats['resolved'] ?? 0} />
        <StatCard title={t('escalated')} value={convStats['escalated'] ?? 0} />
      </div>

      {cost && (
        <Card>
          <CardHeader>
            <CardTitle>{t('llmUsage')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label={t('totalCost')} value={fmtCost(cost.totalCost, locale)} />
              <Metric label={t('interactions')} value={fmtInt(cost.totalInteractions, locale)} />
              <Metric label={t('tokensIn')} value={fmtInt(cost.totalTokensIn, locale)} />
              <Metric label={t('tokensOut')} value={fmtInt(cost.totalTokensOut, locale)} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== AGENT-SPECIFIC SECTIONS ===== */}
      {selectedArtifactId && (
        <div className="space-y-8">
          {/* Performance */}
          <div className="space-y-3">
            <h2 className="font-heading text-lg font-semibold text-charcoal">{t('sectionPerformance')}</h2>
            <AgentPerformance artifactId={selectedArtifactId} />
          </div>

          {/* Top Intents */}
          {intentBars.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-heading text-lg font-semibold text-charcoal">{t('sectionIntents')}</h2>
              <Card>
                <CardContent className="pt-5">
                  <BarChartCss bars={intentBars} ariaLabel={t('sectionIntents')} />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Sales Comparison (sales agents only) */}
          {isSalesAgent && (
            <div className="space-y-3">
              <h2 className="font-heading text-lg font-semibold text-charcoal">{t('sectionSalesComparison')}</h2>
              <SalesComparisonSection artifactId={selectedArtifactId} />
            </div>
          )}

          {/* Revenue Forecast (sales agents only) */}
          {isSalesAgent && (
            <div className="space-y-3">
              <h2 className="font-heading text-lg font-semibold text-charcoal">{t('sectionForecast')}</h2>
              <ForecastSection artifactId={selectedArtifactId} />
            </div>
          )}
        </div>
      )}

      {/* ===== SECTION B: Per-Artifact Metrics ===== */}
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-charcoal">{t('artifactMetrics')}</h2>

        {artifactMetrics.isError && <QueryError error={artifactMetrics.error} onRetry={() => artifactMetrics.refetch()} />}

        {!selectedArtifactId ? (
          <p className="text-dune">{t('selectArtifactMsg')}</p>
        ) : artifactMetrics.isLoading ? (
          <div className="text-dune">{t('loadingMetrics')}</div>
        ) : (artifactMetrics.data?.length ?? 0) === 0 ? (
          <p className="text-dune">{t('noMetrics')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border-2 border-charcoal/8 bg-cream">
            <table className="min-w-[650px] w-full text-sm">
              <thead>
                <tr className="border-b border-charcoal/8 text-left text-dune">
                  <th className="px-4 py-3 font-medium">{t('columnDate')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnHandoffsIn')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnHandoffsOut')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnResolutions')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnAvgLatency')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnLLMCost')}</th>
                </tr>
              </thead>
              <tbody>
                {artifactMetrics.data?.map((row) => (
                  <tr key={row.id} className="border-b border-charcoal/8 last:border-0">
                    <td className="px-4 py-3">{row.metricDate}</td>
                    <td className="px-4 py-3">{row.handoffsIn}</td>
                    <td className="px-4 py-3">{row.handoffsOut}</td>
                    <td className="px-4 py-3">{row.resolutionsCount}</td>
                    <td className="px-4 py-3">{Number(row.avgLatencyMs).toFixed(0)} {t('ms')}</td>
                    <td className="px-4 py-3">{fmtCost(row.llmCostUsd, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== SECTION C: Recent Interaction Logs ===== */}
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-charcoal">{t('recentInteractions')}</h2>

        {recentLogs.isError && <QueryError error={recentLogs.error} onRetry={() => recentLogs.refetch()} />}

        {recentLogs.isLoading ? (
          <div className="text-dune">{tc('loading')}</div>
        ) : (recentLogs.data?.length ?? 0) === 0 ? (
          <p className="text-dune">{t('noInteractions')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border-2 border-charcoal/8 bg-cream">
            <table className="min-w-[800px] w-full text-sm">
              <thead>
                <tr className="border-b border-charcoal/8 text-left text-dune">
                  <th className="px-4 py-3 font-medium">{t('columnIntent')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnModel')}</th>
                  <th className="px-4 py-3 font-medium">{t('tokensIn')}</th>
                  <th className="px-4 py-3 font-medium">{t('tokensOut')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnCost')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnLatency')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnResolution')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnWhen')}</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.data?.map((log) => (
                  <tr key={log.id} className="border-b border-charcoal/8 last:border-0">
                    <td className="px-4 py-3">{log.intent}</td>
                    <td className="px-4 py-3 font-mono text-xs text-dune">{log.modelUsed}</td>
                    <td className="px-4 py-3">{fmtInt(log.tokensIn, locale)}</td>
                    <td className="px-4 py-3">{fmtInt(log.tokensOut, locale)}</td>
                    <td className="px-4 py-3">{fmtMicroCost(log.costUsd, locale)}</td>
                    <td className="px-4 py-3">{log.latencyMs} {t('ms')}</td>
                    <td className="px-4 py-3">
                      {log.resolutionType ? (
                        <Badge>{log.resolutionType}</Badge>
                      ) : (
                        <span className="text-dune">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-dune">{fmtDateTime(log.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== SECTION D: Billing Periods ===== */}
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-charcoal">{t('billingPeriods')}</h2>

        {usageRecords.isError && <QueryError error={usageRecords.error} onRetry={() => usageRecords.refetch()} />}

        {usageRecords.isLoading ? (
          <div className="text-dune">{t('loadingUsage')}</div>
        ) : (usageRecords.data?.length ?? 0) === 0 ? (
          <p className="text-dune">{t('noUsageRecords')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border-2 border-charcoal/8 bg-cream">
            <table className="min-w-[550px] w-full text-sm">
              <thead>
                <tr className="border-b border-charcoal/8 text-left text-dune">
                  <th className="px-4 py-3 font-medium">{t('columnPeriodStart')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnPeriodEnd')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnResolutions')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnLLMCost')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnOverage')}</th>
                </tr>
              </thead>
              <tbody>
                {usageRecords.data?.map((rec) => (
                  <tr key={rec.id} className="border-b border-charcoal/8 last:border-0">
                    <td className="px-4 py-3">{rec.periodStart}</td>
                    <td className="px-4 py-3">{rec.periodEnd}</td>
                    <td className="px-4 py-3">{rec.resolutionsCount}</td>
                    <td className="px-4 py-3">{fmtCost(rec.llmCostUsd, locale)}</td>
                    <td className="px-4 py-3">
                      {Number(rec.overageCostUsd) > 0 ? (
                        <span className="text-error">{fmtCost(rec.overageCostUsd, locale)}</span>
                      ) : (
                        <span className="text-dune">$0.0000</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
