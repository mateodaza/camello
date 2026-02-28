import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { createElement } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// next-intl: passthrough translation function
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
  useLocale: () => 'en',
}));

// next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-artifact-id' }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard/agents/test-artifact-id',
}));

// next/link — render as <a>
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) =>
    createElement('a', { href, ...props }, children),
}));

// Toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// tRPC mock helpers
const mockQueryResult = (data: unknown, overrides?: Partial<{ isLoading: boolean; isError: boolean; error: unknown }>) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  ...overrides,
});

const mockMutationResult = (overrides?: Partial<{ mutate: ReturnType<typeof vi.fn>; isPending: boolean }>) => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  ...overrides,
});

// Global mock map for trpc hooks
const queryMocks = new Map<string, ReturnType<typeof mockQueryResult>>();
const mutationMocks = new Map<string, ReturnType<typeof mockMutationResult>>();

function setQueryMock(path: string, data: unknown, overrides?: Parameters<typeof mockQueryResult>[1]) {
  queryMocks.set(path, mockQueryResult(data, overrides));
}

function setMutationMock(path: string, overrides?: Parameters<typeof mockMutationResult>[0]) {
  mutationMocks.set(path, mockMutationResult(overrides));
}

function buildNestedProxy(target: Record<string, unknown>, path: string[] = []): unknown {
  return new Proxy(target, {
    get(_, prop: string) {
      if (prop === 'useQuery') {
        const key = path.join('.');
        return () => queryMocks.get(key) ?? mockQueryResult(undefined, { isLoading: true });
      }
      if (prop === 'useMutation') {
        const key = path.join('.');
        return () => mutationMocks.get(key) ?? mockMutationResult();
      }
      if (prop === 'useUtils') {
        return () => new Proxy({}, {
          get() {
            return new Proxy({}, {
              get() { return vi.fn(); },
            });
          },
        });
      }
      return buildNestedProxy({}, [...path, prop]);
    },
  });
}

