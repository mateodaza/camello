'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/query-error';

interface ApprovalsSectionProps {
  artifactId: string;
}

const MODULE_SLUG_KEYS: Record<string, string> = {
  qualify_lead: 'moduleQualifyLead',
  book_meeting: 'moduleBookMeeting',
  send_followup: 'moduleSendFollowup',
  collect_payment: 'moduleCollectPayment',
  send_quote: 'moduleSendQuote',
  create_ticket: 'moduleCreateTicket',
  escalate_to_human: 'moduleEscalateToHuman',
  capture_interest: 'moduleCaptureInterest',
  draft_content: 'moduleDraftContent',
};

const REJECTION_REASONS = [
  { value: 'false_positive', key: 'rejectReasonFalsePositive' },
  { value: 'wrong_target', key: 'rejectReasonWrongTarget' },
  { value: 'bad_timing', key: 'rejectReasonBadTiming' },
  { value: 'incorrect_data', key: 'rejectReasonIncorrectData' },
  { value: 'policy_violation', key: 'rejectReasonPolicyViolation' },
] as const;

export function ApprovalsSection({ artifactId }: ApprovalsSectionProps) {
  const t = useTranslations('agentWorkspace');
  const router = useRouter();
  const { addToast } = useToast();

  const cardCls = 'bg-sand/20';

  const [expandedRejectId, setExpandedRejectId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [rejectFreeTexts, setRejectFreeTexts] = useState<Record<string, string>>({});

  const pendingExec = trpc.module.pendingExecutions.useQuery({ artifactId, limit: 50 });
  const utils = trpc.useUtils();

  const approve = trpc.module.approve.useMutation({
    onSuccess: () => {
      utils.module.pendingExecutions.invalidate();
      addToast(t('approvalConfirmed'), 'success');
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const reject = trpc.module.reject.useMutation({
    onSuccess: () => {
      utils.module.pendingExecutions.invalidate();
      setExpandedRejectId(null);
      addToast(t('rejectionSent'), 'success');
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  type PendingExecution = NonNullable<typeof pendingExec.data>[number];

  const approvalsHeader = (
    <span className="flex items-center gap-2">
      <CheckCircle2 className="h-4 w-4 text-teal" />
      {t('approvalsTitle')}
    </span>
  );

  if (pendingExec.isLoading) {
    return (
      <Card className={cardCls}>
        <CardHeader>
          <CardTitle>{approvalsHeader}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (pendingExec.isError) {
    return (
      <Card className={cardCls}>
        <CardHeader>
          <CardTitle>{approvalsHeader}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryError error={pendingExec.error} onRetry={() => pendingExec.refetch()} />
        </CardContent>
      </Card>
    );
  }

  const items = pendingExec.data ?? [];

  if (items.length === 0) {
    return (
      <Card className={cardCls}>
        <CardHeader>
          <CardTitle>{approvalsHeader}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm font-medium text-charcoal">{t('approvalsEmpty')}</p>
            <p className="mt-1 text-xs text-dune">{t('approvalsEmptyDesc')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cardCls}>
      <CardHeader>
        <CardTitle>{approvalsHeader}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item: PendingExecution) => {
          const moduleSlug = (item as { moduleSlug?: string }).moduleSlug ?? '';
          const slugKey = MODULE_SLUG_KEYS[moduleSlug];
          const moduleLabel = slugKey ? t(slugKey as Parameters<typeof t>[0]) : moduleSlug;
          const isExpanded = expandedRejectId === item.id;
          const selectedReason = rejectReasons[item.id] ?? '';
          const freeText = rejectFreeTexts[item.id] ?? '';

          return (
            <div key={item.id} className="rounded-lg border border-charcoal/8 p-3">
              {/* Row 1: module label + date */}
              <div className="flex items-center justify-between">
                <span className="font-medium text-charcoal">{moduleLabel}</span>
                <span className="text-xs text-dune">
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                </span>
              </div>

              {/* Row 2: view conversation link */}
              {(item as { conversationId?: string | null }).conversationId && (
                <div className="mt-1">
                  <button
                    type="button"
                    className="text-xs text-teal hover:underline"
                    onClick={() =>
                      router.push(
                        `/dashboard/conversations?selected=${(item as { conversationId: string }).conversationId}`,
                      )
                    }
                  >
                    {t('approvalRequested')}
                  </button>
                </div>
              )}

              {/* Row 3: action bar */}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="min-h-[36px] rounded-md bg-teal/10 px-3 text-sm font-medium text-teal hover:bg-teal/20 disabled:opacity-50"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() => approve.mutate({ executionId: item.id })}
                >
                  {t('approve')}
                </button>
                <button
                  type="button"
                  className="min-h-[36px] rounded-md bg-sunset/10 px-3 text-sm font-medium text-sunset hover:bg-sunset/20 disabled:opacity-50"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() =>
                    setExpandedRejectId(isExpanded ? null : item.id)
                  }
                >
                  {t('reject')}
                </button>
              </div>

              {/* Row 4: reject form */}
              {isExpanded && (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-medium text-charcoal">
                    {t('rejectReason')}
                  </label>
                  <select
                    className="w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
                    required
                    value={selectedReason}
                    onChange={(e) =>
                      setRejectReasons((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                  >
                    <option value="">{t('rejectReason')}</option>
                    {REJECTION_REASONS.map(({ value, key }) => (
                      <option key={value} value={value}>
                        {t(key as Parameters<typeof t>[0])}
                      </option>
                    ))}
                  </select>
                  <label className="block text-xs font-medium text-charcoal">
                    {t('rejectFreeText')}
                  </label>
                  <textarea
                    className="w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
                    maxLength={500}
                    value={freeText}
                    onChange={(e) =>
                      setRejectFreeTexts((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="min-h-[36px] rounded-md border border-charcoal/15 px-3 text-sm text-dune hover:text-charcoal"
                      onClick={() => setExpandedRejectId(null)}
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="button"
                      className="min-h-[36px] rounded-md bg-sunset/10 px-3 text-sm font-medium text-sunset hover:bg-sunset/20 disabled:opacity-50"
                      disabled={!selectedReason || reject.isPending}
                      onClick={() =>
                        reject.mutate({
                          executionId: item.id,
                          reason: selectedReason as 'false_positive' | 'wrong_target' | 'bad_timing' | 'incorrect_data' | 'policy_violation',
                          freeText: freeText || undefined,
                        })
                      }
                    >
                      {t('rejectConfirm')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
