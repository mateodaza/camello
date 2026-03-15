'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/tooltip';

export interface SectionProps {
  title: string;
  icon?: LucideIcon;
  badge?: number;
  defaultOpen?: boolean;
  autoOpen?: boolean;
  testId?: string;
  tooltip?: string;
  children?: React.ReactNode;
}

export const Section = React.forwardRef<HTMLDetailsElement, SectionProps>(
  function Section(
    { title, icon: Icon, badge, defaultOpen = false, autoOpen, testId, tooltip, children },
    forwardedRef,
  ) {
    const localRef = useRef<HTMLDetailsElement>(null);

    const setRef = useCallback(
      (node: HTMLDetailsElement | null) => {
        (localRef as React.MutableRefObject<HTMLDetailsElement | null>).current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLDetailsElement | null>).current = node;
        }
      },
      [forwardedRef],
    );

    // Reactive: re-fires whenever autoOpen changes false→true.
    // One-directional: only opens, never force-closes. User-driven toggles unaffected.
    useEffect(() => {
      if (autoOpen && localRef.current) {
        localRef.current.open = true;
      }
    }, [autoOpen]); // re-fires whenever autoOpen changes false→true

    return (
      <details
        ref={setRef}
        open={defaultOpen || undefined}
        className="group rounded-xl border border-charcoal/8 bg-cream"
        data-testid={testId}
      >
        <summary
          className="flex cursor-pointer list-none items-center justify-between px-5 py-4 select-none"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-tooltip-trigger]')) {
              e.preventDefault();
            }
          }}
        >
          <span className="flex items-center gap-2 font-heading text-base font-semibold text-charcoal">
            {Icon && <Icon className="h-4 w-4 text-dune" />}
            {title}
            {tooltip && <InfoTooltip label={tooltip} position="top" />}
            {badge != null && badge > 0 && (
              <span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal">
                {badge}
              </span>
            )}
          </span>
          <ChevronRight className="h-4 w-4 text-dune transition-transform group-open:rotate-90" />
        </summary>
        <div className="border-t border-charcoal/8 px-5 py-4">{children}</div>
      </details>
    );
  },
);
