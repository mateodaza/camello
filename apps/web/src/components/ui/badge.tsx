import { cn } from '@/lib/utils';

const variants: Record<string, string> = {
  default: 'bg-gray-100 text-gray-800',
  active: 'bg-green-100 text-green-800',
  resolved: 'bg-blue-100 text-blue-800',
  escalated: 'bg-red-100 text-red-800',
  sales: 'bg-purple-100 text-purple-800',
  support: 'bg-sky-100 text-sky-800',
  marketing: 'bg-amber-100 text-amber-800',
  custom: 'bg-gray-100 text-gray-800',
  starter: 'bg-gray-100 text-gray-800',
  growth: 'bg-indigo-100 text-indigo-800',
  scale: 'bg-emerald-100 text-emerald-800',
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
