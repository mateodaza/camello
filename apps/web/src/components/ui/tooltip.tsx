'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

// Existing Tooltip — updated with position prop and max-width
interface TooltipProps {
  label: string;
  show: boolean;
  position?: 'right' | 'top' | 'bottom';
  children: React.ReactNode;
}

export function Tooltip({ label, show, position = 'right', children }: TooltipProps) {
  if (!show) return <>{children}</>;

  const positionClasses = {
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
    top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
    bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  }[position];

  return (
    <div className="group relative">
      {children}
      <div
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50',
          positionClasses,
          'max-w-[240px] whitespace-normal rounded-md bg-charcoal px-2.5 py-1.5',
          'font-heading text-xs font-medium text-cream',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
        )}
      >
        {label}
      </div>
    </div>
  );
}

// New InfoTooltip — ⓘ icon trigger variant with JS-state driven visibility
interface InfoTooltipProps {
  label: string;
  position?: 'right' | 'top' | 'bottom';
}

export function InfoTooltip({ label, position = 'top' }: InfoTooltipProps) {
  const [hovered, setHovered] = useState(false);
  const [tapped, setTapped] = useState(false);

  const positionClasses = {
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
    top: 'bottom-full left-0 mb-2',
    bottom: 'top-full left-0 mt-2',
  }[position];

  return (
    <button
      type="button"
      data-tooltip-trigger
      aria-label="More information"
      className="relative inline-flex items-center justify-center min-h-[36px] min-w-[36px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        setTapped(true);
        setTimeout(() => setTapped(false), 3000);
      }}
    >
      <Info className="h-4 w-4 text-dune/60 cursor-help" />
      <div
        role="tooltip"
        aria-hidden={!hovered && !tapped}
        className={cn(
          'pointer-events-none absolute z-50 rounded-md bg-charcoal px-2.5 py-1.5',
          'font-heading text-xs font-medium text-cream',
          'w-[240px] whitespace-normal',
          'transition-opacity duration-150',
          positionClasses,
          hovered || tapped ? 'opacity-100' : 'opacity-0',
        )}
      >
        {label}
      </div>
    </button>
  );
}
