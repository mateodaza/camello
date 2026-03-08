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
      <div className="relative flex h-[calc(100vh-4rem)] overflow-hidden bg-cream">

        {/* LEFT — mobile: absolute full-screen with translateX; desktop: static 320px */}
        <div className={cn(
          "absolute inset-0 flex flex-col transition-transform duration-200",
          mobilePanel === 'list' ? "translate-x-0" : "-translate-x-full",
          "md:static md:inset-auto md:flex md:flex-col md:w-80 md:shrink-0 md:translate-x-0 md:border-r md:border-charcoal/8",
        )}>
          {left}
        </div>

        {/* CENTER — mobile: absolute full-screen with translateX; desktop: static flex-1 */}
        <div className={cn(
          "absolute inset-0 flex flex-col transition-transform duration-200",
          mobilePanel === 'chat'
            ? "translate-x-0"
            : mobilePanel === 'list'
              ? "translate-x-full"
              : "-translate-x-full",
          "md:static md:inset-auto md:flex md:flex-col md:flex-1 md:min-w-0 md:translate-x-0 md:relative",
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

        {/* RIGHT — mobile: absolute full-screen; desktop: 340px */}
        <div className={cn(
          "absolute inset-0 flex flex-col transition-transform duration-200",
          mobilePanel === 'details' ? "translate-x-0" : "translate-x-full",
          rightOpen ? "md:flex" : "md:hidden",
          "xl:flex md:static md:inset-auto md:w-[340px] md:shrink-0 md:translate-x-0 md:border-l md:border-charcoal/8",
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
