'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Bot, ArrowRight } from 'lucide-react';

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-teal';
  if (score >= 50) return 'text-gold';
  return 'text-sunset';
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-teal/10';
  if (score >= 50) return 'bg-gold/10';
  return 'bg-sunset/10';
}

function getScoreBarColor(score: number): string {
  if (score >= 80) return 'bg-teal';
  if (score >= 50) return 'bg-gold';
  return 'bg-sunset';
}

const autonomyDot: Record<string, string> = {
  fully_autonomous: 'bg-teal',
  draft_and_approve: 'bg-gold',
  suggest_only: 'bg-dune',
};

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
  const initial = artifact.name.charAt(0).toUpperCase();

  return (
    <div className="rounded-xl bg-charcoal/[0.03] p-4 sm:p-5">
      {/* Identity row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar initial */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal/15 font-heading text-lg font-bold text-teal">
            {initial}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-xl font-bold text-charcoal sm:text-2xl">
              {artifact.name}
            </h1>
            <Badge variant={artifact.type}>{artifact.type}</Badge>
            <Badge variant={artifact.isActive ? 'active' : 'default'}>
              {artifact.isActive ? t('activeLabel') : t('inactiveLabel')}
            </Badge>
          </div>
        </div>
        {boundModules.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {boundModules.map((m) => (
              <span
                key={m.slug}
                className="inline-flex items-center gap-1.5 rounded-md bg-cream px-2 py-0.5 text-xs font-medium text-dune ring-1 ring-charcoal/10"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${autonomyDot[m.autonomyLevel] ?? 'bg-charcoal/30'}`} />
                {m.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* KPI strip — items-stretch so all cards match height */}
      <div className="mt-4 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-12">
        {/* Conversations — hero stat */}
        <Card className="border-teal/15 sm:col-span-4">
          <CardContent className="flex h-full items-start gap-3 py-4">
            <div className="mt-0.5 rounded-lg bg-teal/10 p-2.5">
              <MessageSquare className="h-5 w-5 text-teal" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-dune">{t('metricConversations')}</p>
              <p className="font-heading text-2xl font-bold tabular-nums text-charcoal">{metrics.conversationCount}</p>
              <Link
                href="/dashboard/conversations"
                className="mt-1 inline-flex items-center gap-1 text-xs text-teal hover:underline"
              >
                {t('viewAllConversations')} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Automation score — hero stat with progress bar */}
        <Card className={`sm:col-span-3 ${getScoreBg(metrics.automationScore)}`}>
          <CardContent className="flex h-full items-start gap-3 py-4">
            <div className={`mt-0.5 rounded-lg p-2.5 ${metrics.automationScore >= 80 ? 'bg-teal/15' : metrics.automationScore >= 50 ? 'bg-gold/15' : 'bg-sunset/15'}`}>
              <Bot className={`h-5 w-5 ${getScoreColor(metrics.automationScore)}`} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-dune">{t('metricAutomationScore')}</p>
              <div className="flex items-baseline gap-2">
                <p className={`font-heading text-2xl font-bold tabular-nums ${getScoreColor(metrics.automationScore)}`}>
                  {metrics.automationScore}%
                </p>
                <span className={`text-xs font-semibold ${getScoreColor(metrics.automationScore)}`}>
                  {metrics.automationScore >= 80 ? t('scoreHigh') : metrics.automationScore >= 50 ? t('scoreMedium') : t('scoreLow')}
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full rounded-full bg-charcoal/10">
                <div
                  className={`h-1 rounded-full transition-all ${getScoreBarColor(metrics.automationScore)}`}
                  style={{ width: `${Math.min(metrics.automationScore, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Secondary stats strip */}
        <Card className="sm:col-span-5">
          <CardContent className="flex h-full items-center py-4">
            <div className="grid w-full grid-cols-3 divide-x divide-charcoal/10 text-center">
              <div className="px-2">
                <p className="text-xs font-medium text-dune">{t('metricTotalShort')}</p>
                <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">{metrics.totalExecutions}</p>
              </div>
              <div className="px-2">
                <p className="text-xs font-medium text-dune">{t('metricAutonomousShort')}</p>
                <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-charcoal">{metrics.autonomousExecutions}</p>
              </div>
              <div className="px-2">
                <p className="text-xs font-medium text-dune">{t('metricPendingShort')}</p>
                <p className={`mt-1 font-heading text-2xl font-bold tabular-nums ${metrics.pendingApprovals > 0 ? 'text-gold' : 'text-charcoal'}`}>{metrics.pendingApprovals}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
