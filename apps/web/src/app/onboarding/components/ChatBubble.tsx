'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
}

export function ChatBubble({ children }: Props) {
  return (
    <div className="animate-fade-in flex items-start gap-2">
      <div className="hidden min-[360px]:flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-bold text-cream">
        C
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-none border border-charcoal/10 bg-cream px-4 py-2.5 text-sm text-charcoal">
        {children}
      </div>
    </div>
  );
}
