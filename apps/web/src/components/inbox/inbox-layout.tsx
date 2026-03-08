'use client';

import { createContext, useContext, useState } from 'react';
import { PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InboxPanelContextValue {
  mobilePanel: 'list' | 'chat' | 'details';
  goToList: () => void;
  goToChat: () => void;
  goToDetails: () => void;
}

const InboxPanelContext = createContext<InboxPanelContextValue | null>(null);

export function useInboxPanel(): InboxPanelContextValue {
  const ctx = useContext(InboxPanelContext);
  if (!ctx) throw new Error('useInboxPanel must be used within InboxLayout');
  return ctx;
}

interface InboxLayoutProps {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}

export function InboxLayout({ left, center, right }: InboxLayoutProps) {
  const [mobilePanel, setMobilePanel] = useState<'list' | 'chat' | 'details'>('list');
  const [rightOpen, setRightOpen] = useState(false);

  const ctx: InboxPanelContextValue = {
    mobilePanel,
    goToList: () => setMobilePanel('list'),
    goToChat: () => setMobilePanel('chat'),
    goToDetails: () => setMobilePanel('details'),
  };

  return (
    <InboxPanelContext.Provider value={ctx}>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-cream">

        {/* LEFT — 320px */}
        <div className={cn(
          "flex-col w-80 shrink-0 border-r border-charcoal/8",
          mobilePanel === 'list' ? "flex" : "hidden",
          "md:flex",
        )}>
          {left}
        </div>

        {/* CENTER — flex-1 */}
        <div className={cn(
          "relative flex-col flex-1 min-w-0",
          mobilePanel === 'chat' ? "flex" : "hidden",
          "md:flex",
        )}>
          {/* Toggle button: tablet only (md to xl-1). Never shown on mobile. */}
          <button
            type="button"
            onClick={() => setRightOpen(prev => !prev)}
            aria-label={rightOpen ? "Hide details panel" : "Show details panel"}
            className="hidden md:flex xl:hidden absolute right-2 top-2 z-10 h-9 w-9 items-center justify-center rounded-md border border-charcoal/8 bg-cream hover:bg-sand"
          >
            <PanelRight className="h-4 w-4" />
          </button>
          {center}
        </div>

        {/* RIGHT — 340px */}
        <div className={cn(
          "flex-col w-[340px] shrink-0 border-l border-charcoal/8",
          mobilePanel === 'details' ? "flex" : "hidden",
          rightOpen ? "md:flex" : "md:hidden",
          "xl:flex",
        )}>
          {right}
        </div>

      </div>
    </InboxPanelContext.Provider>
  );
}

export function InboxLeftPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col h-full overflow-y-auto">{children}</div>;
}

export function InboxCenterPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col h-full overflow-y-auto">{children}</div>;
}

export function InboxRightPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col h-full overflow-y-auto">{children}</div>;
}
