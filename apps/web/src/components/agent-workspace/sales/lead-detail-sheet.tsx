'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { fmtMoney, fmtDateTime, fmtCost, humanize } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';

const STAGES = ['new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;
type Stage = typeof STAGES[number];

const CLOSED_STAGES: Stage[] = ['closed_won', 'closed_lost'];

const scoreDots: Record<string, string> = {
  hot: 'bg-teal',
  warm: 'bg-gold',
  cold: 'bg-charcoal/30',
};

function stageKey(s: string): string {
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

interface LeadDetailSheetProps {
  leadId: string | null;
  onClose: () => void;
  onStageChange: (leadId: string, stage: Stage, closeReason?: string) => void;
}

export function LeadDetailSheet({ leadId, onClose, onStageChange }: LeadDetailSheetProps) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();
  const { addToast } = useToast();

  const [pendingStage, setPendingStage] = useState<Stage | null>(null);
  const [closeReason, setCloseReason] = useState('');

  const query = trpc.agent.salesLeadDetail.useQuery(
    { leadId: leadId! },
    { enabled: !!leadId },
  );

  const { lead, customer, attribution, interactions, executions } = query.data ?? {};

  function handleStageClick(stage: Stage) {
    if (CLOSED_STAGES.includes(stage)) {
      setPendingStage(stage);
    } else if (leadId) {
      onStageChange(leadId, stage);
      setPendingStage(null);
    }
  }

  function confirmClose() {
    if (!leadId || !pendingStage) return;
    onStageChange(leadId, pendingStage, closeReason.trim() || undefined);
    setPendingStage(null);
    setCloseReason('');
    addToast(t('stageUpdated'), 'success');
  }

  type TimelineItem =
    | { kind: 'interaction'; intent: string | null; costUsd: string | null; latencyMs: number | null; createdAt: Date | string }
    | { kind: 'execution'; moduleSlug: string; status: string; createdAt: Date | string };

  const timeline: TimelineItem[] = [
    ...(interactions ?? []).map((i) => ({ kind: 'interaction' as const, ...i })),
    ...(executions ?? []).map((e) => ({ kind: 'execution' as const, ...e })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Sheet open={!!leadId} onClose={onClose}>
      <SheetHeader>
        <SheetTitle>{t('leadDetail')}</SheetTitle>
        <button onClick={onClose} className="rounded p-1 text-dune hover:bg-charcoal/5" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </SheetHeader>

      <SheetContent>
        {query.isLoading && (
          <div className="flex h-40 items-center justify-center text-sm text-dune">{t('loading')}</div>
        )}

        {query.isError && (
          <div className="rounded-lg bg-sunset/10 p-3 text-sm text-sunset">{t('errorLoading')}</div>
        )}

        {lead && customer && (
          <div className="space-y-5">
            {/* 1. Customer header */}
            <div>
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${scoreDots[lead.score] ?? 'bg-charcoal/30'}`} />
                <div>
                  <h3 className="font-heading text-lg font-semibold text-charcoal">
                    {customer.name ?? customer.email ?? '—'}
                  </h3>
                  {customer.email && <p className="text-sm text-dune">{customer.email}</p>}
                  {customer.phone && <p className="text-sm text-dune">{customer.phone}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant={lead.score}>
                  {t(`salesScore${lead.score.charAt(0).toUpperCase()}${lead.score.slice(1)}` as Parameters<typeof t>[0])}
                </Badge>
                <Badge variant="default">
                  {t(`salesStage${stageKey(lead.stage)}` as Parameters<typeof t>[0])}
                </Badge>
                {lead.estimatedValue && Number(lead.estimatedValue) > 0 && (
                  <Badge variant="active">{fmtMoney(lead.estimatedValue, locale)}</Badge>
                )}
              </div>
              {(lead.budget || lead.timeline) && (
                <div className="mt-2 flex gap-4 text-sm text-dune">
                  {lead.budget && <span>{t('leadBudget')}: {lead.budget}</span>}
                  {lead.timeline && <span>{t('leadTimeline')}: {lead.timeline}</span>}
                </div>
              )}
              {lead.summary && <p className="mt-2 text-sm text-charcoal/80">{lead.summary}</p>}
            </div>

            {/* 2. Stage actions */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dune">{t('leadMoveStage')}</p>
              <div className="flex flex-wrap gap-1.5">
                {STAGES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStageClick(s)}
                    disabled={s === lead.stage}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-40 ${
                      s === lead.stage
                        ? 'border-teal bg-teal/10 text-teal'
                        : 'border-charcoal/15 bg-white text-charcoal hover:border-teal hover:bg-teal/5'
                    }`}
                  >
                    {t(`salesStage${stageKey(s)}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>

              {pendingStage && (
                <div className="mt-3 rounded-lg border border-charcoal/15 p-3">
                  <p className="mb-2 text-sm font-medium text-charcoal">
                    {t('leadCloseReason')} <span className="text-dune">({t('optional')})</span>
                  </p>
                  <textarea
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    maxLength={200}
                    rows={2}
                    placeholder={t('leadCloseReasonPlaceholder')}
                    className="w-full resize-none rounded border border-charcoal/15 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={confirmClose}
                      className="rounded-md bg-charcoal px-3 py-1.5 text-xs font-medium text-cream hover:bg-charcoal/80"
                    >
                      {t('confirm')} — {t(`salesStage${stageKey(pendingStage)}` as Parameters<typeof t>[0])}
                    </button>
                    <button
                      onClick={() => { setPendingStage(null); setCloseReason(''); }}
                      className="rounded-md border border-charcoal/15 px-3 py-1.5 text-xs font-medium text-dune hover:bg-charcoal/5"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Attribution */}
            {attribution && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dune">{t('leadAttribution')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: attribution.totalMessages, label: t('leadMessages') },
                    { value: attribution.totalInteractions, label: t('leadInteractions') },
                    { value: fmtCost(attribution.totalCost, locale), label: t('leadCost') },
                  ].map(({ value, label }) => (
                    <div key={label} className="rounded-lg bg-charcoal/4 p-2.5 text-center">
                      <p className="text-lg font-bold tabular-nums">{value}</p>
                      <p className="text-xs text-dune">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. AI Timeline */}
            {timeline.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dune">{t('leadTimeline')}</p>
                <div className="space-y-1.5">
                  {timeline.map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-md bg-charcoal/3 px-2.5 py-2">
                      {item.kind === 'interaction' ? (
                        <>
                          <Badge variant="default" className="shrink-0 text-xs">
                            {item.intent ? humanize(item.intent) : 'AI'}
                          </Badge>
                          <span className="text-xs text-dune">{fmtDateTime(item.createdAt, locale)}</span>
                          {item.costUsd && <span className="text-xs text-dune">{fmtCost(item.costUsd, locale)}</span>}
                        </>
                      ) : (
                        <>
                          <Badge
                            variant={item.status === 'executed' ? 'active' : item.status === 'pending' ? 'pending' : 'default'}
                            className="shrink-0 text-xs"
                          >
                            {humanize(item.moduleSlug)}
                          </Badge>
                          <span className="text-xs text-dune">{fmtDateTime(item.createdAt, locale)}</span>
                          <span className="text-xs text-dune">{item.status}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
