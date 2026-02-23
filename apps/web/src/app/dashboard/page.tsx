'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { localDateStr, fmtCost, fmtInt, fmtDateTime } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard, Metric, UsageBar } from '@/components/stat-card';
import { QueryError } from '@/components/query-error';
import { PLAN_LIMITS, COST_BUDGET_DEFAULTS, PLAN_PRICES } from '@camello/shared/constants';
import type { PlanTier } from '@camello/shared/types';

export default function DashboardOverview() {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const tenant = trpc.tenant.me.useQuery();
  const overview = trpc.analytics.overview.useQuery({ from: '2024-01-01', to: localDateStr() });
  const artifacts = trpc.artifact.list.useQuery({});
  const monthlyUsage = trpc.analytics.monthlyUsage.useQuery();
  const intents = trpc.analytics.intentBreakdown.useQuery();

  // Layout's OnboardingGate handles tenant loading/error state
  const convStats = overview.data?.conversations ?? {};
  const cost = overview.data?.cost;
  const total = Object.values(convStats).reduce((s, n) => s + n, 0);

  const planTier = (tenant.data?.planTier as PlanTier | undefined) ?? 'starter';
  const limits = PLAN_LIMITS[planTier];
  const planLabel = PLAN_PRICES[planTier]?.label ?? planTier;
  const effectiveBudget = tenant.data?.monthlyCostBudgetUsd
    ? Number(tenant.data.monthlyCostBudgetUsd)
    : COST_BUDGET_DEFAULTS[planTier];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-heading text-2xl font-bold text-charcoal">{tenant.data?.name ?? t('pageTitle')}</h1>
        {tenant.data?.planTier && (
          <Badge variant={tenant.data.planTier}>{planLabel}</Badge>
        )}
      </div>

      {/* ===== Public Chat Link ===== */}
      {tenant.data?.slug && <ShareLinkCard slug={tenant.data.slug} t={t} />}

      {overview.isError && <QueryError error={overview.error} onRetry={() => overview.refetch()} />}
      {artifacts.isError && <QueryError error={artifacts.error} onRetry={() => artifacts.refetch()} />}

      {/* ===== Plan Usage ===== */}
      {tenant.data && (
        <Card>
          <CardHeader>
            <CardTitle>{t('planUsage')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageBar
              label={t('resolved')}
              used={monthlyUsage.data?.resolvedThisMonth ?? 0}
              limit={limits.resolutions_per_month}
              formatValue={(n) => fmtInt(n, locale)}
            />
            <UsageBar
              label={t('totalCost')}
              used={monthlyUsage.data?.costThisMonth ?? 0}
              limit={effectiveBudget}
              formatValue={(n) => fmtCost(n, locale)}
            />
          </CardContent>
        </Card>
      )}

      {/* ===== Intent Breakdown ===== */}
      {intents.isError && <QueryError error={intents.error} onRetry={() => intents.refetch()} />}
      {!intents.isLoading && !intents.isError && (
        <IntentSection
          topIntents={intents.data?.topIntents ?? []}
          recentIntents={intents.data?.recentIntents ?? []}
          locale={locale}
          t={t}
        />
      )}

      {/* ===== Business KPIs ===== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t('totalConversations')} value={total} />
        <StatCard title={t('active')} value={convStats['active'] ?? 0} />
        <StatCard title={t('resolved')} value={convStats['resolved'] ?? 0} />
        <StatCard title={t('artifactsCount')} value={artifacts.data?.length ?? 0} />
      </div>

      {/* ===== Advanced (LLM details) ===== */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-sm font-medium text-dune hover:text-charcoal"
      >
        {showAdvanced ? t('hideAdvanced') : t('advanced')}
      </button>

      {showAdvanced && cost && (
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public chat share link
// ---------------------------------------------------------------------------

function ShareLinkCard({
  slug,
  t,
}: {
  slug: string;
  t: ReturnType<typeof useTranslations<'dashboard'>>;
}) {
  const [copied, setCopied] = useState(false);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const chatUrl = `${baseUrl}/chat/${slug}`;

  const copy = useCallback(() => {
    navigator.clipboard.writeText(chatUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [chatUrl]);

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-charcoal">{t('shareLink')}</p>
          <p className="text-xs text-dune truncate">{chatUrl}</p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md bg-teal px-3 py-1.5 text-xs font-heading font-medium text-cream hover:bg-teal/90 transition-colors"
        >
          {copied ? t('linkCopied') : t('copyLink')}
        </button>
        <a
          href={chatUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md border border-charcoal/15 px-3 py-1.5 text-xs font-heading font-medium text-charcoal hover:bg-sand transition-colors"
        >
          {t('openLink')}
        </a>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Intent breakdown sub-component
// ---------------------------------------------------------------------------

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Translate intent slug via i18n key `intent_<slug>`, fallback to titleCase. */
function intentLabel(slug: string, t: ReturnType<typeof useTranslations<'dashboard'>>): string {
  const key = `intent_${slug}` as Parameters<typeof t>[0];
  return t.has(key) ? t(key) : titleCase(slug);
}

interface IntentRow { intent: string; count: number; lastSeen: Date }
interface RecentIntentRow { intent: string; conversationId: string; createdAt: Date }

function IntentSection({
  topIntents,
  recentIntents,
  locale,
  t,
}: {
  topIntents: IntentRow[];
  recentIntents: RecentIntentRow[];
  locale: string;
  t: ReturnType<typeof useTranslations<'dashboard'>>;
}) {
  if (topIntents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('intentBreakdown')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-dune">{t('noIntentsYet')}</p>
        </CardContent>
      </Card>
    );
  }

  const grandTotal = topIntents.reduce((s, r) => s + r.count, 0);
  const maxCount = topIntents[0]?.count ?? 1;

  // Show up to 8, bucket the rest as "Other"
  const visible = topIntents.slice(0, 8);
  const otherCount = topIntents.slice(8).reduce((s, r) => s + r.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('intentBreakdown')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Bar chart */}
        <div className="space-y-2">
          {visible.map((row) => {
            const pct = grandTotal > 0 ? Math.round((row.count / grandTotal) * 100) : 0;
            const barWidth = maxCount > 0 ? Math.max((row.count / maxCount) * 100, 4) : 4;
            return (
              <div key={row.intent} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate font-medium text-charcoal">
                  {intentLabel(row.intent, t)}
                </span>
                <div className="flex-1">
                  <div
                    className="h-5 rounded-sm bg-teal/80 transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-dune">
                  {row.count} ({pct}%)
                </span>
              </div>
            );
          })}
          {otherCount > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 truncate font-medium text-charcoal">
                {t('other')}
              </span>
              <div className="flex-1">
                <div
                  className="h-5 rounded-sm bg-dune/40 transition-all"
                  style={{ width: `${Math.max((otherCount / maxCount) * 100, 4)}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-dune">
                {otherCount} ({grandTotal > 0 ? Math.round((otherCount / grandTotal) * 100) : 0}%)
              </span>
            </div>
          )}
        </div>

        {/* Recent intents */}
        {recentIntents.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-charcoal">{t('recentQuestions')}</h3>
            <div className="space-y-1">
              {recentIntents.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-charcoal">{intentLabel(r.intent, t)}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-dune">{fmtDateTime(r.createdAt, locale)}</span>
                    <Link
                      href={`/dashboard/conversations/${r.conversationId}`}
                      className="text-teal hover:underline"
                    >
                      {t('viewConversation')}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
