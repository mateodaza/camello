'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { MetricsGrid } from '../primitives/metrics-grid';
import { CardFeed } from '../primitives/card-feed';
import { fmtDate, truncate } from '@/lib/format';

const interestColors: Record<string, string> = {
  ready_to_buy: 'active',
  considering: 'marketing',
  browsing: 'default',
};

const interestLevelKeys: Record<string, string> = {
  ready_to_buy: 'marketingReadyToBuy',
  considering: 'marketingConsidering',
  browsing: 'marketingBrowsing',
};

/** Map snake_case to PascalCase for i18n key suffix */
function pascalCase(s: string): string {
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function MarketingOverview({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const query = trpc.agent.marketingInterestMap.useQuery(
    { artifactId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );
  const data = query.data ?? [];

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const readyToBuy = data.filter((d) => d.interestLevel === 'ready_to_buy').reduce((sum, d) => sum + d.count, 0);
  const considering = data.filter((d) => d.interestLevel === 'considering').reduce((sum, d) => sum + d.count, 0);
  const browsing = data.filter((d) => d.interestLevel === 'browsing').reduce((sum, d) => sum + d.count, 0);

  // Group by topic for bar chart
  const topicMap = new Map<string, number>();
  for (const d of data) {
    const topic = d.topic ?? t('unknown');
    topicMap.set(topic, (topicMap.get(topic) ?? 0) + d.count);
  }
  const topTopics = [...topicMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  return (
    <MetricsGrid
      metrics={[
        { label: t('marketingTotalInterests'), value: total },
        { label: t('marketingReadyToBuy'), value: readyToBuy },
        { label: t('marketingConsidering'), value: considering },
        { label: t('marketingBrowsing'), value: browsing },
      ]}
      barChart={topTopics.length > 0 ? { bars: topTopics } : undefined}
    />
  );
}

function MarketingEngagement({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const query = trpc.agent.marketingEngagement.useQuery(
    { artifactId, limit: 20, offset: 0 },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );

  return (
    <CardFeed
      title={t('marketingEngagement')}
      items={query.data}
      renderCard={(item) => {
        const output = (item.output ?? {}) as Record<string, unknown>;
        const topic = String(output.product_or_topic ?? '—');
        const level = String(output.interest_level ?? 'browsing');
        const followUp = output.follow_up_recommended === true;

        return (
          <div className="flex items-center gap-2">
            <Badge variant={interestColors[level] ?? 'default'} className="text-xs">
              {t((interestLevelKeys[level] ?? level) as Parameters<typeof t>[0])}
            </Badge>
            <span className="text-sm font-medium">{topic}</span>
            {followUp && <Badge variant="escalated" className="text-xs">{t('marketingFollowUp')}</Badge>}
            <span className="ml-auto text-xs text-dune">{fmtDate(item.createdAt, locale)}</span>
          </div>
        );
      }}
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error ?? undefined}
      onRetry={() => query.refetch()}
      emptyTitle={t('marketingEmptyTitle')}
      emptyDescription={t('marketingEmptyDesc')}
    />
  );
}

function MarketingDrafts({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const query = trpc.agent.marketingDrafts.useQuery(
    { artifactId, limit: 20, offset: 0 },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );

  return (
    <CardFeed
      title={t('marketingDrafts')}
      items={query.data}
      renderCard={(item) => {
        const output = (item.output ?? {}) as Record<string, unknown>;
        const contentType = String(output.content_type ?? 'social_post');
        const topic = String(output.topic ?? '—');
        const draft = String(output.draft_text ?? '');

        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-xs">
                {t(`contentType${pascalCase(contentType)}` as Parameters<typeof t>[0])}
              </Badge>
              <span className="text-sm font-medium">{topic}</span>
              <Badge variant={item.status === 'executed' ? 'active' : 'default'} className="text-xs">
                {t(`status${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}` as Parameters<typeof t>[0])}
              </Badge>
              <span className="ml-auto text-xs text-dune">{fmtDate(item.createdAt, locale)}</span>
            </div>
            {draft && <p className="text-xs text-dune">{truncate(draft, 120)}</p>}
          </div>
        );
      }}
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error ?? undefined}
      onRetry={() => query.refetch()}
      emptyTitle={t('marketingDraftsEmpty')}
      emptyDescription={t('marketingDraftsEmptyDesc')}
    />
  );
}

export const marketingSections = [MarketingOverview, MarketingEngagement, MarketingDrafts];
