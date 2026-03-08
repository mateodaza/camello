'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { fmtMoney, humanize } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { stageKey } from './constants';

interface SalesAlertsProps {
  artifactId: string;
  onLeadClick: (leadId: string) => void;
}

type UiRejectionReason = 'wrong_info' | 'not_relevant' | 'bad_timing' | 'other';
type BackendRejectionReason = 'false_positive' | 'wrong_target' | 'bad_timing' | 'incorrect_data' | 'policy_violation';

const UI_TO_BACKEND_REASON: Record<UiRejectionReason, BackendRejectionReason> = {
  wrong_info: 'incorrect_data',
  not_relevant: 'false_positive',
  bad_timing: 'bad_timing',
  other: 'false_positive',
};

function renderInputPreview(moduleSlug: string, input: Record<string, unknown>): string | null {
  if (moduleSlug === 'send_quote') {
    const total = input.total ?? input.amount;
    const currency = input.currency ?? '';
    if (total) return `${String(currency)} ${String(total)}`.trim();
  }
  if (moduleSlug === 'collect_payment') {
    const amount = input.amount;
    const currency = input.currency ?? '';
    if (amount) return `${String(currency)} ${String(amount)}`.trim();
  }
  if (moduleSlug === 'book_meeting') {
    const url = input.calendar_url ?? input.calendarUrl;
    if (url) return String(url);
  }
  return null;
}

function AlertsSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-28 animate-pulse rounded bg-charcoal/10" />
      <div className="h-14 animate-pulse rounded-lg bg-charcoal/5" />
      <div className="h-14 animate-pulse rounded-lg bg-charcoal/5" />
    </div>
  );
}

