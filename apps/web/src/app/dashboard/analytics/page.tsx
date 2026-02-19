'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { localDateStr, thirtyDaysAgoStr, fmtCost, fmtMicroCost, fmtInt, fmtDateTime } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard, Metric } from '@/components/stat-card';
import { QueryError } from '@/components/query-error';

export default function AnalyticsPage() {
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
  if (overview.isLoading) return <div className="text-gray-500">Loading...</div>;
  if (overview.isError) return <QueryError error={overview.error} />;

  const convStats = overview.data?.conversations ?? {};
  const cost = overview.data?.cost;
  const total = Object.values(convStats).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* Secondary error banners */}
      {artifacts.isError && <QueryError error={artifacts.error} />}

      {/* Date range controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>
        {dateSwapped && (
          <span className="text-xs text-amber-600">Dates swapped (from &gt; to)</span>
        )}
      </div>

      {/* ===== SECTION A: Overview Stats ===== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Conversations" value={total} />
        <StatCard title="Active" value={convStats['active'] ?? 0} />
        <StatCard title="Resolved" value={convStats['resolved'] ?? 0} />
        <StatCard title="Escalated" value={convStats['escalated'] ?? 0} />
      </div>

      {cost && (
        <Card>
          <CardHeader>
            <CardTitle>LLM Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Total Cost" value={fmtCost(cost.totalCost)} />
              <Metric label="Interactions" value={fmtInt(cost.totalInteractions)} />
              <Metric label="Tokens In" value={fmtInt(cost.totalTokensIn)} />
              <Metric label="Tokens Out" value={fmtInt(cost.totalTokensOut)} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== SECTION B: Per-Artifact Metrics ===== */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Artifact Metrics</h2>
          {artifacts.isLoading ? (
            <span className="text-sm text-gray-400">Loading artifacts...</span>
          ) : (
            <select
              value={metricsArtifactId}
              onChange={(e) => setMetricsArtifactId(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="">Select an artifact...</option>
              {artifacts.data?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        {artifactMetrics.isError && <QueryError error={artifactMetrics.error} />}

        {!metricsArtifactId ? (
          <p className="text-gray-500">Select an artifact to view daily metrics.</p>
        ) : artifactMetrics.isLoading ? (
          <div className="text-gray-500">Loading metrics...</div>
        ) : (artifactMetrics.data?.length ?? 0) === 0 ? (
          <p className="text-gray-500">No metrics for this period.</p>
        ) : (
          <div className="rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Handoffs In</th>
                  <th className="px-4 py-3 font-medium">Handoffs Out</th>
                  <th className="px-4 py-3 font-medium">Resolutions</th>
                  <th className="px-4 py-3 font-medium">Avg Latency</th>
                  <th className="px-4 py-3 font-medium">LLM Cost</th>
                </tr>
              </thead>
              <tbody>
                {artifactMetrics.data?.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{row.metricDate}</td>
                    <td className="px-4 py-3">{row.handoffsIn}</td>
                    <td className="px-4 py-3">{row.handoffsOut}</td>
                    <td className="px-4 py-3">{row.resolutionsCount}</td>
                    <td className="px-4 py-3">{Number(row.avgLatencyMs).toFixed(0)} ms</td>
                    <td className="px-4 py-3">{fmtCost(row.llmCostUsd)}</td>
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
          <h2 className="text-lg font-semibold">Recent Interactions</h2>
          {artifacts.isLoading ? (
            <span className="text-sm text-gray-400">Loading...</span>
          ) : (
            <select
              value={logsArtifactId}
              onChange={(e) => setLogsArtifactId(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="">All artifacts</option>
              {artifacts.data?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        {recentLogs.isError && <QueryError error={recentLogs.error} />}

        {recentLogs.isLoading ? (
          <div className="text-gray-500">Loading logs...</div>
        ) : (recentLogs.data?.length ?? 0) === 0 ? (
          <p className="text-gray-500">No interactions yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Intent</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Tokens In</th>
                  <th className="px-4 py-3 font-medium">Tokens Out</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Latency</th>
                  <th className="px-4 py-3 font-medium">Resolution</th>
                  <th className="px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.data?.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{log.intent}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.modelUsed}</td>
                    <td className="px-4 py-3">{fmtInt(log.tokensIn)}</td>
                    <td className="px-4 py-3">{fmtInt(log.tokensOut)}</td>
                    <td className="px-4 py-3">{fmtMicroCost(log.costUsd)}</td>
                    <td className="px-4 py-3">{log.latencyMs} ms</td>
                    <td className="px-4 py-3">
                      {log.resolutionType ? (
                        <Badge>{log.resolutionType}</Badge>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fmtDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== SECTION D: Billing Periods ===== */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Billing Periods</h2>

        {usageRecords.isError && <QueryError error={usageRecords.error} />}

        {usageRecords.isLoading ? (
          <div className="text-gray-500">Loading usage records...</div>
        ) : (usageRecords.data?.length ?? 0) === 0 ? (
          <p className="text-gray-500">No usage records yet.</p>
        ) : (
          <div className="rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Period Start</th>
                  <th className="px-4 py-3 font-medium">Period End</th>
                  <th className="px-4 py-3 font-medium">Resolutions</th>
                  <th className="px-4 py-3 font-medium">LLM Cost</th>
                  <th className="px-4 py-3 font-medium">Overage</th>
                </tr>
              </thead>
              <tbody>
                {usageRecords.data?.map((rec) => (
                  <tr key={rec.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{rec.periodStart}</td>
                    <td className="px-4 py-3">{rec.periodEnd}</td>
                    <td className="px-4 py-3">{rec.resolutionsCount}</td>
                    <td className="px-4 py-3">{fmtCost(rec.llmCostUsd)}</td>
                    <td className="px-4 py-3">
                      {Number(rec.overageCostUsd) > 0 ? (
                        <span className="text-red-600">{fmtCost(rec.overageCostUsd)}</span>
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
