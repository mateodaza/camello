'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CardFeedProps<T> {
  title?: string;
  icon?: ReactNode;
  cardClassName?: string;
  items: T[] | undefined;
  renderCard: (item: T, index: number) => ReactNode;
  isLoading: boolean;
  isError: boolean;
  error?: { message: string; data?: { code?: string } | null };
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadMoreLabel?: string;
}

export function CardFeed<T>({
  title,
  icon,
  cardClassName,
  items,
  renderCard,
  isLoading,
  isError,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  onLoadMore,
  hasMore,
  loadMoreLabel,
}: CardFeedProps<T>) {
  if (isLoading) {
    return (
      <Card className={cn(cardClassName)}>
        {title && <CardHeader><CardTitle>{icon && title ? <span className="flex items-center gap-2">{icon}{title}</span> : title}</CardTitle></CardHeader>}
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError && error) {
    return (
      <Card className={cn(cardClassName)}>
        {title && <CardHeader><CardTitle>{icon && title ? <span className="flex items-center gap-2">{icon}{title}</span> : title}</CardTitle></CardHeader>}
        <CardContent>
          <QueryError error={error} onRetry={onRetry} />
        </CardContent>
      </Card>
    );
  }

  const list = items ?? [];

  return (
    <Card className={cn(cardClassName)}>
      {title && <CardHeader><CardTitle>{icon && title ? <span className="flex items-center gap-2">{icon}{title}</span> : title}</CardTitle></CardHeader>}
      <CardContent>
        {list.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-medium text-charcoal">{emptyTitle}</p>
            <p className="mt-1 text-sm text-dune">{emptyDescription}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((item, i) => (
              <div key={i} className="rounded-lg border border-charcoal/8 p-3">
                {renderCard(item, i)}
              </div>
            ))}
            {hasMore && onLoadMore && (
              <div className="text-center">
                <Button variant="outline" size="sm" onClick={onLoadMore}>
                  {loadMoreLabel ?? 'Load more'}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
