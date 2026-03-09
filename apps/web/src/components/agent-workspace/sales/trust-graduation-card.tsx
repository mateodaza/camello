'use client';

import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface BoundModule {
  moduleId: string;
  slug: string;
  name: string;
  autonomyLevel: string;
}

interface TrustGraduationCardProps {
  artifactId: string;
  boundModules: BoundModule[];
  onGoToModules?: () => void;
}

export function TrustGraduationCard({
  artifactId,
  boundModules,
  onGoToModules,
}: TrustGraduationCardProps) {
  const t = useTranslations('agentWorkspace');

  const streaksQuery = trpc.agent.moduleStreaks.useQuery({ artifactId });

  const total = boundModules.length;
  const fullyAutonomousCount = boundModules.filter(
    (m) => m.autonomyLevel === 'fully_autonomous',
  ).length;
  const progressPct = total > 0 ? Math.round((fullyAutonomousCount / total) * 100) : 0;

  const streakMap = new Map<string, number>(
    (streaksQuery.data ?? []).map((s) => [s.moduleSlug, s.streak]),
  );

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold text-charcoal">
            {t('trustTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-dune">{t('trustEmpty')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base font-semibold text-charcoal">
          {t('trustTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress summary */}
        <div className="space-y-1.5">
          <p className="text-sm text-charcoal">
            {t('trustProgress', { autonomous: fullyAutonomousCount, total })}
          </p>
          <div className="h-2 w-full rounded-full bg-charcoal/8">
            <div
              className="h-2 rounded-full bg-teal transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Module list */}
        <ul className="space-y-2">
          {boundModules.map((mod) => {
            const streak = streakMap.get(mod.slug) ?? 0;
            const isDraftAndApprove = mod.autonomyLevel === 'draft_and_approve';

            let badgeBg = 'bg-charcoal/30 text-white';
            if (mod.autonomyLevel === 'fully_autonomous') badgeBg = 'bg-teal text-white';
            else if (mod.autonomyLevel === 'draft_and_approve') badgeBg = 'bg-gold text-charcoal';

            let autonomyKey: 'autonomyFullyAutonomous' | 'autonomyDraftAndApprove' | 'autonomySuggestOnly' =
              'autonomySuggestOnly';
            if (mod.autonomyLevel === 'fully_autonomous') autonomyKey = 'autonomyFullyAutonomous';
            else if (mod.autonomyLevel === 'draft_and_approve') autonomyKey = 'autonomyDraftAndApprove';

            return (
              <li key={mod.moduleId} className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-charcoal">{mod.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeBg}`}>
                  {t(autonomyKey)}
                </span>
                {streaksQuery.isLoading && isDraftAndApprove && (
                  <Skeleton className="h-5 w-24 rounded-full" />
                )}
                {!streaksQuery.isLoading && isDraftAndApprove && streak > 0 && (
                  <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-charcoal">
                    {t('trustStreakCount', { count: streak })}
                  </span>
                )}
                {!streaksQuery.isLoading && isDraftAndApprove && streak >= 10 && (
                  <span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal">
                    {t('trustStreakReady')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {/* CTA */}
        <button
          type="button"
          onClick={onGoToModules}
          className="min-h-[36px] rounded-md bg-teal/10 px-4 py-2 text-sm font-medium text-teal hover:bg-teal/20"
        >
          {t('trustGoToModules')}
        </button>
      </CardContent>
    </Card>
  );
}
