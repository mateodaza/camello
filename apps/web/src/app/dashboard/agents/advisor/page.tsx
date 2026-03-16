'use client'
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { BarChart2, HelpCircle } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryError } from '@/components/query-error'
import { MetricsGrid } from '@/components/agent-workspace/primitives/metrics-grid'
import { TestChatPanel } from '@/components/test-chat-panel'
import { Section } from '@/components/dashboard/section'
import { stageKey } from '@/components/agent-workspace/sales/constants'

// Mirrors the internal ChatMessage type in test-chat-panel.tsx (not exported from there)
type ChatMessage = { role: 'user' | 'assistant'; text: string };

export default function AdvisorPage() {
  // Step 1 — translations
  const t = useTranslations('advisor');
  const tw = useTranslations('agentWorkspace');

  // Step 2 — tRPC queries and mutations
  const artifactList = trpc.artifact.list.useQuery({ type: 'advisor', activeOnly: false });
  const advisorArtifact = artifactList.data?.[0];

  const ensureAdvisor = trpc.advisor.ensureAdvisor.useMutation({
    onSuccess: () => artifactList.refetch(),
  });

  const snap = trpc.advisor.snapshot.useQuery(undefined, {
    enabled: !!advisorArtifact?.id,
  });

  const summarizeSession = trpc.advisor.summarizeSession.useMutation();

  const conversationHistory = trpc.conversation.list.useQuery(
    { artifactId: advisorArtifact?.id, limit: 10, showSandbox: true },
    { enabled: !!advisorArtifact?.id },
  );

  // Step 3 — refs
  const liveMessageCountRef = useRef<number>(0);
  const liveConversationIdRef = useRef<string | null>(null);
  const initialMessageCountRef = useRef<number>(0);
  const initialCountSet = useRef(false);
  const pendingBaselineReset = useRef(false);

  // Step 4 — derived values (BEFORE all effects)
  const openingMessage = snap.data
    ? t('advisorOpeningMessage', {
        date: new Date().toLocaleDateString(),
        signals: [
          `${snap.data.activeConversations} ${t('advisorConversations')}`,
          `${snap.data.pendingPayments.count} ${t('advisorPaymentsPending')}`,
        ].join(', '),
      })
    : null;

  const initialMessages = useMemo<ChatMessage[] | undefined>(
    () => (openingMessage ? [{ role: 'assistant', text: openingMessage }] : undefined),
    [openingMessage],
  );

  const totalLeads = snap.data
    ? Object.values(snap.data.leadsByStage).reduce((a, b) => a + b, 0)
    : 0;

  const conversationValue: string | number = snap.data
    ? snap.data.conversationTrend !== 0
      ? `${snap.data.activeConversations} (${snap.data.conversationTrend > 0 ? '+' : ''}${snap.data.conversationTrend}%)`
      : String(snap.data.activeConversations)
    : 0;

  const metrics = snap.data
    ? [
        { label: t('metricConversations'), value: conversationValue },
        { label: t('metricPendingPayments'), value: snap.data.pendingPayments.count },
        { label: t('metricLeads'), value: totalLeads },
        { label: t('metricGaps'), value: snap.data.topKnowledgeGaps.length },
      ]
    : [];

  // Session state
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(undefined);
  const [sessionKey, setSessionKey] = useState(0);

  // Step 5 — callbacks
  const handleClose = useCallback(() => {
    const newMessageCount = liveMessageCountRef.current - initialMessageCountRef.current;
    if (newMessageCount >= 3 && liveConversationIdRef.current) {
      summarizeSession.mutate(
        { conversationId: liveConversationIdRef.current },
        { onError: (err) => console.error('[AdvisorPage] summarizeSession failed:', err.message) },
      );
    }
    liveMessageCountRef.current = 0;
    liveConversationIdRef.current = null;
    initialMessageCountRef.current = 0;
  }, [summarizeSession]);

  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  const handleMessagesChange = useCallback(
    (msgs: ChatMessage[], conversationId: string | null) => {
      liveMessageCountRef.current = msgs.length;
      liveConversationIdRef.current = conversationId;
      if (pendingBaselineReset.current && conversationId !== null) {
        initialMessageCountRef.current = msgs.length;
        pendingBaselineReset.current = false;
      }
    },
    [],
  );

  const handleSelectSession = useCallback((conversationId: string) => {
    // No-op if this session is already active — avoids blanking the chat via the
    // sessionKey reset effect when the history-load effect has no dependency change
    // to re-fire on (same initialConversationId + same cached historyQuery.data).
    if (conversationId === selectedConversationId) return;
    // Summarize the current session before switching (if it qualifies).
    // handleClose also zeroes liveMessageCountRef and liveConversationIdRef,
    // closing the unmount-race window without a separate ref-clear step.
    handleCloseRef.current();
    setSelectedConversationId(conversationId);
    setSessionKey((k) => k + 1);
    pendingBaselineReset.current = true;
  }, [selectedConversationId]);

  const handleNewSession = useCallback(() => {
    // Clear any pending baseline reset from a prior handleSelectSession call.
    // Without this, if the user clicks "New Session" before a past session's
    // history finishes loading, the flag leaks and corrupts the new session's
    // initialMessageCountRef on the first onMessagesChange call.
    pendingBaselineReset.current = false;
    // Summarize the current session before resetting (if it qualifies).
    // handleClose also zeroes the live refs, closing the unmount-race window.
    handleCloseRef.current();
    setSelectedConversationId(undefined);
    setSessionKey((k) => k + 1);
    initialMessageCountRef.current = initialMessages?.length ?? 0;
  }, [initialMessages]);

  // Step 6 — effects (all AFTER initialMessages is in scope — no TDZ risk)

  // Effect 1 — auto-create advisor artifact
  useEffect(() => {
    if (artifactList.isSuccess && !advisorArtifact && !ensureAdvisor.isPending) {
      ensureAdvisor.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactList.isSuccess, advisorArtifact]);

  // Effect 2 — record initial message count once snapshot arrives
  useEffect(() => {
    if (snap.data && !initialCountSet.current) {
      initialMessageCountRef.current = initialMessages?.length ?? 0;
      initialCountSet.current = true;
    }
  }, [snap.data, initialMessages]);

  // Effect 3 — summarize on unmount
  useEffect(() => {
    return () => { handleCloseRef.current(); };
  }, []);

  // Render — State 1: loading
  if (artifactList.isLoading || ensureAdvisor.isPending) {
    return (
      <div className="p-6 flex flex-col gap-6 h-full">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
        <Skeleton className="flex-1 min-h-[400px]" />
      </div>
    );
  }

  // Render — State 2: artifact list query error
  if (artifactList.isError) {
    return (
      <div className="p-6">
        <QueryError
          error={artifactList.error}
          onRetry={() => artifactList.refetch()}
        />
      </div>
    );
  }

  // Render — State 3: ensureAdvisor mutation error
  if (ensureAdvisor.isError) {
    return (
      <div className="p-6">
        <QueryError
          error={ensureAdvisor.error}
          onRetry={() => ensureAdvisor.mutate()}
        />
      </div>
    );
  }

  // Render — State 4: transient guard
  if (!advisorArtifact) return null;

  // Render — State 5: main render
  const historyItems = conversationHistory.data?.items ?? [];

  // Session list used in both desktop sidebar and mobile section
  const sessionListContent = (
    <>
      {conversationHistory.isLoading ? (
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : historyItems.length === 0 ? (
        <p className="px-4 py-3 text-sm text-dune">{t('noSessions')}</p>
      ) : (
        <ul className="overflow-y-auto">
          {historyItems.map((conv) => (
            <li key={conv.id}>
              <button
                type="button"
                onClick={() => handleSelectSession(conv.id)}
                className={`min-h-[36px] w-full text-left px-4 py-3 hover:bg-sand transition-colors ${
                  selectedConversationId === conv.id ? 'bg-sand' : ''
                }`}
              >
                <p className="text-xs text-dune">
                  {conv.createdAt.toLocaleDateString()}
                </p>
                <p className="text-sm text-charcoal truncate">
                  {conv.firstUserMessagePreview ?? t('sessionDate')}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div className="p-6 flex flex-col gap-6 h-full">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-semibold text-charcoal">
          {t('pageTitle')}
        </h1>
        <p className="text-sm text-dune mt-1">{t('pageDesc')}</p>
      </div>

      {/* Metrics strip — 3-branch: error | loading | ready */}
      {snap.isError ? (
        <QueryError error={snap.error} onRetry={() => snap.refetch()} />
      ) : !snap.data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <>
          <MetricsGrid metrics={metrics} />

          {/* Pending payments by currency — inline compact list */}
          {snap.data.pendingPayments.byCurrency.length > 0 && (
            <ul className="flex flex-wrap gap-3">
              {snap.data.pendingPayments.byCurrency.map(({ currency, totalAmount }) => (
                <li key={currency} className="text-sm text-dune">
                  <span className="font-medium text-charcoal">{currency}</span>{' '}
                  {totalAmount.toLocaleString()}
                </li>
              ))}
            </ul>
          )}

          {/* Lead Breakdown section */}
          <Section
            title={t('leadBreakdownTitle')}
            icon={BarChart2}
            badge={totalLeads}
            defaultOpen={false}
          >
            <ul className="divide-y divide-charcoal/8">
              {Object.entries(snap.data.leadsByStage).map(([stage, count]) => (
                <li key={stage} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-charcoal">
                    {tw(`salesStage${stageKey(stage)}` as Parameters<typeof tw>[0])}
                  </span>
                  <span className="font-medium text-charcoal">{count}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-dune">{t('stageBreakdown')}</p>
          </Section>

          {/* Unanswered Questions section */}
          <Section
            title={t('topGapsTitle')}
            icon={HelpCircle}
            badge={snap.data.topKnowledgeGaps.length}
            defaultOpen={false}
          >
            {snap.data.topKnowledgeGaps.length === 0 ? (
              <p className="text-sm text-dune">{t('noGaps')}</p>
            ) : (
              <ul className="space-y-2">
                {snap.data.topKnowledgeGaps.map((gap) => (
                  <li key={gap.intentType} className="text-sm text-charcoal">
                    {gap.sampleQuestion}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {/* Mobile session history section */}
      <div className="md:hidden">
        <Section
          title={t('sessionHistory')}
          defaultOpen={false}
        >
          {sessionListContent}
          <div className="px-4 pb-3">
            <button
              type="button"
              onClick={handleNewSession}
              className="min-h-[36px] w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm text-charcoal hover:bg-sand transition-colors"
            >
              {t('newSession')}
            </button>
          </div>
        </Section>
      </div>

      {/* Two-zone layout: sidebar + chat */}
      <div className="flex-1 min-h-0 flex">
        {/* Desktop sidebar */}
        <div className="hidden md:flex w-64 shrink-0 flex-col border-r border-charcoal/8">
          <div className="flex items-center justify-between px-4 py-3 border-b border-charcoal/8">
            <span className="text-sm font-medium text-charcoal">{t('sessionHistory')}</span>
            <button
              type="button"
              onClick={handleNewSession}
              className="min-h-[36px] rounded-md px-3 py-1 text-xs text-teal hover:bg-sand transition-colors"
            >
              {t('newSession')}
            </button>
          </div>
          {sessionListContent}
        </div>

        {/* Chat area */}
        <div className="flex-1 min-h-0 flex flex-col">
          {snap.isError ? (
            <QueryError error={snap.error} onRetry={() => snap.refetch()} />
          ) : !snap.data ? (
            <Skeleton className="flex-1 min-h-[400px]" />
          ) : (
            <TestChatPanel
              artifactId={advisorArtifact.id}
              artifactName={advisorArtifact.name}
              artifactType="advisor"
              open={true}
              onClose={handleClose}
              initialMessages={selectedConversationId ? undefined : initialMessages}
              initialConversationId={selectedConversationId}
              onMessagesChange={handleMessagesChange}
              inline={true}
              placeholder={t('chatPlaceholder')}
              sessionKey={sessionKey}
            />
          )}
        </div>
      </div>
    </div>
  );
}
