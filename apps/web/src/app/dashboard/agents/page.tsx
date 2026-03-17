'use client';

import { useTranslations } from 'next-intl';
import { Bot, BrainCircuit } from 'lucide-react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/query-error';
import { EmptyState } from '@/components/dashboard/empty-state';

function StatusDot({
  isActive,
  activeLabel,
  inactiveLabel,
}: {
  isActive: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', isActive ? 'bg-teal' : 'bg-charcoal/30')} />
      <span className="text-xs text-dune">{isActive ? activeLabel : inactiveLabel}</span>
    </div>
  );
}

function AgentCard({
  icon: Icon,
  name,
  description,
  isActive,
  activeLabel,
  inactiveLabel,
  ctaLabel,
  href,
}: {
  icon: LucideIcon;
  name: string;
  description: string;
  isActive: boolean;
  activeLabel: string;
  inactiveLabel: string;
  ctaLabel: string;
  href: string;
}) {
  return (
    <Link href={href} data-testid="agent-card">
      <div className="rounded-xl border border-charcoal/8 bg-cream p-6 flex flex-col gap-4 hover:shadow-sm transition-shadow cursor-pointer">
        <div className="flex items-center gap-3">
          <Icon className="h-8 w-8 text-teal" />
          <span className="font-heading text-lg font-semibold text-charcoal">{name}</span>
        </div>
        <p className="text-sm text-dune flex-1">{description}</p>
        <div className="flex items-center justify-between">
          <StatusDot isActive={isActive} activeLabel={activeLabel} inactiveLabel={inactiveLabel} />
          <span className="text-sm font-medium text-teal">{ctaLabel} →</span>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-charcoal/8 bg-cream p-6 flex flex-col gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export default function AgentsIndexPage() {
  const t = useTranslations('agents');
  const { data, isLoading, isError, error, refetch } =
    trpc.artifact.list.useQuery({ activeOnly: false });

  if (isLoading) {
    return <div className="p-6"><SkeletonCards /></div>;
  }

  if (isError) {
    return (
      <div className="p-6">
        <QueryError error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Bot}
          title={t('pageTitle')}
          description={t('emptyDesc')}
          action={{ label: t('emptyAction'), href: '/onboarding' }}
        />
      </div>
    );
  }

  // Derive isActive per type. A missing artifact type shows gray dot — card still renders.
  const salesIsActive = data.find((a) => a.type === 'sales')?.isActive ?? false;
  const advisorIsActive = data.find((a) => a.type === 'advisor')?.isActive ?? false;

  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold text-charcoal mb-6">
        {t('pageTitle')}
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AgentCard
          icon={Bot}
          name={t('salesCard')}
          description={t('salesDesc')}
          isActive={salesIsActive}
          activeLabel={t('cardActive')}
          inactiveLabel={t('cardInactive')}
          ctaLabel={t('cardConfigure')}
          href="/dashboard/agent"
        />
        <AgentCard
          icon={BrainCircuit}
          name={t('advisorCard')}
          description={t('advisorDesc')}
          isActive={advisorIsActive}
          activeLabel={t('cardActive')}
          inactiveLabel={t('cardInactive')}
          ctaLabel={t('cardOpen')}
          href="/dashboard/agents/advisor"
        />
      </div>
    </div>
  );
}
