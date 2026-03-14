'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { ChevronRight, Loader2 } from 'lucide-react';
import { TestChatPanel } from '@/components/test-chat-panel';

// Inline ChatMessage shape (mirrors test-chat-panel.tsx internal type; not exported from there)
type ChatMessage = { role: 'user' | 'assistant'; text: string };

export function AdvisorPanel() {
  const t = useTranslations('advisor');

  // pendingOpen: user clicked but snap not yet ready
  const [pendingOpen, setPendingOpen] = useState(false);
  // isOpen: snap is ready AND user has clicked — TestChatPanel is mounted
  const [isOpen, setIsOpen] = useState(false);

  // Refs track live chat state without causing re-renders
  const liveMessageCountRef = useRef(0);
  const liveConversationIdRef = useRef<string | null>(null);
  // Count of seeded initialMessages so they're excluded from the "meaningful exchange" threshold
  const initialMessageCountRef = useRef(0);

  // activeOnly: false — advisor artifact is an internal tool and should show
  // even if isActive is false. Also handles pre-NC-267 tenants where the artifact
  // may not exist yet (ensureAdvisor auto-creates it below).
  const artifactList = trpc.artifact.list.useQuery({ type: 'advisor', activeOnly: false });
  const advisorArtifact = artifactList.data?.[0];

  // Auto-create the advisor artifact for pre-NC-267 tenants who completed
  // onboarding before advisor auto-creation was added.
  const ensureAdvisor = trpc.advisor.ensureAdvisor.useMutation({
    onSuccess: () => artifactList.refetch(),
  });
  useEffect(() => {
    if (artifactList.isSuccess && !advisorArtifact && !ensureAdvisor.isPending) {
      ensureAdvisor.mutate();
    }
  }, [artifactList.isSuccess, advisorArtifact]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    data: snap,
    isError: snapIsError,
    isFetching: snapIsFetching,
    refetch: refetchSnapshot,
  } = trpc.advisor.snapshot.useQuery(undefined, {
    enabled: !!advisorArtifact?.id,
  });

  const summarizeSession = trpc.advisor.summarizeSession.useMutation();

  // Opening message: generated client-side from snapshot data — no extra LLM call.
  // Because of the two-phase open, snap is ALWAYS defined when TestChatPanel mounts,
  // so openingMessage is always a string (never null) at mount time.
  // Declared here (before callbacks) so handleOpen/useEffect can reference initialMessages.
  const openingMessage = snap
    ? t('advisorOpeningMessage', {
        date: new Date().toLocaleDateString(),
        signals: [
          `${snap.activeConversations} ${t('advisorConversations')}`,
          `${snap.pendingPayments.count} ${t('advisorPaymentsPending')}`,
        ].join(', '),
      })
    : null;

  const initialMessages = useMemo<ChatMessage[] | undefined>(
    () => (openingMessage ? [{ role: 'assistant', text: openingMessage }] : undefined),
    [openingMessage],
  );

  // Two-phase open: advance to fully open when snap arrives;
  // reset on error only when a refetch is NOT in flight, so the spinner stays
  // visible during retries and the user can recover without a page reload.
  useEffect(() => {
    if (!pendingOpen) return;
    if (snap) {
      initialMessageCountRef.current = initialMessages?.length ?? 0;
      setIsOpen(true);
      setPendingOpen(false);
    } else if (snapIsError && !snapIsFetching) {
      // Query errored and is not refetching — clear pending so user can click retry
      setPendingOpen(false);
    }
  }, [pendingOpen, snap, snapIsError, snapIsFetching, initialMessages]);

  const handleOpen = useCallback(() => {
    if (snap) {
      initialMessageCountRef.current = initialMessages?.length ?? 0;
      setIsOpen(true);
    } else {
      // If the previous fetch errored, trigger a refetch so the pending-open
      // state can resolve once data arrives. isFetching stays true during the
      // retry, which prevents the effect from immediately clearing pendingOpen.
      if (snapIsError) refetchSnapshot();
      setPendingOpen(true);
    }
  }, [snap, snapIsError, refetchSnapshot, initialMessages]);

  const handleClose = useCallback(() => {
    // Fire-and-forget: summarize if session had ≥3 NEW messages (excluding seeded initialMessages).
    // liveMessageCountRef includes the seeded opening message, so subtract it to avoid
    // persisting low-signal summaries from trivial 1-owner-msg + 1-AI-reply sessions.
    const newMessageCount = liveMessageCountRef.current - initialMessageCountRef.current;
    if (newMessageCount >= 3 && liveConversationIdRef.current) {
      summarizeSession.mutate(
        { conversationId: liveConversationIdRef.current },
        { onError: (err) => console.error('[AdvisorPanel] summarizeSession failed:', err.message) },
      );
    }
    setIsOpen(false);
    setPendingOpen(false);
    liveMessageCountRef.current = 0;
    liveConversationIdRef.current = null;
    initialMessageCountRef.current = 0;
  }, [summarizeSession]);

  const handleMessagesChange = useCallback(
    (msgs: ChatMessage[], conversationId: string | null) => {
      liveMessageCountRef.current = msgs.length;
      liveConversationIdRef.current = conversationId;
    },
    [],
  );

  if (!advisorArtifact) return null;

  const totalLeads = snap
    ? Object.values(snap.leadsByStage).reduce((a, b) => a + b, 0)
    : null;

  const statsText = snap
    ? `${snap.activeConversations} ${t('advisorConversations')} · ${snap.pendingPayments.count} ${t('advisorPaymentsPending')} · ${totalLeads} ${t('advisorLeads')}`
    : t('advisorPanelHeader');

  return (
    <>
      {/* Collapsed card */}
      <div
        data-testid="advisor-panel"
        className="rounded-lg border ring-1 ring-gold/30 bg-cream"
      >
        <button
          type="button"
          onClick={handleOpen}
          disabled={pendingOpen}
          aria-expanded={false}
          className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] disabled:opacity-70"
        >
          <span className="text-sm text-charcoal truncate">{statsText}</span>
          <span className="flex items-center gap-1 text-sm text-teal shrink-0 ml-3">
            {pendingOpen
              ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading…" />
              : snapIsError
              ? <span className="text-sunset text-xs">{t('advisorSnapError')}</span>
              : (
                <>
                  {t('advisorPanelCta')}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </>
              )
            }
          </span>
        </button>
      </div>

      {/* Expanded overlay — mounted fresh on each open, always after snap is loaded */}
      {isOpen && (
        <TestChatPanel
          artifactId={advisorArtifact.id}
          artifactName={advisorArtifact.name}
          artifactType="advisor"
          open={isOpen}
          onClose={handleClose}
          initialMessages={initialMessages}
          onMessagesChange={handleMessagesChange}
        />
      )}
    </>
  );
}
