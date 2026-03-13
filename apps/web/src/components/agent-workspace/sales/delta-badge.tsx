'use client';

import { useTranslations } from 'next-intl';
import { fmtMoney } from '@/lib/format';

export interface DeltaBadgeProps {
  current: number;
  pct: number | null;
  format?: 'count' | 'currency';
  locale?: string;
}

export function DeltaBadge({ current, pct, format = 'count', locale }: DeltaBadgeProps) {
  const t = useTranslations('agentWorkspace');

  if (pct === null && current === 0) {
    return <span className="text-xs text-dune">—</span>;
  }
  if (pct === null && current > 0) {
    const text = format === 'currency'
      ? t('salesComparisonBadgeCurrencyNew', { amount: fmtMoney(current, locale ?? 'en') })
      : t('salesComparisonBadgeCountNew', { count: current });
    return <span className="text-xs font-medium text-teal">{text}</span>;
  }
  if (pct === null || pct === 0) {
    return <span className="text-xs text-dune">—</span>;
  }
  if (pct > 0) {
    return <span className="text-xs font-medium text-teal">↑{pct}%</span>;
  }
  return <span className="text-xs font-medium" style={{ color: 'var(--color-sunset)' }}>↓{Math.abs(pct)}%</span>;
}
