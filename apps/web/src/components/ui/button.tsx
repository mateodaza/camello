import { cn } from '@/lib/utils';

const variants: Record<string, string> = {
  default: 'bg-gray-900 text-white hover:bg-gray-800',
  outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  ghost: 'text-gray-700 hover:bg-gray-100',
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
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
