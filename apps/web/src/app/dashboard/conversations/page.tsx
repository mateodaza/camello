'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useOrganization } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { InboxLayout, InboxLeftPanel, InboxCenterPanel, InboxRightPanel } from '@/components/inbox/inbox-layout';
import { ConversationList } from '@/components/inbox/conversation-list';
import { ChatThread } from '@/components/inbox/chat-thread';
import { CustomerPanel } from '@/components/inbox/customer-panel';
import { useRealtimeInbox, type NewMessagePayload } from '@/hooks/use-realtime-inbox';

export default function ConversationsPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();
  const t = useTranslations('inbox');

  const [selectedId, setSelectedId] = useState<string | null>(
    () => searchParams.get('selected'),
  );

  const artifactId = searchParams.get('artifactId') ?? undefined;

  // Sync state when URL changes externally (e.g. deep link or clearing ?selected=)
  useEffect(() => {
    const fromUrl = searchParams.get('selected');
    if (fromUrl !== selectedId) setSelectedId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { organization } = useOrganization();
  // camello_tenant_id is written to publicMetadata during provisioning.
  // publicMetadata is available client-side; privateMetadata is not.
  const tenantId =
    ((organization?.publicMetadata as Record<string, unknown> | undefined)
      ?.camello_tenant_id as string | null) ?? null;

  const utils = trpc.useUtils();
  const dashboardOverview = trpc.agent.dashboardOverview.useQuery();
  const onboardingStatus = trpc.onboarding.getStatus.useQuery(undefined, {
    enabled: !!organization,
  });

  const handleRealtimeMessage = useCallback(
    (payload: NewMessagePayload) => {
      // Always refresh the conversation list (any new message changes ordering/preview)
      void utils.conversation.list.invalidate();
      // If the event is for the currently-open conversation, refresh the full thread.
      if (selectedId && payload.conversationId === selectedId) {
        // byId input: { id } — exact match
        void utils.conversation.byId.invalidate({ id: payload.conversationId });
        // messages input: { conversationId, limit: 100 } — use no-arg invalidation to
        // avoid missing the cache entry due to the `limit` field in the stored key.
        void utils.conversation.messages.invalidate();
        // activity input: { conversationId } — exact match
        void utils.conversation.activity.invalidate({ conversationId: payload.conversationId });
      }
    },
    [utils, selectedId],
  );

  useRealtimeInbox(tenantId, handleRealtimeMessage);

  function handleSelect(id: string) {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('selected', id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const data = dashboardOverview.data;
  const onboardingSettings = onboardingStatus.data?.settings as Record<string, unknown> | null | undefined;
  const showResumeBanner = !onboardingStatus.isLoading && onboardingSettings?.onboardingComplete !== true;

  return (
    <>
      {showResumeBanner && (
        <div data-testid="onboarding-resume-banner" className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-charcoal">{t('resumeSetupBanner')}</p>
          <Link href="/onboarding" className="shrink-0 rounded-md bg-teal px-3 py-1.5 text-xs font-heading font-medium text-cream hover:bg-teal/90 transition-colors">
            {t('resumeSetupCta')}
          </Link>
        </div>
      )}

      <div className="mb-4 flex items-center gap-4 text-xs text-dune">
        <span>{t('statConversationsToday', { count: data?.todayConversations ?? 0 })}</span>
        <span aria-hidden="true" className="text-charcoal/20">&middot;</span>
        <span>{t('statPendingApprovals', { count: data?.pendingApprovalsCount ?? 0 })}</span>
        <span aria-hidden="true" className="text-charcoal/20">&middot;</span>
        <span>{t('statActiveLeads', { count: data?.activeLeadsCount ?? 0 })}</span>
      </div>

      <InboxLayout
        initialMobilePanel={selectedId ? 'chat' : 'list'}
        left={
          <InboxLeftPanel>
            <ConversationList
              selectedId={selectedId}
              onSelect={handleSelect}
              artifactId={artifactId}
            />
          </InboxLeftPanel>
        }
        center={
          <InboxCenterPanel>
            <ChatThread conversationId={selectedId} />
          </InboxCenterPanel>
        }
        right={
          <InboxRightPanel>
            <CustomerPanel conversationId={selectedId} />
          </InboxRightPanel>
        }
      />
    </>
  );
}
