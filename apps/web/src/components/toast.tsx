'use client';

import { X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium shadow-md animate-in slide-in-from-right ${
            t.variant === 'error'
              ? 'border-sunset/25 bg-sunset/10 text-charcoal'
              : 'border-teal/25 bg-teal/10 text-charcoal'
          }`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => removeToast(t.id)}
            className="shrink-0 rounded p-0.5 text-dune hover:text-charcoal"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
