'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ColumnDef<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}

interface FilterDef {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}

interface DataTableProps<T> {
  title?: string;
  columns: ColumnDef<T>[];
  data: T[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: { message: string; data?: { code?: string } | null };
  onRetry?: () => void;
  filters?: FilterDef[];
  emptyTitle: string;
  emptyDescription: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadMoreLabel?: string;
  rowClassName?: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  title,
  columns,
  data,
  isLoading,
  isError,
  error,
  onRetry,
  filters,
  emptyTitle,
  emptyDescription,
  onLoadMore,
  hasMore,
  loadMoreLabel,
  rowClassName,
  onRowClick,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <Card>
        {title && <CardHeader><CardTitle>{title}</CardTitle></CardHeader>}
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded" />
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

  const rows = data ?? [];

  return (
    <Card>
      {title && <CardHeader><CardTitle>{title}</CardTitle></CardHeader>}
      <CardContent>
        {/* Filters */}
        {filters && filters.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {filters.map((f) => (
              <select
                key={f.key}
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                aria-label={f.label}
                className="rounded-md border border-charcoal/15 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="py-8 text-center" data-testid="data-table-empty">
            <p className="font-medium text-charcoal">{emptyTitle}</p>
            <p className="mt-1 text-sm text-dune">{emptyDescription}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-charcoal/8">
                    {columns.map((col) => (
                      <th key={col.key} className="pb-2 text-left font-medium text-dune">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'border-b border-charcoal/5 last:border-0',
                        rowClassName?.(row),
                        onRowClick && 'cursor-pointer',
                      )}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {columns.map((col) => (
                        <td key={col.key} className="py-2 pr-3">
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && onLoadMore && (
              <div className="mt-3 text-center">
                <Button variant="outline" size="sm" onClick={onLoadMore}>
                  {loadMoreLabel ?? 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
