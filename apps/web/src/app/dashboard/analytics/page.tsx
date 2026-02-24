'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { localDateStr, thirtyDaysAgoStr, fmtCost, fmtMicroCost, fmtInt, fmtDateTime } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard, Metric } from '@/components/stat-card';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';

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

  // --- Artifact filters ---
  const [metricsArtifactId, setMetricsArtifactId] = useState('');
  const [logsArtifactId, setLogsArtifactId] = useState('');

  // --- Primary query: overview stats ---
  const overview = trpc.analytics.overview.useQuery({ from: validFrom, to: validTo });

  // --- Secondary queries ---
  const artifacts = trpc.artifact.list.useQuery({ activeOnly: false });

  const artifactMetrics = trpc.analytics.artifactMetrics.useQuery(
    { artifactId: metricsArtifactId, from: validFrom, to: validTo },
    { enabled: !!metricsArtifactId },
  );

  const recentLogs = trpc.analytics.recentLogs.useQuery({
    artifactId: logsArtifactId || undefined,
    limit: 50,
  });

  const usageRecords = trpc.analytics.usage.useQuery({ limit: 6 });

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

      {/* ===== SECTION B: Per-Artifact Metrics ===== */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <h2 className="font-heading text-lg font-semibold text-charcoal">{t('artifactMetrics')}</h2>
          {artifacts.isLoading ? (
            <span className="text-sm text-dune">{t('loadingArtifacts')}</span>
          ) : (
            <select
              value={metricsArtifactId}
              onChange={(e) => setMetricsArtifactId(e.target.value)}
              className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="">{t('selectArtifact')}</option>
              {artifacts.data?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        {artifactMetrics.isError && <QueryError error={artifactMetrics.error} onRetry={() => artifactMetrics.refetch()} />}

        {!metricsArtifactId ? (
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <h2 className="font-heading text-lg font-semibold text-charcoal">{t('recentInteractions')}</h2>
          {artifacts.isLoading ? (
            <span className="text-sm text-dune">{tc('loading')}</span>
          ) : (
            <select
              value={logsArtifactId}
              onChange={(e) => setLogsArtifactId(e.target.value)}
              className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="">{t('selectArtifact')}</option>
              {artifacts.data?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

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