export function SalesAlerts({ artifactId, onLeadClick }: SalesAlertsProps) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();
  const { addToast } = useToast();

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<UiRejectionReason>('bad_timing');
  const [rejectText, setRejectText] = useState('');

  const utils = trpc.useUtils();

  const approveMut = trpc.module.approve.useMutation({
    onMutate: async ({ executionId }) => {
      await utils.agent.salesAlerts.cancel({ artifactId });
      const prev = utils.agent.salesAlerts.getData({ artifactId });
      utils.agent.salesAlerts.setData({ artifactId }, (old) =>
        old
          ? { ...old, pendingApprovals: old.pendingApprovals.filter((e) => e.id !== executionId) }
          : old,
      );
      return { prev };
    },
    onSuccess: () => {
      utils.agent.salesAlerts.invalidate({ artifactId });
      utils.agent.salesQuotes.invalidate({ artifactId });
      utils.agent.salesPayments.invalidate({ artifactId });
      addToast(t('approvalConfirmed'), 'success');
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.agent.salesAlerts.setData({ artifactId }, ctx.prev);
      addToast(t('errorLoading'), 'error');
    },
  });

  const rejectMut = trpc.module.reject.useMutation({
    onSuccess: () => {
      setRejectingId(null);
      setRejectText('');
      setRejectReason('bad_timing');
      utils.agent.salesAlerts.invalidate({ artifactId });
      addToast(t('rejectionSent'), 'success');
    },
    onError: () => addToast(t('errorLoading'), 'error'),
  });

  const query = trpc.agent.salesAlerts.useQuery(
    { artifactId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
  );
  const data = query.data;

  if (query.isLoading) return <AlertsSkeleton />;
  if (!data) return null;

  const { staleLeads, pendingApprovals, highValueEarly } = data;
  const hasAlerts = staleLeads.length > 0 || pendingApprovals.length > 0 || highValueEarly.length > 0;

  if (!hasAlerts) return null;

  const approvingId = approveMut.isPending ? (approveMut.variables as { executionId: string })?.executionId : null;
  const rejectingBusyId = rejectMut.isPending ? (rejectMut.variables as { executionId: string })?.executionId : null;

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
              {t(`salesStage${stageKey(lead.stage)}` as Parameters<typeof t>[0])}
              {' · '}
              {t('alertStaleDays', { days: lead.daysSinceActivity })}
              {lead.estimatedValue && Number(lead.estimatedValue) > 0
                ? ` · ${fmtMoney(lead.estimatedValue, locale)}`
                : ''}
            </p>
          </div>
          <button
            onClick={() => onLeadClick(lead.id)}
            aria-label={t('alertViewLead', { name: lead.customerName ?? '—' })}
            className="shrink-0 rounded-md border border-charcoal/15 px-3 py-2.5 text-xs font-medium text-charcoal hover:bg-charcoal/5"
          >
            {t('alertView')}
          </button>
        </div>
      ))}

      {/* Pending approvals — gold border */}
      {pendingApprovals.map((exec) => {
        const inputData = (exec.input ?? {}) as Record<string, unknown>;
        const preview = renderInputPreview(exec.moduleSlug, inputData);
        const isRejecting = rejectingId === exec.id;

        return (
          <div
            key={exec.id}
            className="rounded-lg border-l-4 border-gold bg-gold/5 px-4 py-3"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-charcoal">{humanize(exec.moduleSlug)}</p>
                <p className="text-xs text-dune">{t('alertPendingApproval')}</p>
                {preview && (
                  <p className="mt-1 text-xs text-charcoal">
                    <span className="font-medium">{t('approvalPreview')}:</span> {preview}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => approveMut.mutate({ executionId: exec.id })}
                  disabled={approvingId === exec.id || rejectingBusyId === exec.id}
                  className="min-h-9 min-w-9 rounded-md bg-teal px-3 text-xs font-medium text-white hover:bg-teal/90 disabled:opacity-50"
                >
                  {t('approve')}
                </button>
                <button
                  type="button"
                  onClick={() => setRejectingId(exec.id)}
                  disabled={approvingId === exec.id || rejectingBusyId === exec.id}
                  className="min-h-9 min-w-9 rounded-md border border-charcoal/15 px-3 text-xs font-medium text-charcoal hover:bg-charcoal/5 disabled:opacity-50"
                >
                  {t('reject')}
                </button>
              </div>
            </div>

            {isRejecting && (
              <div className="mt-3 space-y-2 border-t border-gold/30 pt-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`reject-reason-${exec.id}`} className="text-xs font-medium text-charcoal">{t('rejectReason')}</label>
                  <select
                    id={`reject-reason-${exec.id}`}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value as UiRejectionReason)}
                    className="rounded-md border border-charcoal/20 bg-white px-2 py-1.5 text-xs text-charcoal"
                  >
                    <option value="wrong_info">{t('rejectReasonWrongInfo')}</option>
                    <option value="not_relevant">{t('rejectReasonNotRelevant')}</option>
                    <option value="bad_timing">{t('rejectReasonBadTiming')}</option>
                    <option value="other">{t('rejectReasonOther')}</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`reject-text-${exec.id}`} className="text-xs font-medium text-charcoal">{t('rejectFreeText')}</label>
                  <textarea
                    id={`reject-text-${exec.id}`}
                    value={rejectText}
                    onChange={(e) => setRejectText(e.target.value)}
                    rows={2}
                    maxLength={500}
                    aria-invalid={rejectReason === 'other' && rejectText.trim() === '' ? 'true' : undefined}
                    className="rounded-md border border-charcoal/20 bg-white px-2 py-1.5 text-xs text-charcoal resize-none"
                  />
                  {rejectReason === 'other' && rejectText.trim() === '' && (
                    <p className="text-xs text-sunset" role="alert">{t('rejectFreeTextRequired')}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      rejectMut.mutate({
                        executionId: exec.id,
                        reason: UI_TO_BACKEND_REASON[rejectReason],
                        freeText: rejectText.trim() || undefined,
                      })
                    }
                    disabled={rejectMut.isPending || (rejectReason === 'other' && rejectText.trim() === '')}
                    className="min-h-9 rounded-md bg-sunset px-3 text-xs font-medium text-white hover:bg-sunset/90 disabled:opacity-50"
                  >
                    {t('rejectConfirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingId(null);
                      setRejectText('');
                      setRejectReason('bad_timing');
                    }}
                    className="min-h-9 rounded-md border border-charcoal/15 px-3 text-xs font-medium text-charcoal hover:bg-charcoal/5"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

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
            aria-label={t('alertViewLead', { name: lead.customerName ?? '—' })}
            className="shrink-0 rounded-md border border-charcoal/15 px-3 py-2.5 text-xs font-medium text-charcoal hover:bg-charcoal/5"
          >
            {t('alertView')}
          </button>
        </div>
      ))}
    </div>
  );
}
