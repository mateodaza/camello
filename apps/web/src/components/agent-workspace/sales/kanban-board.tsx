'use client';

import { memo, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { fmtMoney, fmtTimeAgo } from '@/lib/format';
import { STAGES, type Stage, scoreDots, stageKey } from './constants';

const stageAccent: Record<string, string> = {
  new: 'border-t-charcoal/30',
  qualifying: 'border-t-gold',
  proposal: 'border-t-gold',
  negotiation: 'border-t-teal',
  closed_won: 'border-t-teal',
  closed_lost: 'border-t-dune',
};

export interface KanbanLead {
  id: string;
  score: string;
  stage: string;
  estimatedValue: string | null;
  qualifiedAt: Date | string;
  customerName: string | null;
  customerEmail: string | null;
}

interface KanbanBoardProps {
  leads: KanbanLead[];
  onStageChange: (leadId: string, stage: Stage) => void;
  onLeadClick: (leadId: string) => void;
  isPending?: boolean;
}

export const KanbanBoard = memo(function KanbanBoard({ leads, onStageChange, onLeadClick, isPending }: KanbanBoardProps) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();

  const byStage = useMemo(() =>
    STAGES.reduce<Record<Stage, KanbanLead[]>>((acc, s) => {
      acc[s] = leads.filter((l) => l.stage === s);
      return acc;
    }, {} as Record<Stage, KanbanLead[]>),
    [leads],
  );

  return (
    <div className="snap-x snap-mandatory overflow-x-auto pb-2">
      <div className="grid min-w-[1200px] grid-cols-6 gap-3">
        {STAGES.map((stage) => {
          const stageLeads = byStage[stage];
          const totalValue = stageLeads.reduce((sum, l) => sum + Number(l.estimatedValue ?? 0), 0);

          return (
            <div key={stage} className="flex snap-start flex-col gap-2" style={{ minWidth: 200 }}>
              {/* Column header */}
              <div className={`rounded-lg border-t-2 bg-charcoal/5 px-3 py-2 ${stageAccent[stage] ?? ''}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-dune">
                    {t(`salesStage${stageKey(stage)}` as Parameters<typeof t>[0])}
                  </span>
                  <span className="rounded-full bg-charcoal/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-charcoal/70">{stageLeads.length}</span>
                </div>
                {totalValue > 0 && (
                  <p className="mt-0.5 text-xs font-semibold text-charcoal tabular-nums">
                    {fmtMoney(totalValue, locale)}
                  </p>
                )}
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2">
                {stageLeads.map((lead) => {
                  const displayName = lead.customerName ?? lead.customerEmail ?? '—';
                  return (
                    <button
                      key={lead.id}
                      type="button"
                      className="rounded-lg border border-charcoal/10 bg-cream p-3 text-left shadow-sm transition-shadow hover:shadow-md"
                      onClick={() => onLeadClick(lead.id)}
                      aria-label={t('alertViewLead', { name: displayName })}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${scoreDots[lead.score] ?? 'bg-charcoal/30'}`}
                          role="img"
                          aria-label={t('scoreLabel', { score: lead.score })}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-charcoal">
                            {displayName}
                          </p>
                          {lead.estimatedValue && Number(lead.estimatedValue) > 0 && (
                            <p className="text-xs font-semibold tabular-nums text-teal">
                              {fmtMoney(lead.estimatedValue, locale)}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-dune">{fmtTimeAgo(lead.qualifiedAt)}</p>
                        </div>
                      </div>

                      {/* Stage-change dropdown (stops propagation so it doesn't open the sheet) */}
                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={lead.stage}
                          disabled={isPending}
                          onChange={(e) => onStageChange(lead.id, e.target.value as Stage)}
                          aria-label={t('changeStageFor', { name: displayName })}
                          className="w-full rounded border border-charcoal/10 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal disabled:opacity-50"
                        >
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {t(`salesStage${stageKey(s)}` as Parameters<typeof t>[0])}
                            </option>
                          ))}
                        </select>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
