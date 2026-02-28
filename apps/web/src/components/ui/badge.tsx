import { cn } from '@/lib/utils';

const variants: Record<string, string> = {
  default: 'bg-charcoal/10 text-charcoal',
  active: 'bg-teal/15 text-charcoal',
  resolved: 'bg-teal/20 text-charcoal',
  escalated: 'bg-sunset/15 text-charcoal',
  sales: 'bg-purple-100 text-purple-800',
  support: 'bg-sky-100 text-sky-800',
  marketing: 'bg-gold/20 text-charcoal',
  custom: 'bg-charcoal/10 text-charcoal',
  starter: 'bg-charcoal/10 text-charcoal',
  growth: 'bg-indigo-100 text-indigo-800',
  scale: 'bg-teal/15 text-charcoal',
  paid: 'bg-teal/15 text-charcoal',
  overdue: 'bg-sunset/15 text-charcoal',
  sent: 'bg-gold/20 text-charcoal',
  pending: 'bg-charcoal/10 text-charcoal',
  viewed: 'bg-indigo-100 text-indigo-800',
  cancelled: 'bg-charcoal/8 text-dune',
};

export function Badge({
  variant = 'default',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant] ?? variants.default,
        className,
      )}
      {...props}
    />
  );
}
