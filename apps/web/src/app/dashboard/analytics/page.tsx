'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { localDateStr, thirtyDaysAgoStr, fmtCost, fmtMicroCost, fmtInt, fmtDateTime } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard, Metric } from '@/components/stat-card';
import { QueryError } from '@/components/query-error';

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
  if (overview.isLoading) return <div className="text-gray-500">{tc('loading')}</div>;
  if (overview.isError) return <QueryError error={overview.error} />;

  const convStats = overview.data?.conversations ?? {};
  const cost = overview.data?.cost;
  const total = Object.values(convStats).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>

      {/* Secondary error banners */}
      {artifacts.isError && <QueryError error={artifacts.error} />}

      {/* Date range controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('labelFrom')}</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('labelTo')}</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>
        {dateSwapped && (
          <span className="text-xs text-amber-600">{t('datesSwapped')}</span>
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
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{t('artifactMetrics')}</h2>
          {artifacts.isLoading ? (
            <span className="text-sm text-gray-400">{t('loadingArtifacts')}</span>
          ) : (
            <select
              value={metricsArtifactId}
              onChange={(e) => setMetricsArtifactId(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="">{t('selectArtifact')}</option>
              {artifacts.data?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        {artifactMetrics.isError && <QueryError error={artifactMetrics.error} />}

        {!metricsArtifactId ? (
          <p className="text-gray-500">{t('selectArtifactMsg')}</p>
        ) : artifactMetrics.isLoading ? (
          <div className="text-gray-500">{t('loadingMetrics')}</div>
        ) : (artifactMetrics.data?.length ?? 0) === 0 ? (
          <p className="text-gray-500">{t('noMetrics')}</p>
        ) : (
          <div className="rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
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
                  <tr key={row.id} className="border-b last:border-0">
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
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{t('recentInteractions')}</h2>
          {artifacts.isLoading ? (
            <span className="text-sm text-gray-400">{tc('loading')}</span>
          ) : (
            <select
              value={logsArtifactId}
              onChange={(e) => setLogsArtifactId(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="">{t('selectArtifact')}</option>
              {artifacts.data?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        {recentLogs.isError && <QueryError error={recentLogs.error} />}

        {recentLogs.isLoading ? (
          <div className="text-gray-500">{tc('loading')}</div>
        ) : (recentLogs.data?.length ?? 0) === 0 ? (
          <p className="text-gray-500">{t('noInteractions')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
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
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{log.intent}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.modelUsed}</td>
                    <td className="px-4 py-3">{fmtInt(log.tokensIn, locale)}</td>
                    <td className="px-4 py-3">{fmtInt(log.tokensOut, locale)}</td>
                    <td className="px-4 py-3">{fmtMicroCost(log.costUsd, locale)}</td>
                    <td className="px-4 py-3">{log.latencyMs} {t('ms')}</td>
                    <td className="px-4 py-3">
                      {log.resolutionType ? (
                        <Badge>{log.resolutionType}</Badge>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fmtDateTime(log.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== SECTION D: Billing Periods ===== */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t('billingPeriods')}</h2>

        {usageRecords.isError && <QueryError error={usageRecords.error} />}

        {usageRecords.isLoading ? (
          <div className="text-gray-500">{t('loadingUsage')}</div>
        ) : (usageRecords.data?.length ?? 0) === 0 ? (
          <p className="text-gray-500">{t('noUsageRecords')}</p>
        ) : (
          <div className="rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">{t('columnPeriodStart')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnPeriodEnd')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnResolutions')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnLLMCost')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnOverage')}</th>
                </tr>
              </thead>
              <tbody>
                {usageRecords.data?.map((rec) => (
                  <tr key={rec.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{rec.periodStart}</td>
                    <td className="px-4 py-3">{rec.periodEnd}</td>
                    <td className="px-4 py-3">{rec.resolutionsCount}</td>
                    <td className="px-4 py-3">{fmtCost(rec.llmCostUsd, locale)}</td>
                    <td className="px-4 py-3">
                      {Number(rec.overageCostUsd) > 0 ? (
                        <span className="text-red-600">{fmtCost(rec.overageCostUsd, locale)}</span>
                      ) : (
                        <span className="text-gray-400">$0.0000</span>
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
