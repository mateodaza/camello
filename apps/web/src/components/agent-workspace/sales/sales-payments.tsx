'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { fmtMoney, fmtDate, localDateStr } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';

const PAYMENT_STATUSES = ['pending', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'] as const;
type PaymentStatus = typeof PAYMENT_STATUSES[number];

const CURRENCIES = ['USD', 'COP', 'MXN', 'BRL'] as const;

export interface LeadSummary {
  id: string;
  customerName: string | null;
  customerId: string;
  conversationId: string | null;
  stage: string;
  score: string;
}

export interface PaymentPrefill {
  description: string;
  leadId?: string | null;
  customerId?: string | null;
}

interface SalesPaymentsProps {
  artifactId: string;
  leadSummaries: LeadSummary[];
  recordPaymentOpen: boolean;
  recordPaymentPrefill: PaymentPrefill | null;
  onRecordPaymentClose: () => void;
  onOpenRecordPayment: (prefill: PaymentPrefill | null) => void;
}

export function SalesPayments({
  artifactId,
  leadSummaries,
  recordPaymentOpen,
  recordPaymentPrefill,
  onRecordPaymentClose,
  onOpenRecordPayment,
}: SalesPaymentsProps) {
  const t = useTranslations('agentWorkspace');
  const locale = useLocale();
  const { addToast } = useToast();
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<typeof CURRENCIES[number]>('USD');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Reset form to current prefill every time the form opens.
  // Without this, stale local state from a prior open is shown when the
  // user clicks "Convert to Payment" on a different quote.
  useEffect(() => {
    if (!recordPaymentOpen) return;
    setSelectedLeadId(recordPaymentPrefill?.leadId ?? '');
    setDescription(recordPaymentPrefill?.description ?? '');
    setAmount('');
    setDueDate('');
    setCurrency('USD');
  }, [recordPaymentOpen, recordPaymentPrefill]);

  const paymentsQuery = trpc.agent.salesPayments.useQuery({
    artifactId,
    status: (statusFilter || undefined) as PaymentStatus | undefined,
    limit: 50,
    offset: 0,
  });

  const createPayment = trpc.agent.createPayment.useMutation({
    onSuccess: () => {
      utils.agent.salesPayments.invalidate();
      onRecordPaymentClose();
      setAmount('');
      setDescription('');
      setDueDate('');
      setSelectedLeadId('');
      addToast(t('paymentCreated'), 'success');
    },
    onError: (err) => {
      addToast(err.message, 'error');
    },
  });

  const updateStatus = trpc.agent.updatePaymentStatus.useMutation({
    onSuccess: () => {
      utils.agent.salesPayments.invalidate();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;

    const selectedLead = leadSummaries.find((l) => l.id === selectedLeadId);

    createPayment.mutate({
      artifactId,
      leadId: selectedLead?.id,
      conversationId: selectedLead?.conversationId ?? undefined,
      customerId: selectedLead?.customerId,
      amount: parsed,
      currency,
      description,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    });
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold text-charcoal">{t('paymentsTitle')}</span>
        <button
          onClick={() => onOpenRecordPayment(null)}
          className="rounded-md bg-teal px-3 py-1.5 text-xs font-medium text-cream hover:bg-teal/90"
        >
          {t('recordPayment')}
        </button>
      </div>

      {/* Inline record payment form */}
      {recordPaymentOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-charcoal/12 bg-cream p-4 shadow-sm"
        >
          <p className="mb-3 text-sm font-semibold text-charcoal">{t('recordPayment')}</p>

          {/* Lead selector */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-dune">{t('paymentLead')}</label>
            <select
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              className="w-full rounded border border-charcoal/15 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
            >
              <option value="">{t('paymentLeadOptional')}</option>
              {leadSummaries.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.customerName ?? l.id} — {l.stage}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3">
            {/* Amount */}
            <div>
              <label className="mb-1 block text-xs font-medium text-dune">{t('paymentAmount')} *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded border border-charcoal/15 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>

            {/* Currency */}
            <div>
              <label className="mb-1 block text-xs font-medium text-dune">{t('paymentCurrency')}</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as typeof CURRENCIES[number])}
                className="w-full rounded border border-charcoal/15 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-dune">{t('paymentDescription')} *</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-charcoal/15 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          {/* Due date */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-dune">{t('paymentDueDate')}</label>
            <input
              type="date"
              value={dueDate}
              min={localDateStr()}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded border border-charcoal/15 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createPayment.isPending}
              className="rounded-md bg-teal px-4 py-1.5 text-xs font-medium text-cream hover:bg-teal/90 disabled:opacity-60"
            >
              {createPayment.isPending ? t('saving') : t('save')}
            </button>
            <button
              type="button"
              onClick={onRecordPaymentClose}
              className="rounded-md border border-charcoal/15 px-4 py-1.5 text-xs font-medium text-dune hover:bg-charcoal/5"
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      )}

      {/* Status filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-dune">{t('filterStatus')}:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-charcoal/12 bg-white px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal"
        >
          <option value="">{t('filterAll')}</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{t(`paymentStatus${s.charAt(0).toUpperCase()}${s.slice(1)}` as Parameters<typeof t>[0])}</option>
          ))}
        </select>
      </div>

      {/* Payments table */}
      {paymentsQuery.isLoading && (
        <p className="text-sm text-dune">{t('loading')}</p>
      )}
      {paymentsQuery.isError && (
        <p className="text-sm text-sunset">{t('errorLoading')}</p>
      )}
      {paymentsQuery.data && paymentsQuery.data.length === 0 && (
        <p className="py-6 text-center text-sm text-dune">{t('paymentsEmpty')}</p>
      )}
      {paymentsQuery.data && paymentsQuery.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-charcoal/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-charcoal/8 bg-charcoal/3 text-xs font-semibold uppercase tracking-wide text-dune">
                <th className="px-4 py-2.5 text-left">{t('columnCustomer')}</th>
                <th className="px-4 py-2.5 text-left">{t('paymentAmount')}</th>
                <th className="px-4 py-2.5 text-left">{t('columnDescription')}</th>
                <th className="px-4 py-2.5 text-left">{t('columnStatus')}</th>
                <th className="px-4 py-2.5 text-left">{t('columnDate')}</th>
              </tr>
            </thead>
            <tbody>
              {paymentsQuery.data.map((p) => (
                <tr key={p.id} className="border-b border-charcoal/6 hover:bg-charcoal/2">
                  <td className="px-4 py-2.5 font-medium text-charcoal">{p.customerName ?? '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {fmtMoney(p.amount ?? 0, locale)} <span className="text-xs text-dune">{p.currency}</span>
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-dune">{p.description ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={p.status}
                      onChange={(e) => updateStatus.mutate({ paymentId: p.id, status: e.target.value as PaymentStatus })}
                      className="rounded border border-charcoal/12 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal"
                    >
                      {PAYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(`paymentStatus${s.charAt(0).toUpperCase()}${s.slice(1)}` as Parameters<typeof t>[0])}
                        </option>
                      ))}
                    </select>
                    <Badge variant={p.status} className="ml-2 text-xs">{p.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-dune">{fmtDate(p.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
