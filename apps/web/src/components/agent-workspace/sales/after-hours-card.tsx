'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { Moon } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { fmtMoney, fmtInt } from '@/lib/format';

interface AfterHoursCardProps {
  artifactId: string;
}

export function AfterHoursCard({ artifactId }: AfterHoursCardProps) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const query = trpc.agent.salesAfterHours.useQuery({ artifactId });
  const data = query.data;

  if (!data || data.afterHoursConversations === 0) return null;

  return (
    <Card className="border-midnight/20 bg-midnight text-cream">
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-white/10 p-2">
            <Moon className="h-5 w-5 text-gold" />
          </div>
          <div>
            <p className="font-heading text-xl font-bold tabular-nums">
              {t('afterHoursHeadline', {
                count: fmtInt(data.afterHoursConversations, locale),
                value: fmtMoney(data.afterHoursPipelineValue, locale),
              })}
            </p>
            <p className="mt-1 text-sm text-cream/60">
              {t('afterHoursSubtext', { timezone: data.timezone })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
