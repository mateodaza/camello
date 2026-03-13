'use client';

import { useLocale, useTranslations } from 'next-intl';
import { fmtMoney } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { stageKey } from './constants';

export interface ForecastData {
  totalForecast: number;
  stages: Array<{
    stage: string;
    leadCount: number;
    pipelineValue: number;
    conversionRate: number;
    isFallback: boolean;
    forecastValue: number;
  }>;
}

export function ForecastCard({ artifactId: _artifactId, salesForecast }: { artifactId: string; salesForecast: ForecastData | undefined }) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('salesForecast30d')}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-bold tabular-nums text-charcoal">
          {fmtMoney(salesForecast?.totalForecast ?? 0, locale)}
        </p>
        {salesForecast && salesForecast.stages.length > 0 ? (
          <div className="mt-3 space-y-2">
            {salesForecast.stages.map((s) => (
              <div key={s.stage} className="flex items-center justify-between text-sm">
                <span className="text-dune">
                  {t(`salesStage${stageKey(s.stage)}` as Parameters<typeof t>[0])}
                </span>
                <span className="text-dune">
                  {Math.round(s.conversionRate * 100)}%
                  {s.isFallback && (
                    <span className="ml-1 text-xs text-dune/70">({t('salesForecastEstimated')})</span>
                  )}
                </span>
                <span className="tabular-nums text-charcoal">{fmtMoney(s.forecastValue, locale)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-dune">{t('salesForecastEmpty')}</p>
        )}
      </CardContent>
    </Card>
  );
}
