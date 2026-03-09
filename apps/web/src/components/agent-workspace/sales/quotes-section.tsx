'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { DataTable } from '../primitives/data-table';

interface QuotesSectionProps {
  artifactId: string;
}

function QuoteStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-charcoal/10 text-dune">
        —
      </span>
    );
  }

  const lower = status.toLowerCase();
  let classes = 'bg-charcoal/10 text-dune';
  if (lower === 'sent' || lower === 'pending' || lower === 'viewed') {
    classes = 'bg-gold/15 text-gold';
  } else if (lower === 'accepted' || lower === 'approved') {
    classes = 'bg-teal/15 text-teal';
  } else if (lower === 'rejected' || lower === 'expired' || lower === 'cancelled') {
    classes = 'bg-sunset/15 text-sunset';
  }

  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${classes}`}>
      {status}
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
