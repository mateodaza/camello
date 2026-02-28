'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-teal';
  if (score >= 50) return 'text-gold';
  return 'text-sunset';
}

interface WorkspaceHeaderProps {
  artifact: { id: string; name: string; type: string; isActive: boolean };
  metrics: {
    totalExecutions: number;
    autonomousExecutions: number;
    pendingApprovals: number;
    automationScore: number;
    conversationCount: number;
  };
  boundModules: Array<{ slug: string; name: string; autonomyLevel: string }>;
}

export function WorkspaceHeader({ artifact, metrics, boundModules }: WorkspaceHeaderProps) {
  const t = useTranslations('agentWorkspace');

  return (
    <div className="space-y-4">
      {/* Name + badge + modules */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">
          {artifact.name}
        </h1>
        <Badge variant={artifact.type}>{artifact.type}</Badge>
        <Badge variant={artifact.isActive ? 'active' : 'default'}>
          {artifact.isActive ? t('activeLabel') : t('inactiveLabel')}
        </Badge>
      </div>

      {/* Bound modules */}
      {boundModules.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-dune">{t('boundModules')}:</span>
          {boundModules.map((m) => (
            <Badge key={m.slug} variant="default" className="text-xs">
              {m.name}
            </Badge>
          ))}
        </div>
      )}

      {/* KPI stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard title={t('metricTotal')} value={metrics.totalExecutions} />
        <StatCard title={t('metricAutonomous')} value={metrics.autonomousExecutions} />
        <StatCard title={t('metricPending')} value={metrics.pendingApprovals} />
        <div>
          <StatCard title={t('metricConversations')} value={metrics.conversationCount} />
          <Link
            href="/dashboard/conversations"
            className="mt-1 block text-xs text-teal hover:underline"
          >
            {t('viewAllConversations')}
          </Link>
        </div>
        <div>
          <StatCard
            title={t('metricAutomationScore')}
            value={`${metrics.automationScore}%`}
          />
          <div className={`mt-1 text-xs font-semibold ${getScoreColor(metrics.automationScore)}`}>
            {metrics.automationScore >= 80 ? t('scoreHigh') : metrics.automationScore >= 50 ? t('scoreMedium') : t('scoreLow')}
          </div>
        </div>
      </div>
    </div>
  );
}
