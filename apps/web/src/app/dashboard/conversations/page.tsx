'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useOrganization } from '@clerk/nextjs';
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

  return (
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
  );
}