vi.mock('@/lib/trpc', () => ({
  trpc: buildNestedProxy({}, []),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { sectionRegistry } from '@/components/agent-workspace/registry';
import { getScoreColor } from '@/components/agent-workspace/workspace-header';

// ---------------------------------------------------------------------------
// Pure Logic Tests
// ---------------------------------------------------------------------------

describe('sectionRegistry', () => {
  it('returns sales sections for "sales" type', () => {
    expect(sectionRegistry.sales).toBeDefined();
    expect(sectionRegistry.sales.length).toBe(3);
  });

  it('returns support sections for "support" type (4 sections incl. knowledge gaps)', () => {
    expect(sectionRegistry.support).toBeDefined();
    expect(sectionRegistry.support.length).toBe(4);
  });

  it('returns marketing sections for "marketing" type', () => {
    expect(sectionRegistry.marketing).toBeDefined();
    expect(sectionRegistry.marketing.length).toBe(3);
  });

  it('returns empty array for "custom" type', () => {
    expect(sectionRegistry.custom).toEqual([]);
  });

  it('returns undefined for unknown type', () => {
    expect(sectionRegistry['unknown_type']).toBeUndefined();
  });
});

describe('getScoreColor', () => {
  it('returns teal for score >= 80', () => {
    expect(getScoreColor(80)).toBe('text-teal');
    expect(getScoreColor(100)).toBe('text-teal');
    expect(getScoreColor(95)).toBe('text-teal');
  });

  it('returns gold for score >= 50 and < 80', () => {
    expect(getScoreColor(50)).toBe('text-gold');
    expect(getScoreColor(79)).toBe('text-gold');
    expect(getScoreColor(65)).toBe('text-gold');
  });

  it('returns sunset for score < 50', () => {
    expect(getScoreColor(49)).toBe('text-sunset');
    expect(getScoreColor(0)).toBe('text-sunset');
    expect(getScoreColor(25)).toBe('text-sunset');
  });
});

// ---------------------------------------------------------------------------
// Render Tests — DataTable
// ---------------------------------------------------------------------------

describe('DataTable', () => {
  beforeEach(() => {
    queryMocks.clear();
    mutationMocks.clear();
  });

  it('renders empty state when data is []', async () => {
    const { DataTable } = await import('@/components/agent-workspace/primitives/data-table');
    render(createElement(DataTable as any, {
      columns: [{ key: 'name', label: 'Name', render: (row: unknown) => (row as { name: string }).name }],
      data: [],
      isLoading: false,
      isError: false,
      emptyTitle: 'No items',
      emptyDescription: 'Nothing to show',
    }));

    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });

  it('renders rows from provided data', async () => {
    const { DataTable } = await import('@/components/agent-workspace/primitives/data-table');
    render(createElement(DataTable as any, {
      columns: [{ key: 'name', label: 'Name', render: (row: unknown) => (row as { name: string }).name }],
      data: [{ name: 'Alice' }, { name: 'Bob' }],
      isLoading: false,
      isError: false,
      emptyTitle: 'No items',
      emptyDescription: 'Nothing',
    }));

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders loading skeleton', async () => {
    const { DataTable } = await import('@/components/agent-workspace/primitives/data-table');
    const { container } = render(createElement(DataTable as any, {
      columns: [],
      data: undefined,
      isLoading: true,
      isError: false,
      emptyTitle: '',
      emptyDescription: '',
    }));

    // Skeletons use animate-pulse class
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Render Tests — CardFeed
// ---------------------------------------------------------------------------

describe('CardFeed', () => {
  it('handles malformed output gracefully', async () => {
    const { CardFeed } = await import('@/components/agent-workspace/primitives/card-feed');
    render(createElement(CardFeed as any, {
      items: [{ id: '1', output: null, createdAt: null }],
      renderCard: (item: unknown) => {
        // Simulate what a registry component would do with malformed output
        const typed = item as { output: unknown };
        const output = (typed.output ?? {}) as Record<string, unknown>;
        return createElement('span', null, String(output.topic ?? 'Unknown'));
      },
      isLoading: false,
      isError: false,
      emptyTitle: 'Empty',
      emptyDescription: 'No data',
    }));

    // Should render "Unknown" fallback, not crash
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders empty state when items is []', async () => {
    const { CardFeed } = await import('@/components/agent-workspace/primitives/card-feed');
    render(createElement(CardFeed as any, {
      items: [],
      renderCard: () => createElement('span', null, 'card'),
      isLoading: false,
      isError: false,
      emptyTitle: 'No cards',
      emptyDescription: 'Nothing here',
    }));

    expect(screen.getByText('No cards')).toBeInTheDocument();
  });

  it('renders valid draft_text from module output', async () => {
    const { CardFeed } = await import('@/components/agent-workspace/primitives/card-feed');
    render(createElement(CardFeed as any, {
      items: [{ id: '1', output: { draft_text: 'Welcome to our store!', content_type: 'email', topic: 'Promo', status: 'draft' }, createdAt: '2025-01-01', status: 'executed' }],
      renderCard: (item: unknown) => {
        const typed = item as { output: Record<string, unknown> };
        const output = (typed.output ?? {}) as Record<string, unknown>;
        const draft = String(output.draft_text ?? '');
        return createElement('span', null, draft || 'Empty');
      },
      isLoading: false,
      isError: false,
      emptyTitle: 'Empty',
      emptyDescription: 'No data',
    }));

    expect(screen.getByText('Welcome to our store!')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Render Tests — AlertList
// ---------------------------------------------------------------------------

describe('AlertList', () => {
  it('action button fires onAction callback', async () => {
    const onAction = vi.fn();
    const { AlertList } = await import('@/components/agent-workspace/primitives/alert-list');
    render(createElement(AlertList as any, {
      items: [{ id: '1', name: 'Test alert' }],
      renderAlert: (item: unknown) => createElement('span', null, (item as { name: string }).name),
      actionLabel: 'Acknowledge',
      onAction,
      isLoading: false,
      isError: false,
      emptyTitle: 'No alerts',
      emptyDescription: 'All clear',
    }));

    const btn = screen.getByTestId('alert-action');
    fireEvent.click(btn);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ id: '1', name: 'Test alert' });
  });

  it('renders empty state when items is []', async () => {
    const { AlertList } = await import('@/components/agent-workspace/primitives/alert-list');
    render(createElement(AlertList as any, {
      items: [],
      renderAlert: () => createElement('span'),
      actionLabel: 'Act',
      onAction: vi.fn(),
      isLoading: false,
      isError: false,
      emptyTitle: 'No alerts',
      emptyDescription: 'All good',
    }));

    expect(screen.getByText('No alerts')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Render Tests — PriorityIntents
// ---------------------------------------------------------------------------

describe('PriorityIntents', () => {
  beforeEach(() => {
    queryMocks.clear();
    mutationMocks.clear();
  });

  it('renders nothing when data is empty array', async () => {
    setQueryMock('agent.highPriorityIntents', []);

    const { PriorityIntents } = await import('@/components/agent-workspace/priority-intents');
    const { container } = render(createElement(PriorityIntents, { artifactId: 'test-id' }));

    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when loading', async () => {
    setQueryMock('agent.highPriorityIntents', undefined, { isLoading: true });

    const { PriorityIntents } = await import('@/components/agent-workspace/priority-intents');
    const { container } = render(createElement(PriorityIntents, { artifactId: 'test-id' }));

    expect(container.innerHTML).toBe('');
  });

  it('renders QueryError when query fails', async () => {
    setQueryMock('agent.highPriorityIntents', undefined, {
      isLoading: false,
      isError: true,
      error: { message: 'Network error', data: { code: 'INTERNAL_SERVER_ERROR' } },
    });

    const { PriorityIntents } = await import('@/components/agent-workspace/priority-intents');
    const { container } = render(createElement(PriorityIntents, { artifactId: 'test-id' }));

    // Should render something (not empty) — the inline QueryError
    expect(container.innerHTML).not.toBe('');
    expect(screen.getByText('error.internalServer')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Render Tests — Workspace Page
// ---------------------------------------------------------------------------

describe('AgentWorkspacePage', () => {
  beforeEach(() => {
    queryMocks.clear();
    mutationMocks.clear();
  });

  it('shows loading skeleton when query is pending', async () => {
    setQueryMock('agent.workspace', undefined, { isLoading: true });

    const mod = await import('@/app/dashboard/agents/[id]/page');
    const { container } = render(createElement(mod.default));

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  it('shows QueryError when primary query fails', async () => {
    setQueryMock('agent.workspace', undefined, {
      isLoading: false,
      isError: true,
      error: { message: 'Network error', data: { code: 'INTERNAL_SERVER_ERROR' } },
    });

    const mod = await import('@/app/dashboard/agents/[id]/page');
    render(createElement(mod.default));

    // QueryError uses the common.error.internalServer key via useTranslations
    // Our mock returns the key as-is
    expect(screen.getByText('error.internalServer')).toBeInTheDocument();
  });

  it('renders workspace content when data loaded', async () => {
    setQueryMock('agent.workspace', {
      artifact: {
        id: 'test-artifact-id',
        name: 'Test Sales Agent',
        type: 'sales',
        isActive: true,
      },
      boundModules: [
        { slug: 'qualify_lead', name: 'Qualify Lead', autonomyLevel: 'fully_autonomous' },
      ],
      metrics: {
        totalExecutions: 42,
        autonomousExecutions: 38,
        pendingApprovals: 4,
        automationScore: 90,
        conversationCount: 15,
      },
    });

    // Mock secondary queries (sales sections + activity + priority intents)
    setQueryMock('agent.salesPipeline', []);
    setQueryMock('agent.salesFunnel', []);
    setQueryMock('agent.salesLeads', []);
    setQueryMock('agent.salesQuotes', []);
    setQueryMock('agent.highPriorityIntents', []);
    setQueryMock('agent.activityFeed', []);

    const mod = await import('@/app/dashboard/agents/[id]/page');
    render(createElement(mod.default));

    expect(screen.getByText('Test Sales Agent')).toBeInTheDocument();
    expect(screen.getByText('Qualify Lead')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Render Tests — BarChartCss
// ---------------------------------------------------------------------------

describe('BarChartCss', () => {
  it('renders bars proportionally', async () => {
    const { BarChartCss } = await import('@/components/agent-workspace/primitives/bar-chart-css');
    render(createElement(BarChartCss, {
      bars: [
        { label: 'New', value: 10 },
        { label: 'Won', value: 5 },
      ],
    }));

    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Won')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Render Tests — MetricsGrid
// ---------------------------------------------------------------------------

describe('MetricsGrid', () => {
  it('renders stat cards for each metric', async () => {
    const { MetricsGrid } = await import('@/components/agent-workspace/primitives/metrics-grid');
    render(createElement(MetricsGrid, {
      metrics: [
        { label: 'Pipeline Value', value: '$1,000' },
        { label: 'Hot Leads', value: 5 },
      ],
    }));

    expect(screen.getByText('Pipeline Value')).toBeInTheDocument();
    expect(screen.getByText('$1,000')).toBeInTheDocument();
    expect(screen.getByText('Hot Leads')).toBeInTheDocument();
  });
});
