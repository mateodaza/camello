import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { createElement } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('lucide-react', () =>
  new Proxy({}, { get: (_, name: string) => () => createElement('svg', { 'data-icon': name }) }),
);

vi.mock('@/lib/format', () => ({
  groupChunksByTitle: (chunks: unknown[]) =>
    chunks.map((c: unknown) => ({ ...(c as object), key: (c as { id: string }).id, chunkCount: 1 })),
  truncate: (s: string) => s,
  fmtDate: () => 'Jan 1',
}));

vi.mock('@/components/dashboard/knowledge-guided-empty-state', () => ({
  KnowledgeGuidedEmptyState: () => null,
}));

// tRPC mock helpers
const queryMocks = new Map<string, unknown>();

function buildNestedProxy(target: Record<string, unknown>, path: string[] = []): unknown {
  return new Proxy(target, {
    get(_, prop: string) {
      if (prop === 'useQuery') {
        const key = path.join('.');
        const result = queryMocks.get(key);
        return () =>
          result ?? { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() };
      }
      if (prop === 'useMutation') {
        return () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null });
      }
      if (prop === 'useUtils') {
        return () =>
          new Proxy({}, { get: () => new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn() }) }) });
      }
      return buildNestedProxy({}, [...path, prop]);
    },
  });
}

vi.mock('@/lib/trpc', () => ({
  trpc: buildNestedProxy({}, []),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const knowledgeData = [
  { id: 'd1', title: 'Doc', sourceType: 'upload', chunkCount: 2, createdAt: new Date() },
];

const learningData = [
  {
    id: 'l1',
    content: 'test learning content longer than needed',
    type: 'preference',
    confidence: 0.9,
    sourceModuleSlug: 'qualify_lead',
    archivedAt: null,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgePage', () => {
  beforeEach(() => {
    queryMocks.clear();
    queryMocks.set('knowledge.list', {
      data: knowledgeData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    queryMocks.set('learning.list', {
      data: learningData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('learnings section is collapsed by default', async () => {
    const mod = await import('@/app/dashboard/knowledge/page');
    render(createElement(mod.default));
    expect(screen.queryByTestId('learnings-table')).toBeNull();
    expect(screen.getByRole('button', { name: 'sectionLearningsToggle' })).toBeInTheDocument();
  });

  it('clicking Show toggle reveals the learnings table', async () => {
    const mod = await import('@/app/dashboard/knowledge/page');
    render(createElement(mod.default));
    fireEvent.click(screen.getByRole('button', { name: 'sectionLearningsToggle' }));
    expect(screen.getByTestId('learnings-table')).toBeInTheDocument();
  });
});
