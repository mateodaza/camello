'use client';

import { useTranslations, useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { BarChartCss } from './primitives/bar-chart-css';
import { Sparkline } from './primitives/sparkline';

function formatMs(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function slugLabel(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortDate(dateStr: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(dateStr + 'T00:00:00Z'));
}

export function AgentPerformance({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const query = trpc.agent.performanceMetrics.useQuery(
    { artifactId },
    { retry: 2 },
  );

  if (query.isLoading) {
    return (
      <div className="rounded-lg border border-charcoal/10 bg-cream p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-charcoal/10" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-lg border border-charcoal/10 bg-cream p-4 space-y-2">
        <p className="text-sm text-sunset">{t('errorLoading')}</p>
        <button
          type="button"
          className="text-xs text-teal hover:underline min-h-[36px]"
          onClick={() => query.refetch()}
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  const data = query.data;
  const hasNoConversations = data.dailyConversationVolume.every(d => d.count === 0);
  const hasNoModules       = data.moduleExecutionCounts.length === 0;

  if (hasNoConversations && hasNoModules) {
    return (
      <div className="rounded-lg border border-charcoal/10 bg-cream p-4 space-y-1">
        <p className="text-sm font-semibold text-charcoal">{t('performanceTitle')}</p>
        <p className="text-xs text-dune">{t('performanceNoData')}</p>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      {/* A. Response Time Summary */}
      {!hasNoConversations && (
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-dune">{t('performanceResponseTime7d')}</p>
            <p className="font-heading text-xl font-bold text-charcoal">{formatMs(data.avgResponseTime7d)}</p>
          </div>
          <div>
            <p className="text-xs text-dune">{t('performanceResponseTime30d')}</p>
            <p className="font-heading text-xl font-bold text-charcoal">{formatMs(data.avgResponseTime30d)}</p>
          </div>
        </div>
      )}

      {/* B. Daily Response Time Chart (14d) */}
      {!hasNoConversations && (
        <BarChartCss
          bars={data.dailyResponseTime.map(d => ({
            label: shortDate(d.date, locale),
            value: d.avgMs,
            color: 'var(--color-teal)',
          }))}
          ariaLabel={t('performanceResponseTime')}
        />
      )}

      {/* C. Volume Trend (30d) */}
      {!hasNoConversations && (
        <>
          <p className="text-xs font-semibold text-dune uppercase tracking-wide">
            {t('performanceDailyVolume')}
          </p>
          <Sparkline
            data={data.dailyConversationVolume.map(d => d.count)}
            color="var(--color-teal)"
          />
        </>
      )}

      {/* D. Resolution Rate Trend (30d) */}
      {data.dailyResolutionRate.some(d => d.rate > 0) && (
        <>
          <p className="text-xs font-semibold text-dune uppercase tracking-wide">
            {t('performanceResolutionRate')}
          </p>
          <Sparkline
            data={data.dailyResolutionRate.map(d => d.rate)}
            color="var(--color-gold)"
          />
        </>
      )}

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
    </section>
  );
}
