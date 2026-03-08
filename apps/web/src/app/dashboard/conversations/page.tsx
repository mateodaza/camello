'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { InboxLayout, InboxLeftPanel, InboxCenterPanel, InboxRightPanel } from '@/components/inbox/inbox-layout';
import { ConversationList } from '@/components/inbox/conversation-list';

export default function ConversationsPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const [selectedId, setSelectedId] = useState<string | null>(
    () => searchParams.get('selected'),
  );

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
      left={
        <InboxLeftPanel>
          <ConversationList
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </InboxLeftPanel>
      }
      center={
        <InboxCenterPanel>
          {/* NC-207: chat thread */}
          <div className="flex h-full items-center justify-center text-dune text-sm">
            Select a conversation
          </div>
        </InboxCenterPanel>
      }
      right={
        <InboxRightPanel>
          {null}
        </InboxRightPanel>
      }
    />
  );
}
