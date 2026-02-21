'use client';

import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { localDateStr } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard, Metric } from '@/components/stat-card';
import { QueryError } from '@/components/query-error';

export default function DashboardOverview() {
  const t = useTranslations('dashboard');
  const tenant = trpc.tenant.me.useQuery();
  const overview = trpc.analytics.overview.useQuery({ from: '2024-01-01', to: localDateStr() });
  const artifacts = trpc.artifact.list.useQuery({});

  // Layout's OnboardingGate handles tenant loading/error state
  const convStats = overview.data?.conversations ?? {};
  const cost = overview.data?.cost;
  const total = Object.values(convStats).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{tenant.data?.name ?? t('pageTitle')}</h1>
        {tenant.data?.planTier && (
          <Badge variant={tenant.data.planTier}>{tenant.data.planTier}</Badge>
        )}
      </div>

      {overview.isError && <QueryError error={overview.error} />}
      {artifacts.isError && <QueryError error={artifacts.error} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t('totalConversations')} value={total} />
        <StatCard title={t('active')} value={convStats['active'] ?? 0} />
        <StatCard title={t('resolved')} value={convStats['resolved'] ?? 0} />
        <StatCard title={t('artifactsCount')} value={artifacts.data?.length ?? 0} />
      </div>

      {cost && (
        <Card>
          <CardHeader>
            <CardTitle>{t('llmUsage')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label={t('totalCost')} value={`$${Number(cost.totalCost).toFixed(4)}`} />
              <Metric label={t('interactions')} value={String(cost.totalInteractions)} />
              <Metric label={t('tokensIn')} value={cost.totalTokensIn.toLocaleString()} />
              <Metric label={t('tokensOut')} value={cost.totalTokensOut.toLocaleString()} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
