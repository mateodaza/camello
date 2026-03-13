'use client';

import { useState, useMemo, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { localDateStr, nDaysAgoStr, fmtCost, fmtInt, fmtMoney } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Metric } from '@/components/stat-card';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChartCss } from '@/components/agent-workspace/primitives/bar-chart-css';
import { AgentPerformance } from '@/components/agent-workspace/performance-panel';
import { DeltaBadge } from '@/components/agent-workspace/sales/delta-badge';
import { ForecastCard } from '@/components/agent-workspace/sales/forecast-card';

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
  const locale = useLocale();

  // --- Date range (local time) ---
  const [from, setFrom] = useState(() => nDaysAgoStr(30));
  const [to, setTo] = useState(() => localDateStr());
  const [activePreset, setActivePreset] = useState<'7d' | '30d' | '90d' | null>('30d');

  // Ensure from <= to; swap if inverted
  const validFrom = from <= to ? from : to;
  const validTo = from <= to ? to : from;
  const dateSwapped = from > to;

  // --- Unified agent selector ---
  const [selectedArtifactId, setSelectedArtifactId] = useState('');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // --- Queries ---
  const overview = trpc.analytics.overview.useQuery({ from: validFrom, to: validTo });
  const artifacts = trpc.artifact.list.useQuery({ activeOnly: false });

  // --- Auto-select when exactly one agent exists ---
  useEffect(() => {
    if (selectedArtifactId === '' && artifacts.data?.length === 1) {
      setSelectedArtifactId(artifacts.data[0].id);
    }
  }, [artifacts.data, selectedArtifactId]);

  const artifactMetrics = trpc.analytics.artifactMetrics.useQuery(
    { artifactId: selectedArtifactId, from: validFrom, to: validTo },
    { enabled: !!selectedArtifactId },
  );

  const recentLogs = trpc.analytics.recentLogs.useQuery({
    artifactId: selectedArtifactId || undefined,
    limit: 50,
  });

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

  // --- Preset helper ---
  function applyPreset(preset: '7d' | '30d' | '90d') {
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
    setFrom(nDaysAgoStr(days));
    setTo(localDateStr());
    setActivePreset(preset);
  }

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

  const convStats = overview.data?.conversations ?? { active: 0, resolved: 0, escalated: 0 };
  const cost = overview.data?.cost;
  const total = (convStats.resolved ?? 0) + (convStats.active ?? 0) + (convStats.escalated ?? 0);

  return (
    <div className="space-y-8">
      <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('pageTitle')}</h1>

      {/* Secondary error banners */}
      {artifacts.isError && <QueryError error={artifacts.error} onRetry={() => artifacts.refetch()} />}

      {/* Date range controls */}
      <div className="space-y-3">
        {/* Preset pills — primary control */}
        <div className="flex flex-wrap gap-2">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors
                ${activePreset === p
                  ? 'bg-teal text-white'
                  : 'border border-charcoal/15 bg-cream text-charcoal hover:bg-sand'
                }`}
            >
              {t(p === '7d' ? 'preset7d' : p === '30d' ? 'preset30d' : 'preset90d')}
            </button>
          ))}
        </div>

        {/* Custom range — demoted but always rendered */}
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-xs font-medium text-dune self-center">{t('customRange')}</span>
          <div>
            <label className="mb-1 block text-xs text-charcoal/60">{t('labelFrom')}</label>
            <input
              type="date" value={from}
              onChange={(e) => { setFrom(e.target.value); setActivePreset(null); }}
              className="rounded-md border border-charcoal/15 bg-cream px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal/60">{t('labelTo')}</label>
            <input
              type="date" value={to}
              onChange={(e) => { setTo(e.target.value); setActivePreset(null); }}
              className="rounded-md border border-charcoal/15 bg-cream px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          {dateSwapped && <span className="text-xs text-gold">{t('datesSwapped')}</span>}
        </div>
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
        {!selectedArtifactId && (artifacts.data?.length ?? 0) > 1 && (
          <span className="text-sm text-dune">{t('agentSpecificPrompt')}</span>
        )}
      </div>

      {/* ===== SECTION A: Conversation Health Card ===== */}
      <Card>
        <CardContent className="pt-5">
          <p className="font-heading text-4xl font-bold text-charcoal tabular-nums">{total}</p>
          <p className="text-sm text-dune">{t('convHealthTotal')}</p>

          {total === 0 ? (
            <div className="my-3 h-3 rounded-full bg-charcoal/10" />
          ) : (
            <div className="my-3 flex h-3 overflow-hidden rounded-full">
              <div
                data-testid="health-bar-resolved"
                className="bg-teal"
                style={{ width: `${((convStats.resolved ?? 0) / total) * 100}%` }}
              />
              <div
                data-testid="health-bar-active"
                className="bg-charcoal/20"
                style={{ width: `${((convStats.active ?? 0) / total) * 100}%` }}
              />
              <div
                data-testid="health-bar-escalated"
                className="bg-sunset"
                style={{ width: `${((convStats.escalated ?? 0) / total) * 100}%` }}
              />
            </div>
          )}

          <p className="text-sm text-dune">
            {convStats.resolved ?? 0} {t('convHealthResolved')}
            {' · '}{convStats.active ?? 0} {t('convHealthActive')}
            {' · '}{convStats.escalated ?? 0} {t('convHealthEscalated')}
          </p>
        </CardContent>
      </Card>

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

      {/* ===== Top Intents (standalone, before daily performance) ===== */}
      {selectedArtifactId && (
        <div className="space-y-3">
          <h2 className="font-heading text-lg font-semibold text-charcoal">{t('sectionIntents')}</h2>
          {recentLogs.isLoading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : recentLogs.isError ? (
            <QueryError error={recentLogs.error} onRetry={() => recentLogs.refetch()} />
          ) : intentBars.length > 0 ? (
            <>
              <Card>
                <CardContent className="pt-5">
                  <BarChartCss bars={intentBars} ariaLabel={t('sectionIntents')} />
                </CardContent>
              </Card>
              <p className="text-sm text-dune">
                {t.rich('intentsContextHint', {
                  topic: intentBars[0].label,
                  b: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            </>
          ) : (
            <p className="text-sm text-dune">{t('intentsEmptyHint')}</p>
          )}
        </div>
      )}

      {/* ===== SECTION B: Daily Performance ===== */}
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-charcoal">{t('dailyPerformance')}</h2>

        {artifactMetrics.isError && <QueryError error={artifactMetrics.error} onRetry={() => artifactMetrics.refetch()} />}

        {!selectedArtifactId ? (
          <p className="text-dune">{t('selectArtifactMsg')}</p>
        ) : artifactMetrics.isLoading ? (
          <div className="text-dune">{t('loadingMetrics')}</div>
        ) : (artifactMetrics.data?.length ?? 0) === 0 ? (
          <p className="text-dune">{t('noMetrics')}</p>
        ) : (
          <>
          <div className="overflow-x-auto rounded-xl border-2 border-charcoal/8 bg-cream">
            <table className="min-w-[650px] w-full text-sm">
              <thead>
                <tr className="border-b border-charcoal/8 text-left text-dune">
                  <th className="px-4 py-3 font-medium">{t('columnDate')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnHandoffsIn')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnHandoffsOut')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnResolutions')}</th>
                  {showTechnicalDetails && <th className="px-4 py-3 font-medium">{t('columnAvgLatency')}</th>}
                  {showTechnicalDetails && <th className="px-4 py-3 font-medium">{t('columnLLMCost')}</th>}
                </tr>
              </thead>
              <tbody>
                {artifactMetrics.data?.map((row) => (
                  <tr key={row.id} className="border-b border-charcoal/8 last:border-0">
                    <td className="px-4 py-3">{row.metricDate}</td>
                    <td className="px-4 py-3">{row.handoffsIn}</td>
                    <td className="px-4 py-3">{row.handoffsOut}</td>
                    <td className="px-4 py-3">{row.resolutionsCount}</td>
                    {showTechnicalDetails && (
                      <td className="px-4 py-3">{Number(row.avgLatencyMs).toFixed(0)} {t('ms')}</td>
                    )}
                    {showTechnicalDetails && (
                      <td className="px-4 py-3">{fmtCost(row.llmCostUsd, locale)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => setShowTechnicalDetails((v) => !v)}
            className="mt-3 text-sm text-dune underline-offset-2 hover:underline"
          >
            {t(showTechnicalDetails ? 'hideTechnicalDetails' : 'showTechnicalDetails')}
          </button>
          </>
        )}
      </div>
    </div>
  );
}
