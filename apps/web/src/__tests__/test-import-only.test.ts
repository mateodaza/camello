import { describe, it, expect, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => ({ get: () => null }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

// REMOVED lucide mock — is this the culprit?
// vi.mock('lucide-react', ...)

vi.mock('@/lib/format', () => ({
  groupChunksByTitle: (c: unknown[]) => c.map((x: any) => ({ ...x, key: (x as any).id, chunkCount: 1 })),
  truncate: (s: string) => s,
  fmtDate: () => 'Jan 1',
}));

vi.mock('@/components/dashboard/knowledge-guided-empty-state', () => ({ KnowledgeGuidedEmptyState: () => null }));

function buildProxy(path: string[] = []): unknown {
  return new Proxy({}, {
    get(_, prop: string) {
      if (prop === 'useQuery') { return () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }); }
      if (prop === 'useMutation') { return () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null }); }
      if (prop === 'useUtils') { return () => new Proxy({}, { get: () => new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn() }) }) }); }
      return buildProxy([...path, prop]);
    },
  });
}

vi.mock('@/lib/trpc', () => ({ trpc: buildProxy([]) }));

describe('import diagnostics no-lucide', () => {
  it('can import without lucide mock', async () => {
    const mod = await import('@/app/dashboard/knowledge/page');
    expect(mod.default).toBeDefined();
  });
});
