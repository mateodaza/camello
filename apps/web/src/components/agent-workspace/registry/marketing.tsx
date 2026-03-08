'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { MetricsGrid } from '../primitives/metrics-grid';
import { CardFeed } from '../primitives/card-feed';
import { fmtDate, truncate } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';

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

function MarketingStats({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const query = trpc.agent.marketingStats.useQuery(
    { artifactId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
  );
  const data = query.data;
  const topCategories = data?.topCategories ?? [];

  return (
    <div className="space-y-3">
      <MetricsGrid
        metrics={[
          { label: t('marketingInterestsCaptured'), value: data?.totalInterests ?? 0 },
          { label: t('marketingTopCategoriesCount'), value: topCategories.length },
          { label: t('marketingDraftsPending'), value: data?.draftCount ?? 0 },
        ]}
      />
      {topCategories.length > 0 && (
        <div className="rounded-lg border border-charcoal/10 bg-cream px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-dune uppercase tracking-wide">
            {t('marketingTopCategoriesLabel')}
          </p>
          {topCategories.map((cat, idx) => (
            <div key={cat.topic ?? idx} className="flex items-center justify-between text-sm">
              <span className="text-charcoal">{cat.topic ?? t('unknown')}</span>
              <span className="text-dune font-medium">{cat.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MarketingOverview({ artifactId }: { artifactId: string }) {
  const t = useTranslations('agentWorkspace');
  const query = trpc.agent.marketingInterestMap.useQuery(
    { artifactId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
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
    { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
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
  const { addToast } = useToast();
  const utils = trpc.useUtils();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const dismissedIds = useRef<Set<string>>(new Set());

  const query = trpc.agent.marketingDrafts.useQuery(
    { artifactId, limit: 20, offset: 0 },
    { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
  );

  const visibleDrafts = (query.data ?? []).filter((d) => !dismissedIds.current.has(d.id));

  const updateDraft = trpc.module.updateDraft.useMutation({
    onMutate: async ({ executionId }) => {
      dismissedIds.current.add(executionId);
      await utils.agent.marketingDrafts.cancel({ artifactId, limit: 20, offset: 0 });
      const prev = utils.agent.marketingDrafts.getData({ artifactId, limit: 20, offset: 0 });
      utils.agent.marketingDrafts.setData(
        { artifactId, limit: 20, offset: 0 },
        (old) => old ? old.filter((d) => d.id !== executionId) : old,
      );
      return { prev };
    },
    onSuccess: () => {
      setEditingId(null);
      setEditText('');
      void utils.agent.marketingStats.invalidate({ artifactId });
      addToast(t('draftActionSuccess'), 'success');
    },
    onError: (_err, vars, ctx) => {
      dismissedIds.current.delete(vars.executionId);
      if (ctx?.prev) {
        utils.agent.marketingDrafts.setData({ artifactId, limit: 20, offset: 0 }, ctx.prev);
      }
      addToast(t('errorLoading'), 'error');
    },
  });

  if (query.isLoading) {
    return (
      <div className="rounded-lg border border-charcoal/10 bg-cream p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-charcoal/10" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-charcoal/10 bg-cream p-4 space-y-2">
        <p className="text-sm text-sunset">{t('errorLoading')}</p>
        <button
          type="button"
          className="text-xs text-teal hover:underline min-h-[36px]"
          onClick={() => query.refetch()}
        >
          {t('errorLoading')}
        </button>
      </div>
    );
  }

  if (visibleDrafts.length === 0) {
    return (
      <div className="rounded-lg border border-charcoal/10 bg-cream p-4 space-y-1">
        <p className="text-sm font-semibold text-charcoal">{t('marketingDraftsEmpty')}</p>
        <p className="text-xs text-dune">{t('marketingDraftsEmptyDesc')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-charcoal">{t('marketingDrafts')}</p>
      {visibleDrafts.map((item) => {
        const output = (item.output ?? {}) as Record<string, unknown>;
        const draftTitle = String(output.topic ?? '—');
        const contentType = String(output.content_type ?? 'social_post');
        const draftPreview = truncate(String(output.draft_text ?? ''), 80);
        const isEditing = editingId === item.id;

        return (
          <div key={item.id} className="rounded-lg border border-charcoal/10 bg-cream p-4 space-y-2">
            {/* Header row: content_type badge + date */}
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-xs">
                {t(`contentType${pascalCase(contentType)}` as Parameters<typeof t>[0])}
              </Badge>
              <span className="ml-auto text-xs text-dune">{fmtDate(item.createdAt, locale)}</span>
            </div>
            {/* Draft title — output.topic as primary heading */}
            <p className="text-sm font-semibold text-charcoal">{draftTitle}</p>
            {/* Draft preview */}
            {draftPreview && <p className="text-xs text-dune">{draftPreview}</p>}
            {/* Edit textarea */}
            {isEditing && (
              <textarea
                className="w-full rounded border border-charcoal/20 bg-white p-2 text-sm text-charcoal placeholder:text-dune min-h-[80px] resize-y"
                rows={4}
                placeholder={t('draftEditPlaceholder')}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
            )}
            {/* Action buttons */}
            <div className="flex gap-2">
              {!isEditing ? (
                <>
                  <button
                    type="button"
                    className="rounded bg-teal px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 min-h-[36px]"
                    disabled={updateDraft.isPending}
                    onClick={() => updateDraft.mutate({ executionId: item.id, action: 'approve' })}
                  >
                    {t('draftApprove')}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-charcoal/20 px-3 text-xs font-medium text-charcoal hover:bg-charcoal/5 disabled:opacity-50 min-h-[36px]"
                    disabled={updateDraft.isPending}
                    onClick={() => {
                      setEditingId(item.id);
                      setEditText(String(output.draft_text ?? ''));
                    }}
                  >
                    {t('draftEdit')}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-sunset/30 px-3 text-xs font-medium text-sunset hover:bg-sunset/5 disabled:opacity-50 min-h-[36px]"
                    disabled={updateDraft.isPending}
                    onClick={() => updateDraft.mutate({ executionId: item.id, action: 'discard' })}
                  >
                    {t('draftDiscard')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="rounded bg-teal px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 min-h-[36px]"
                    disabled={updateDraft.isPending || !editText.trim()}
                    onClick={() =>
                      updateDraft.mutate({
                        executionId: item.id,
                        action: 'edit',
                        output: { ...output, draft_text: editText },
                      })
                    }
                  >
                    {t('draftSubmitEdit')}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-charcoal/20 px-3 text-xs font-medium text-charcoal hover:bg-charcoal/5 min-h-[36px]"
                    onClick={() => {
                      setEditingId(null);
                      setEditText('');
                    }}
                  >
                    {t('draftCancelEdit')}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { AgentPerformance } from '../performance-panel';

export const marketingSections = [MarketingStats, MarketingOverview, MarketingEngagement, MarketingDrafts, AgentPerformance];
