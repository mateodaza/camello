import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Stable spy registry for utils — keyed by 'ns.resource.method'
const utilsSpies = new Map<string, ReturnType<typeof vi.fn>>();
function getUtilsSpy(path: string) {
  if (!utilsSpies.has(path)) utilsSpies.set(path, vi.fn());
  return utilsSpies.get(path)!;
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
        return (opts?: {
          onMutate?: (vars: unknown) => unknown;
          onSuccess?: () => void;
          onError?: (err: unknown, vars: unknown, ctx: unknown) => void;
        }) => {
          const base = mutationMocks.get(key) ?? mockMutationResult();
          const baseMutate = base.mutate as (vars: unknown) => void;
          return {
            ...base,
            mutate: (vars: unknown) => {
              void opts?.onMutate?.(vars);
              baseMutate(vars);
            },
          };
        };
      }
      if (prop === 'useUtils') {
        return () => new Proxy({}, {
          get(_, ns: string) {
            return new Proxy({}, {
              get(_, resource: string) {
                return new Proxy({}, {
                  get(_, method: string) {
                    return getUtilsSpy(`${ns}.${resource}.${method}`);
                  },
                });
              },
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
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
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

    const mod = await import('@/app/dashboard/agents/[id]/page');
    render(createElement(mod.default));

    expect(screen.getByText('Test Sales Agent')).toBeInTheDocument();
    expect(screen.getByText('configIdentityTitle')).toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Render Tests — QuotesSection
// ---------------------------------------------------------------------------

describe('QuotesSection', () => {
  beforeEach(() => {
    queryMocks.clear();
    mutationMocks.clear();
  });

  it('renders enriched data columns from salesQuotes', async () => {
    setQueryMock('agent.salesQuotes', [
      {
        id: 'q1',
        output: { total: '1500.00', status: 'sent' },
        status: 'executed',
        conversationId: 'conv-abc',
        createdAt: new Date('2025-01-01'),
        leadId: 'lead-1',
        customerId: 'cust-1',
        customerName: 'Acme Corp',
        amount: '1500.00',
        quoteStatus: 'sent',
      },
      {
        id: 'q2',
        output: {},
        status: 'executed',
        conversationId: 'conv-def',
        createdAt: new Date('2025-01-02'),
        leadId: null,
        customerId: null,
        customerName: null,
        amount: null,
        quoteStatus: null,
      },
    ]);

    const { QuotesSection } = await import('@/components/agent-workspace/sales/quotes-section');
    render(createElement(QuotesSection as any, { artifactId: 'test-artifact-id' }));

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('$1500.00')).toBeInTheDocument();
    // null customerName renders as dash
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty state when salesQuotes returns []', async () => {
    setQueryMock('agent.salesQuotes', []);

    const { QuotesSection } = await import('@/components/agent-workspace/sales/quotes-section');
    render(createElement(QuotesSection as any, { artifactId: 'test-artifact-id' }));

    // next-intl mock returns the key as-is
    expect(screen.getByText('quotesEmptyTitle')).toBeInTheDocument();
    expect(screen.getByText('quotesEmptyDescription')).toBeInTheDocument();
  });

  it('row click deep-links to inbox; no-conversationId row skips navigation', async () => {
    const mockPush = vi.fn();
    const nav = await import('next/navigation');
    vi.spyOn(nav, 'useRouter').mockReturnValue({ push: mockPush } as any);

    setQueryMock('agent.salesQuotes', [
      {
        id: 'q1',
        output: {},
        status: 'executed',
        conversationId: 'conv-abc',
        createdAt: new Date('2025-01-01'),
        leadId: null,
        customerId: null,
        customerName: 'Click Me',
        amount: null,
        quoteStatus: null,
      },
      {
        id: 'q2',
        output: {},
        status: 'executed',
        conversationId: null,
        createdAt: new Date('2025-01-02'),
        leadId: null,
        customerId: null,
        customerName: 'No Nav',
        amount: null,
        quoteStatus: null,
      },
    ]);

    const { QuotesSection } = await import('@/components/agent-workspace/sales/quotes-section');
    render(createElement(QuotesSection as any, { artifactId: 'test-artifact-id' }));

    const rows = screen.getAllByRole('row').filter((r) => !r.querySelector('th'));
    // Click first row (has conversationId)
    fireEvent.click(rows[0]!);
    expect(mockPush).toHaveBeenCalledWith('/dashboard/conversations?selected=conv-abc');

    // Click second row (no conversationId) — push should not be called again
    mockPush.mockClear();
    fireEvent.click(rows[1]!);
    expect(mockPush).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Render Tests — MeetingsSection
// ---------------------------------------------------------------------------

describe('MeetingsSection', () => {
  beforeEach(() => {
    queryMocks.clear();
    mutationMocks.clear();
  });

  it('renders meeting cards with customerName, topic, and date', async () => {
    setQueryMock('agent.salesMeetings', [
      {
        id: 'm1',
        output: { booked: true, datetime: '2099-06-15T10:00:00.000Z' },
        status: 'executed',
        conversationId: 'conv-m1',
        createdAt: new Date('2025-06-01'),
        leadId: 'lead-1',
        customerId: 'cust-1',
        customerName: 'Acme Corp',
        datetime: '2099-06-15T10:00:00.000Z',
        topic: 'Product demo',
        booked: true,
      },
    ]);

    const { MeetingsSection } = await import('@/components/agent-workspace/sales/meetings-section');
    render(createElement(MeetingsSection as any, { artifactId: 'test-artifact-id' }));

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Product demo')).toBeInTheDocument();
    // Confirmed badge
    expect(screen.getByText('meetingStatusConfirmed')).toBeInTheDocument();
  });

  it('renders empty state for upcoming when salesMeetings returns []', async () => {
    setQueryMock('agent.salesMeetings', []);

    const { MeetingsSection } = await import('@/components/agent-workspace/sales/meetings-section');
    render(createElement(MeetingsSection as any, { artifactId: 'test-artifact-id' }));

    // next-intl mock returns the key as-is
    expect(screen.getByText('meetingsUpcomingEmptyTitle')).toBeInTheDocument();
    expect(screen.getByText('meetingsUpcomingEmptyDescription')).toBeInTheDocument();
  });

  it('row click deep-links to inbox; row without conversationId skips navigation', async () => {
    const mockPush = vi.fn();
    const nav = await import('next/navigation');
    vi.spyOn(nav, 'useRouter').mockReturnValue({ push: mockPush } as any);

    setQueryMock('agent.salesMeetings', [
      {
        id: 'm1',
        output: { booked: true, datetime: '2099-06-15T10:00:00.000Z' },
        status: 'executed',
        conversationId: 'conv-m1',
        createdAt: new Date('2025-06-01'),
        leadId: null,
        customerId: null,
        customerName: 'Click Me',
        datetime: '2099-06-15T10:00:00.000Z',
        topic: 'Demo',
        booked: true,
      },
      {
        id: 'm2',
        output: { booked: false },
        status: 'executed',
        conversationId: null,
        createdAt: new Date('2025-05-01'),
        leadId: null,
        customerId: null,
        customerName: 'No Nav',
        datetime: null,
        topic: 'Intro',
        booked: false,
      },
    ]);

    const { MeetingsSection } = await import('@/components/agent-workspace/sales/meetings-section');
    render(createElement(MeetingsSection as any, { artifactId: 'test-artifact-id' }));

    const buttons = screen.getAllByRole('button');
    // Click first button (has conversationId)
    fireEvent.click(buttons[0]!);
    expect(mockPush).toHaveBeenCalledWith('/dashboard/conversations?selected=conv-m1');

    // Click second button (no conversationId) — push should not be called again
    mockPush.mockClear();
    fireEvent.click(buttons[1]!);
    expect(mockPush).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
