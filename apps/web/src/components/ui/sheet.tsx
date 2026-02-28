'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: 'right' | 'left';
  className?: string;
  children: React.ReactNode;
}

export function Sheet({ open, onClose, side = 'right', className, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div className="absolute inset-0 bg-midnight/40" onClick={onClose} />
      {/* panel */}
      <div
        className={cn(
          'relative ml-auto flex h-full w-full max-w-md flex-col bg-cream shadow-xl',
          side === 'left' && 'mr-auto ml-0',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between border-b border-charcoal/8 p-6', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold text-charcoal', className)} {...props} />;
}

export function SheetContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-y-auto p-6', className)} {...props} />;
}
