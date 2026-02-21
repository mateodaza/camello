import { cn } from '@/lib/utils';

const variants: Record<string, string> = {
  default: 'bg-teal text-cream hover:bg-teal/90',
  outline: 'border border-charcoal/15 bg-cream text-charcoal hover:bg-sand',
  ghost: 'text-charcoal hover:bg-sand',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
};

const sizes: Record<string, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 px-3 text-sm',
  lg: 'h-10 px-6',
};

export function Button({
  variant = 'default',
  size = 'default',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
