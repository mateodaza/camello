'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { fmtMoney, fmtDateTime, fmtCost, humanize } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { STAGES, CLOSED_STAGES, type Stage, scoreDots, stageKey } from './constants';

interface LeadDetailSheetProps {
  leadId: string | null;
  onClose: () => void;
  onStageChange: (leadId: string, stage: Stage, closeReason?: string) => void;
}

const ATTRIBUTION_KEYS = ['messages', 'interactions', 'cost'] as const;

export type TimelineItem =
  | { kind: 'interaction'; intent: string | null; costUsd: string | null; latencyMs: number | null; createdAt: Date | string }
  | { kind: 'execution';   moduleSlug: string; status: string; createdAt: Date | string }
  | { kind: 'note';        author: string; content: string; createdAt: Date | string }
  | { kind: 'message';     role: string; content: string; createdAt: Date | string }
  | { kind: 'stageChange'; fromStage: string; toStage: string; createdAt: Date | string }
  | { kind: 'summary';     text: string; createdAt: Date | string };

export function buildTimeline(data: {
  interactions?: Array<{ intent: string | null; costUsd: string | null; latencyMs: number | null; createdAt: Date | string }>;
  executions?:   Array<{ moduleSlug: string; status: string; createdAt: Date | string }>;
  notes?:        Array<{ author: string; content: string; createdAt: Date | string }>;
  messages?:     Array<{ role: string; content: string; createdAt: Date | string }>;
  stageChanges?: Array<{ fromStage: string; toStage: string; createdAt: Date | string }>;
  conversationSummary?: { text: string; createdAt: Date | string } | null;
}): TimelineItem[] {
  return [
    ...(data.interactions ?? []).map((i) => ({ kind: 'interaction' as const, ...i })),
    ...(data.executions   ?? []).map((e) => ({ kind: 'execution'   as const, ...e })),
    ...(data.notes        ?? []).map((n) => ({ kind: 'note'        as const, ...n })),
    ...(data.messages     ?? []).map((m) => ({ kind: 'message'     as const, ...m })),
    ...(data.stageChanges ?? []).map((s) => ({ kind: 'stageChange' as const, ...s })),
    ...(data.conversationSummary
      ? [{ kind: 'summary' as const, ...data.conversationSummary }]
      : []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function LeadDetailSheet({ leadId, onClose, onStageChange }: LeadDetailSheetProps) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();
  const { addToast } = useToast();
  const utils = trpc.useUtils();

  const [pendingStage, setPendingStage] = useState<Stage | null>(null);
  const [closeReason, setCloseReason] = useState('');
  const [noteText, setNoteText] = useState('');

  const query = trpc.agent.salesLeadDetail.useQuery(
    { leadId: leadId! },
    { enabled: !!leadId },
  );

  const addLeadNoteMut = trpc.agent.addLeadNote.useMutation({
    onSuccess: () => {
      utils.agent.salesLeadDetail.invalidate({ leadId: leadId! });
      addToast(t('leadNoteAdded'), 'success');
      setNoteText('');
    },
    onError: () => addToast(t('errorLoading'), 'error'),
  });

  const { lead, customer, attribution, interactions, executions, notes, messages, stageChanges,
          conversationSummary, conversationResolvedAt } = query.data ?? {};

  const isNotePending = addLeadNoteMut.isPending;

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

  const timeline = useMemo<TimelineItem[]>(() => {
    return buildTimeline({
      interactions, executions, notes, messages, stageChanges,
      conversationSummary: conversationSummary && conversationResolvedAt
        ? { text: conversationSummary, createdAt: conversationResolvedAt }
        : null,
    });
  }, [interactions, executions, notes, messages, stageChanges, conversationSummary, conversationResolvedAt]);

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
                <span
                  className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${scoreDots[lead.score] ?? 'bg-charcoal/30'}`}
                  role="img"
                  aria-label={t('scoreLabel', { score: lead.score })}
                />
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
                    className={`min-h-[36px] rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-40 ${
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
                  <label htmlFor="close-reason" className="mb-2 block text-sm font-medium text-charcoal">
                    {t('leadCloseReason')} <span className="text-dune">({t('optional')})</span>
                  </label>
                  <textarea
                    id="close-reason"
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
                  ].map(({ value, label }, index) => (
                    <div key={ATTRIBUTION_KEYS[index]} className="rounded-lg bg-charcoal/5 p-2.5 text-center">
                      <p className="text-lg font-bold tabular-nums">{value}</p>
                      <p className="text-xs text-dune">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Notes input */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dune">{t('leadNotesTitle')}</p>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                maxLength={500}
                placeholder={t('leadNotePlaceholder')}
                className="w-full resize-none rounded border border-charcoal/15 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
                style={{ minHeight: '36px' }}
              />
              <button
                onClick={() => addLeadNoteMut.mutate({ leadId: leadId!, content: noteText })}
                disabled={!noteText.trim() || isNotePending}
                className="mt-2 min-h-[36px] rounded-md bg-teal px-3 py-1.5 text-xs font-medium text-cream hover:bg-teal/80 disabled:cursor-default disabled:opacity-40"
              >
                {t('leadNoteSubmit')}
              </button>
            </div>

            {/* 5. AI Timeline */}
            {timeline.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dune">{t('leadTimeline')}</p>
                <div className="space-y-1.5">
                  {timeline.map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-md bg-charcoal/5 px-2.5 py-2">
                      {item.kind === 'interaction' ? (
                        <>
                          <Badge variant="default" className="shrink-0 text-xs">
                            {item.intent ? humanize(item.intent) : 'AI'}
                          </Badge>
                          <span className="text-xs text-dune">{fmtDateTime(item.createdAt, locale)}</span>
                          {item.costUsd && <span className="text-xs text-dune">{fmtCost(item.costUsd, locale)}</span>}
                        </>
                      ) : item.kind === 'execution' ? (
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
                      ) : item.kind === 'note' ? (
                        <>
                          <Badge variant="default" className="shrink-0 text-xs">
                            {item.author === 'owner' ? t('leadNoteAuthorOwner') : t('leadNoteAuthorSystem')}
                          </Badge>
                          <span className="flex-1 text-xs text-charcoal">{item.content}</span>
                          <span className="text-xs text-dune">{fmtDateTime(item.createdAt, locale)}</span>
                        </>
                      ) : item.kind === 'message' ? (
                        <>
                          <Badge variant="default" className="shrink-0 text-xs">
                            {item.role}
                          </Badge>
                          <span className="flex-1 truncate text-xs text-charcoal/80">
                            {item.content.length > 80 ? `${item.content.slice(0, 80)}…` : item.content}
                          </span>
                          <span className="text-xs text-dune">{fmtDateTime(item.createdAt, locale)}</span>
                        </>
                      ) : item.kind === 'summary' ? (
                        <>
                          <Badge variant="default" className="shrink-0 text-xs">
                            {t('leadConversationSummary')}
                          </Badge>
                          <span className="flex-1 text-xs text-charcoal/80">{item.text}</span>
                          <span className="text-xs text-dune">{fmtDateTime(item.createdAt, locale)}</span>
                        </>
                      ) : (
                        <>
                          <Badge variant="default" className="shrink-0 text-xs">
                            {t('leadTimelineStageChange')}
                          </Badge>
                          <span className="text-xs text-charcoal">{item.fromStage} → {item.toStage}</span>
                          <span className="text-xs text-dune">{fmtDateTime(item.createdAt, locale)}</span>
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
