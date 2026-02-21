import { cn } from '@/lib/utils';

interface TooltipProps {
  label: string;
  show: boolean;
  children: React.ReactNode;
}

export function Tooltip({ label, show, children }: TooltipProps) {
  if (!show) return <>{children}</>;

  return (
    <div className="group relative">
      {children}
      <div
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2',
          'whitespace-nowrap rounded-md bg-charcoal px-2.5 py-1.5',
          'font-heading text-xs font-medium text-cream',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
        )}
      >
        {label}
      </div>
    </div>
  );
}
