'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { InboxLayout, InboxLeftPanel, InboxCenterPanel, InboxRightPanel } from '@/components/inbox/inbox-layout';
import { ConversationList } from '@/components/inbox/conversation-list';
import { ChatThread } from '@/components/inbox/chat-thread';
import { CustomerPanel } from '@/components/inbox/customer-panel';

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
