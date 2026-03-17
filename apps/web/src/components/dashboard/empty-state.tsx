'use client';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  'data-testid'?: string;
}

export function EmptyState({ icon: Icon, title, description, action, 'data-testid': testId }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-center"
      data-testid={testId ?? 'empty-state'}
    >
      <Icon className="mb-4 h-12 w-12 text-dune/50" aria-hidden="true" />
      <h3 className="font-heading text-lg font-semibold text-charcoal">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-dune">{description}</p>
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="mt-4 inline-block rounded-md bg-teal px-6 py-2 text-sm font-medium text-cream hover:bg-teal/90"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-4 rounded-md bg-teal px-6 py-2 text-sm font-medium text-cream hover:bg-teal/90"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
