'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { localDateStr, fmtCost, fmtInt } from '@/lib/format';
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

      {overview.isError && <QueryError error={overview.error} />}
      {artifacts.isError && <QueryError error={artifacts.error} />}

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
