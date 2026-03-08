'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useOrganization } from '@clerk/nextjs';
import { useLocale, useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { localDateStr, fmtCost, fmtInt, fmtDateTime } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard, Metric, UsageBar } from '@/components/stat-card';
import { QueryError } from '@/components/query-error';
import { MetricsGrid } from '@/components/agent-workspace/primitives/metrics-grid';
import { PLAN_LIMITS, COST_BUDGET_DEFAULTS, PLAN_PRICES } from '@camello/shared/constants';
import type { PlanTier } from '@camello/shared/types';

export default function DashboardOverview() {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { organization } = useOrganization();
  const tenant = trpc.tenant.me.useQuery();
  const overview = trpc.analytics.overview.useQuery({ from: '2024-01-01', to: localDateStr() });
  const artifacts = trpc.artifact.list.useQuery({});
  const dashboardOverview = trpc.agent.dashboardOverview.useQuery();
  const activityFeed = trpc.agent.dashboardActivityFeed.useQuery(undefined, { refetchInterval: 30_000 });
  const monthlyUsage = trpc.analytics.monthlyUsage.useQuery();
  const intents = trpc.analytics.intentBreakdown.useQuery();

  // Auto-sync tenant name when Clerk org name changes
  const updateName = trpc.tenant.updateName.useMutation({
    onSuccess: () => tenant.refetch(),
  });
  const nameSynced = useRef(false);
  useEffect(() => {
    if (nameSynced.current) return;
    const clerkName = organization?.name;
    const dbName = tenant.data?.name;
    if (clerkName && dbName && clerkName !== dbName) {
      nameSynced.current = true;
      updateName.mutate({ name: clerkName });
    }
  }, [organization?.name, tenant.data?.name]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{tenant.data?.name ?? t('pageTitle')}</h1>
        {tenant.data?.planTier && (
          <Badge variant={tenant.data.planTier}>{planLabel}</Badge>
        )}
      </div>

      {/* ===== Public Chat Link ===== */}
      {tenant.data?.slug && <ShareLinkCard slug={tenant.data.slug} t={t} />}

      {overview.isError && <QueryError error={overview.error} onRetry={() => overview.refetch()} />}
      {artifacts.isError && <QueryError error={artifacts.error} onRetry={() => artifacts.refetch()} />}

      {/* ===== Quick Stats ===== */}
      <QuickStatsSection data={dashboardOverview.data} t={t} />

      {/* ===== Your Agents ===== */}
      <YourAgentsSection agents={artifacts.data} t={t} />

      {/* ===== Activity Feed ===== */}
      <ActivityFeedSection events={activityFeed.data?.events} locale={locale} t={t} />

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
// Quick stats section
// ---------------------------------------------------------------------------

type DashboardOverviewData = {
  todayConversations: number;
  weekConversations: number;
  unreadNotificationsCount: number;
  pendingApprovalsCount: number;
  activeLeadsCount: number;
};

function QuickStatsSection({
  data,
  t,
}: {
  data: DashboardOverviewData | undefined;
  t: ReturnType<typeof useTranslations<'dashboard'>>;
}) {
  const metrics = [
    { label: t('todayConversations'), value: data?.todayConversations ?? 0 },
    { label: t('weekConversations'), value: data?.weekConversations ?? 0 },
    { label: t('unreadNotifications'), value: data?.unreadNotificationsCount ?? 0 },
    { label: t('pendingApprovals'), value: data?.pendingApprovalsCount ?? 0 },
    { label: t('activeLeads'), value: data?.activeLeadsCount ?? 0 },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('quickStats')}</CardTitle>
      </CardHeader>
      <CardContent>
        <MetricsGrid metrics={metrics} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Your agents section
// ---------------------------------------------------------------------------

type ArtifactListItem = { id: string; name: string; isActive: boolean };

function YourAgentsSection({
  agents,
  t,
}: {
  agents: ArtifactListItem[] | undefined;
  t: ReturnType<typeof useTranslations<'dashboard'>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('yourAgents')}</CardTitle>
      </CardHeader>
      <CardContent>
        {!agents || agents.length === 0 ? (
          <p className="text-sm text-dune">{t('noAgents')}</p>
        ) : (
          <ul className="space-y-2">
            {agents.map((agent) => (
              <li key={agent.id}>
                <Link
                  href={`/dashboard/agents/${agent.id}`}
                  className="flex items-center gap-2 text-sm hover:underline"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${agent.isActive ? 'bg-teal' : 'bg-dune'}`}
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium text-charcoal">{agent.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Activity feed section
// ---------------------------------------------------------------------------

type FeedEvent = {
  id: string;
  eventType: 'new_lead' | 'conversation_resolved' | 'approval_needed' | 'deal_closed';
  title: string;
  body: string;
  artifactId: string;
  artifactName: string;
  createdAt: Date;
};

const EVENT_TYPE_COLORS: Record<FeedEvent['eventType'], string> = {
  new_lead: 'bg-teal',
  conversation_resolved: 'bg-gold',
  approval_needed: 'bg-sunset',
  deal_closed: 'bg-charcoal',
};

function ActivityFeedSection({
  events,
  locale,
  t,
}: {
  events: FeedEvent[] | undefined;
  locale: string;
  t: ReturnType<typeof useTranslations<'dashboard'>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('activityFeed')}</CardTitle>
      </CardHeader>
      <CardContent>
        {!events || events.length === 0 ? (
          <p className="text-sm text-dune">{t('noActivity')}</p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="flex items-start gap-3 text-sm">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${EVENT_TYPE_COLORS[event.eventType]}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-charcoal">
                    {t(`event_${event.eventType}` as Parameters<typeof t>[0])}
                  </p>
                  <p className="text-dune truncate">{event.artifactName}</p>
                </div>
                <span className="shrink-0 text-dune whitespace-nowrap">
                  {fmtDateTime(event.createdAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
      <CardContent className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-charcoal">{t('shareLink')}</p>
          <p className="text-xs text-dune truncate">{chatUrl}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="w-full shrink-0 rounded-md bg-teal px-3 py-1.5 text-xs font-heading font-medium text-cream hover:bg-teal/90 transition-colors sm:w-auto"
          >
            {copied ? t('linkCopied') : t('copyLink')}
          </button>
          <a
            href={chatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full shrink-0 rounded-md border border-charcoal/15 px-3 py-1.5 text-center text-xs font-heading font-medium text-charcoal hover:bg-sand transition-colors sm:w-auto"
          >
            {t('openLink')}
          </a>
        </div>
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
                <span className="w-20 shrink-0 truncate font-medium text-charcoal sm:w-28">
                  {intentLabel(row.intent, t)}
                </span>
                <div className="flex-1">
                  <div
                    className="h-5 rounded-sm bg-teal/80 transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-dune sm:w-16">
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
                <div key={i} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
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
