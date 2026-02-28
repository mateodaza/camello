'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface AlertListProps<T> {
  title?: string;
  items: T[] | undefined;
  renderAlert: (item: T, index: number) => ReactNode;
  actionLabel: string;
  onAction: (item: T) => void;
  isLoading: boolean;
  isError: boolean;
  error?: { message: string; data?: { code?: string } | null };
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription: string;
}

export function AlertList<T>({
  title,
  items,
  renderAlert,
  actionLabel,
  onAction,
  isLoading,
  isError,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
}: AlertListProps<T>) {
  if (isLoading) {
    return (
      <Card>
        {title && <CardHeader><CardTitle>{title}</CardTitle></CardHeader>}
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError && error) {
    return (
      <Card>
        {title && <CardHeader><CardTitle>{title}</CardTitle></CardHeader>}
        <CardContent>
          <QueryError error={error} onRetry={onRetry} />
        </CardContent>
      </Card>
    );
  }

  const list = items ?? [];

  return (
    <Card>
      {title && <CardHeader><CardTitle>{title}</CardTitle></CardHeader>}
      <CardContent>
        {list.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-medium text-charcoal">{emptyTitle}</p>
            <p className="mt-1 text-sm text-dune">{emptyDescription}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((item, i) => (
              <div
                key={i}
                className="flex items-start justify-between rounded-lg border-l-4 border-sunset/50 bg-sunset/5 p-3"
              >
                <div className="flex-1">{renderAlert(item, i)}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-3 shrink-0"
                  onClick={() => onAction(item)}
                  data-testid="alert-action"
                >
                  {actionLabel}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
