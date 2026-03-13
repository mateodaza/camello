'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CreditCard } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { DataTable } from '../primitives/data-table';

interface PaymentsSectionProps {
  artifactId: string;
}

function PaymentStatusBadge({ status }: { status: string | null }) {
  const t = useTranslations('agentWorkspace');

  if (!status) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-charcoal/10 text-dune">
        —
      </span>
    );
  }

  const lower = status.toLowerCase();
  let classes = 'bg-charcoal/10 text-dune';
  if (lower === 'paid') {
    classes = 'bg-teal/15 text-teal';
  } else if (lower === 'pending' || lower === 'sent' || lower === 'viewed') {
    classes = 'bg-gold/15 text-gold';
  } else if (lower === 'overdue' || lower === 'cancelled') {
    classes = 'bg-sunset/15 text-sunset';
  }

  const labelMap: Record<string, string> = {
    paid: t('paymentStatusPaid'),
    pending: t('paymentStatusPending'),
    sent: t('paymentStatusSent'),
    viewed: t('paymentStatusViewed'),
    overdue: t('paymentStatusOverdue'),
    cancelled: t('paymentStatusCancelled'),
  };

  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${classes}`}>
      {labelMap[lower] ?? status}
    </span>
  );
}

export function PaymentsSection({ artifactId }: PaymentsSectionProps) {
  const t = useTranslations('agentWorkspace');
  const router = useRouter();
  const utils = trpc.useUtils();
  const { addToast } = useToast();

  const paymentsQuery = trpc.agent.salesPayments.useQuery({ artifactId, limit: 50, offset: 0 });

  const markPaid = trpc.agent.markPaymentPaid.useMutation({
    onSuccess: () => {
      void utils.agent.salesPayments.invalidate();
      addToast(t('paymentMarkedPaid'), 'success');
    },
    onError: (err) => {
      addToast(err.message, 'error');
    },
  });

  type PaymentRow = NonNullable<typeof paymentsQuery.data>[number];

  const columns = [
    {
      key: 'customer',
      label: t('paymentsColCustomer'),
      render: (row: PaymentRow) => row.customerName ?? '—',
    },
    {
      key: 'amount',
      label: t('paymentsColAmount'),
      render: (row: PaymentRow) => (row.amount ? `${row.currency ?? '$'} ${row.amount}` : '—'),
    },
    {
      key: 'status',
      label: t('paymentsColStatus'),
      render: (row: PaymentRow) => <PaymentStatusBadge status={row.status} />,
    },
    {
      key: 'due',
      label: t('paymentsColDue'),
      render: (row: PaymentRow) =>
        row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—',
    },
    {
      key: 'actions',
      label: '',
      render: (row: PaymentRow) => {
        const status = row.status?.toLowerCase();
        if (status !== 'pending' && status !== 'sent' && status !== 'viewed') return null;
        return (
          <Button
            variant="outline"
            size="sm"
            disabled={markPaid.isPending}
            onClick={(e) => {
              e.stopPropagation();
              markPaid.mutate({ paymentId: row.id });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
              }
            }}
          >
            {t('markAsPaid')}
          </Button>
        );
      },
    },
  ];

  return (
    <DataTable
      title={t('paymentsTitle')}
      icon={<CreditCard className="h-4 w-4 text-teal" />}
      cardClassName="bg-sand/20"
      columns={columns}
      data={paymentsQuery.data}
      isLoading={paymentsQuery.isLoading}
      isError={paymentsQuery.isError}
      error={paymentsQuery.error ?? undefined}
      onRetry={() => paymentsQuery.refetch()}
      emptyTitle={t('paymentsEmptyTitle')}
      emptyDescription={t('paymentsEmptyDescription')}
      onRowClick={(row) => {
        if (row.conversationId) {
          router.push(`/dashboard/conversations?selected=${row.conversationId}`);
        }
      }}
    />
  );
}
