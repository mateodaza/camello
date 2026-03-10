'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { DataTable } from '../primitives/data-table';

interface QuotesSectionProps {
  artifactId: string;
}

const QUOTE_STATUS_CLASSES: Record<string, string> = {
  sent: 'bg-gold/15 text-gold',
  pending: 'bg-gold/15 text-gold',
  viewed: 'bg-gold/15 text-gold',
  draft: 'bg-gold/15 text-gold',
  accepted: 'bg-teal/15 text-teal',
  approved: 'bg-teal/15 text-teal',
  rejected: 'bg-sunset/15 text-sunset',
  expired: 'bg-sunset/15 text-sunset',
  cancelled: 'bg-sunset/15 text-sunset',
};

const QUOTE_STATUS_KEYS: Record<string, string> = {
  sent: 'quoteStatusSent',
  pending: 'quoteStatusPending',
  viewed: 'quoteStatusViewed',
  draft: 'quoteStatusDraft',
  accepted: 'quoteStatusAccepted',
  approved: 'quoteStatusApproved',
  rejected: 'quoteStatusRejected',
  expired: 'quoteStatusExpired',
  cancelled: 'quoteStatusCancelled',
};

function QuoteStatusBadge({ status }: { status: string | null }) {
  const t = useTranslations('agentWorkspace');
  if (!status) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-charcoal/10 text-dune">
        —
      </span>
    );
  }

  const lower = status.toLowerCase();
  const classes = QUOTE_STATUS_CLASSES[lower] ?? 'bg-charcoal/10 text-dune';
  const labelKey = QUOTE_STATUS_KEYS[lower];
  const label = labelKey ? t(labelKey as Parameters<typeof t>[0]) : status;

  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}

export function QuotesSection({ artifactId }: QuotesSectionProps) {
  const t = useTranslations('agentWorkspace');
  const router = useRouter();

  const quotes = trpc.agent.salesQuotes.useQuery({ artifactId, limit: 50, offset: 0 });

  type QuoteRow = NonNullable<typeof quotes.data>[number];

  const columns = [
    {
      key: 'customer',
      label: t('quotesColCustomer'),
      render: (row: QuoteRow) => row.customerName ?? '—',
    },
    {
      key: 'amount',
      label: t('quotesColAmount'),
      render: (row: QuoteRow) => (row.amount ? `$${row.amount}` : '—'),
    },
    {
      key: 'status',
      label: t('quotesColStatus'),
      render: (row: QuoteRow) => <QuoteStatusBadge status={row.quoteStatus} />,
    },
    {
      key: 'date',
      label: t('quotesColDate'),
      render: (row: QuoteRow) =>
        row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—',
    },
  ];

  return (
    <DataTable
      title={t('quotesTitle')}
      icon={<FileText className="h-4 w-4 text-teal" />}
      cardClassName="bg-sand/20"
      columns={columns}
      data={quotes.data}
      isLoading={quotes.isLoading}
      isError={quotes.isError}
      error={quotes.error ?? undefined}
      onRetry={() => quotes.refetch()}
      emptyTitle={t('quotesEmptyTitle')}
      emptyDescription={t('quotesEmptyDescription')}
      onRowClick={(row) => {
        if (row.conversationId) {
          router.push(`/dashboard/conversations?selected=${row.conversationId}`);
        }
      }}
    />
  );
}
