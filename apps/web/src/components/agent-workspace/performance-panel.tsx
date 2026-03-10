'use client';

import { useTranslations } from 'next-intl';
import { BarChart3 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChartCss } from './primitives/bar-chart-css';
import { Sparkline } from './primitives/sparkline';

function formatMs(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function slugLabel(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AgentPerformance({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const query = trpc.agent.performanceMetrics.useQuery(
    { artifactId },
    { retry: 2 },
  );

  const perfHeader = (
    <span className="flex items-center gap-2">
      <BarChart3 className="h-4 w-4 text-teal" />
      {t('performanceTitle')}
    </span>
  );

  if (query.isLoading) {
    return (
      <Card className="bg-sand/20">
        <CardHeader><CardTitle>{perfHeader}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 rounded" />
          <Skeleton className="h-24 rounded" />
          <Skeleton className="h-12 rounded" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card className="bg-sand/20">
        <CardHeader><CardTitle>{perfHeader}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-sunset">{t('errorLoading')}</p>
          <button
            type="button"
            className="text-xs text-teal hover:underline min-h-[36px]"
            onClick={() => query.refetch()}
          >
            {t('retry')}
          </button>
        </CardContent>
      </Card>
    );
  }

  const data = query.data;
  const hasNoConversations = data.dailyConversationVolume.every(d => d.count === 0);
  const hasNoModules       = data.moduleExecutionCounts.length === 0;

  if (hasNoConversations && hasNoModules) {
    return (
      <Card className="bg-sand/20">
        <CardHeader><CardTitle>{perfHeader}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-dune">{t('performanceNoData')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-sand/20">
      <CardHeader><CardTitle>{perfHeader}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
      {/* A. Response Time Summary */}
      {!hasNoConversations && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-white/60 px-3 py-2">
            <p className="text-xs text-dune">{t('performanceResponseTime7d')}</p>
            <p className="font-heading text-lg font-bold text-charcoal">{formatMs(data.avgResponseTime7d)}</p>
          </div>
          <div className="rounded-lg bg-white/60 px-3 py-2">
            <p className="text-xs text-dune">{t('performanceResponseTime30d')}</p>
            <p className="font-heading text-lg font-bold text-charcoal">{formatMs(data.avgResponseTime30d)}</p>
          </div>
        </div>
      )}

      {/* B. Volume & Resolution sparklines (only when enough data points) */}
      {!hasNoConversations && (() => {
        const volumeNonZero = data.dailyConversationVolume.filter(d => d.count > 0).length;
        const resolutionNonZero = data.dailyResolutionRate.filter(d => d.rate > 0).length;
        if (volumeNonZero < 3 && resolutionNonZero < 3) return null;
        return (
          <div className="grid grid-cols-2 gap-4">
            {volumeNonZero >= 3 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-dune uppercase tracking-wide">
                  {t('performanceDailyVolume')}
                </p>
                <Sparkline
                  data={data.dailyConversationVolume.map(d => d.count)}
                  color="var(--color-teal)"
                />
              </div>
            )}
            {resolutionNonZero >= 3 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-dune uppercase tracking-wide">
                  {t('performanceResolutionRate')}
                </p>
                <Sparkline
                  data={data.dailyResolutionRate.map(d => d.rate)}
                  color="var(--color-gold)"
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* E. Module Usage */}
      {data.moduleExecutionCounts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-dune uppercase tracking-wide mb-2">
            {t('performanceModuleUsageTitle')}
          </p>
          <BarChartCss
            bars={data.moduleExecutionCounts.map(m => ({
              label: slugLabel(m.slug),
              value: m.count,
              color: 'var(--color-gold)',
            }))}
            ariaLabel={t('performanceModuleUsage')}
          />
        </div>
      )}
      </CardContent>
    </Card>
  );
}
