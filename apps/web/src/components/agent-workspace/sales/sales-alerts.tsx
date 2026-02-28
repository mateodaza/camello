'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { fmtMoney, humanize } from '@/lib/format';

interface SalesAlertsProps {
  artifactId: string;
  onLeadClick: (leadId: string) => void;
}

export function SalesAlerts({ artifactId, onLeadClick }: SalesAlertsProps) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const query = trpc.agent.salesAlerts.useQuery({ artifactId });
  const data = query.data;

  if (!data) return null;

  const { staleLeads, pendingApprovals, highValueEarly } = data;
  const hasAlerts = staleLeads.length > 0 || pendingApprovals.length > 0 || highValueEarly.length > 0;

  if (!hasAlerts) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-dune">{t('alertsTitle')}</p>

      {/* Stale leads — sunset border */}
      {staleLeads.map((lead) => (
        <div
          key={lead.id}
          className="flex items-center gap-3 rounded-lg border-l-4 border-sunset bg-sunset/5 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-charcoal">{lead.customerName ?? '—'}</p>
            <p className="text-xs text-dune">
              {t(`salesStage${lead.stage.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}` as Parameters<typeof t>[0])}
              {' · '}
              {t('alertStaleDays', { days: lead.daysSinceActivity })}
              {lead.estimatedValue && Number(lead.estimatedValue) > 0
                ? ` · ${fmtMoney(lead.estimatedValue, locale)}`
                : ''}
            </p>
          </div>
          <button
            onClick={() => onLeadClick(lead.id)}
            className="shrink-0 rounded-md border border-charcoal/15 px-2.5 py-1 text-xs font-medium text-charcoal hover:bg-charcoal/5"
          >
            {t('alertView')}
          </button>
        </div>
      ))}

      {/* Pending approvals — gold border */}
      {pendingApprovals.map((exec) => (
        <div
          key={exec.id}
          className="flex items-center gap-3 rounded-lg border-l-4 border-gold bg-gold/5 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-charcoal">{humanize(exec.moduleSlug)}</p>
            <p className="text-xs text-dune">{t('alertPendingApproval')}</p>
          </div>
        </div>
      ))}

      {/* High-value early — teal border */}
      {highValueEarly.map((lead) => (
        <div
          key={lead.id}
          className="flex items-center gap-3 rounded-lg border-l-4 border-teal bg-teal/5 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-charcoal">{lead.customerName ?? '—'}</p>
            <p className="text-xs text-dune">
              {lead.estimatedValue ? fmtMoney(lead.estimatedValue, locale) : ''}
              {' · '}
              {t('alertHighValue')}
            </p>
          </div>
          <button
            onClick={() => onLeadClick(lead.id)}
            className="shrink-0 rounded-md border border-charcoal/15 px-2.5 py-1 text-xs font-medium text-charcoal hover:bg-charcoal/5"
          >
            {t('alertView')}
          </button>
        </div>
      ))}
    </div>
  );
}
