'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useOrganization } from '@clerk/nextjs';
import { useLocale, useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { fmtDateTime } from '@/lib/format';
import { KnowledgeBanner } from '@/components/dashboard/knowledge-banner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { QueryError } from '@/components/query-error';

export default function DashboardOverview() {
  const t = useTranslations('dashboard');
  const locale = useLocale();

  const { organization } = useOrganization();
  const tenant = trpc.tenant.me.useQuery();
  const artifacts = trpc.artifact.list.useQuery({});
  const dashboardOverview = trpc.agent.dashboardOverview.useQuery();
  const activityFeed = trpc.agent.dashboardActivityFeed.useQuery(undefined, { refetchInterval: 30_000 });
  const sufficiencyScore = trpc.knowledge.sufficiencyScore.useQuery();

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

  const data = dashboardOverview.data;
  const showKnowledgeBanner =
    !sufficiencyScore.isLoading &&
    sufficiencyScore.data !== undefined &&
    sufficiencyScore.data.score < 60 &&
    (artifacts.data?.length ?? 0) > 0;

  return (
    <div className="space-y-6 md:space-y-8 lg:space-y-10">
      <div className="flex items-center gap-3">
        <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl lg:text-3xl">{tenant.data?.name ?? t('pageTitle')}</h1>
        {tenant.data?.planTier && (
          <Badge variant={tenant.data.planTier}>{tenant.data.planTier}</Badge>
        )}
      </div>

      {/* ===== Public Chat Link ===== */}
      {tenant.data?.slug && <ShareLinkCard slug={tenant.data.slug} t={t} />}

      {showKnowledgeBanner && (
        <KnowledgeBanner
          agentName={artifacts.data![0]!.name}
          score={sufficiencyScore.data!.score}
          topSignal={sufficiencyScore.data!.signals[0] ?? ''}
          t={t}
        />
      )}

      {dashboardOverview.isError && <QueryError error={dashboardOverview.error} onRetry={() => dashboardOverview.refetch()} />}
      {artifacts.isError && <QueryError error={artifacts.error} onRetry={() => artifacts.refetch()} />}

      {/* ===== Hero Metrics ===== */}
      <div className="grid grid-cols-2 gap-4 md:gap-5 lg:grid-cols-4 lg:gap-6">
        <StatCard title={t('todayConversations')} value={data?.todayConversations ?? 0} />
        <StatCard title={t('weekConversations')} value={data?.weekConversations ?? 0} />
        <StatCard title={t('pendingApprovals')} value={data?.pendingApprovalsCount ?? 0} />
        <StatCard title={t('activeLeads')} value={data?.activeLeadsCount ?? 0} />
      </div>

      {/* ===== Your Agents ===== */}
      <YourAgentsSection agents={artifacts.data?.filter((a) => a.isActive && a.type === 'sales')} t={t} />

      {/* ===== Activity Feed ===== */}
      <ActivityFeedSection events={activityFeed.data?.events} locale={locale} t={t} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Your agents section
// ---------------------------------------------------------------------------

type ArtifactListItem = { id: string; name: string; isActive: boolean; type: string };

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <div key={agent.id} className="flex items-center gap-3 rounded-lg border border-charcoal/8 p-4">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${agent.isActive ? 'bg-teal' : 'bg-dune'}`}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate font-medium text-charcoal">{agent.name}</span>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {t(`agentType_${agent.type}` as Parameters<typeof t>[0])}
                </Badge>
                <Link href={`/dashboard/agents/${agent.id}`} className="shrink-0 text-sm text-teal hover:underline">
                  {t('agentOpen')}
                </Link>
              </div>
            ))}
          </div>
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
            {events.slice(0, 5).map((event) => (
              <li key={event.id} className="flex items-center gap-3 text-sm">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${EVENT_TYPE_COLORS[event.eventType]}`}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate text-charcoal">
                  {t(`event_${event.eventType}` as Parameters<typeof t>[0])} — {event.artifactName}
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs text-dune">
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
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
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
