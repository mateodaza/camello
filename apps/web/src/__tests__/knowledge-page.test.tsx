import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { createElement } from 'react';
import { useTranslations } from 'next-intl';
import messages from '../../messages/en.json';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(),
  useLocale: () => 'en',
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// lucide-react: return a plain object of stubbed icon components.
// A Proxy without ownKeys/has traps confuses Vitest's ESM live-binding
// resolution and causes dynamic imports of the page to hang indefinitely.
vi.mock('lucide-react', () => {
  const icon = (name: string) => () => createElement('svg', { 'data-icon': name });
  return {
    Plus: icon('Plus'),
    MoreHorizontal: icon('MoreHorizontal'),
    CheckCircle2: icon('CheckCircle2'),
    ChevronDown: icon('ChevronDown'),
    ChevronUp: icon('ChevronUp'),
    ChevronRight: icon('ChevronRight'),
    X: icon('X'),
    Check: icon('Check'),
    Search: icon('Search'),
    Trash2: icon('Trash2'),
    Edit: icon('Edit'),
    Eye: icon('Eye'),
    EyeOff: icon('EyeOff'),
    AlertCircle: icon('AlertCircle'),
    Info: icon('Info'),
    Loader2: icon('Loader2'),
  };
});

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
const mutationMocks = new Map<string, unknown>();

// Function declaration — JS hoisting makes it available in the vi.mock factory below.
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
        const key = path.join('.');
        const result = mutationMocks.get(key);
        return () => result ?? { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null };
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// RTL v16 (for React 19) wraps render() and fireEvent in act() internally.
// We do NOT use await act(async () => { render() }) — that pattern can hang in
// React 19 + Node 24 due to MessageChannel scheduling.
function renderPage(mod: { default: React.ComponentType }) {
  render(createElement(mod.default));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgePage', () => {
  beforeEach(() => {
    vi.mocked(useTranslations).mockImplementation(() => ((key: string) => key) as any);
    queryMocks.clear();
    mutationMocks.clear();
    queryMocks.set('knowledge.list', {
      data: knowledgeData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    queryMocks.set('artifact.list', {
      data: [{ id: 'a1', name: 'Test Agent', type: 'support' }],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    queryMocks.set('agent.supportKnowledgeGaps', {
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('shows success callout when agent has no knowledge gaps', async () => {
    queryMocks.set('agent.supportKnowledgeGaps', {
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const mod = await import('@/app/dashboard/knowledge/page');
    renderPage(mod);
    // Effect auto-selects the single agent → waitFor polls until visible
    await waitFor(() => {
      expect(screen.getByTestId('gaps-empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText('gapsEmptySuccess')).toBeInTheDocument();
  });

  it('shows error state (not success callout) when gaps query fails', async () => {
    queryMocks.set('agent.supportKnowledgeGaps', {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network error'),
      refetch: vi.fn(),
    });
    const mod = await import('@/app/dashboard/knowledge/page');
    renderPage(mod);
    await waitFor(() => {
      expect(screen.getAllByText('error.retry').length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId('gaps-empty-state')).toBeNull();
  });

  it('teach input submit calls knowledge.ingest with correct payload', async () => {
    const mockMutate = vi.fn();
    mutationMocks.set('knowledge.ingest', {
      mutate: mockMutate, mutateAsync: vi.fn(), isPending: false, isError: false, error: null,
    });
    const mod = await import('@/app/dashboard/knowledge/page');
    renderPage(mod);
    const text = 'This is a test knowledge entry that is long enough';
    fireEvent.change(screen.getByPlaceholderText('teachInputPlaceholder'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'teachInputAdd' }));
    expect(mockMutate).toHaveBeenCalledWith({
      content: text,
      title: expect.stringMatching(new RegExp(`^Manual entry — ${text.slice(0, 50)} \\[\\d+\\]$`)),
      sourceType: 'upload',
    });
  });

  it('teach input shows inline error when text is shorter than 20 chars', async () => {
    const mod = await import('@/app/dashboard/knowledge/page');
    renderPage(mod);
    fireEvent.change(screen.getByPlaceholderText('teachInputPlaceholder'), { target: { value: 'too short' } });
    fireEvent.click(screen.getByRole('button', { name: 'teachInputAdd' }));
    expect(screen.getByText('teachInputTooShort')).toBeInTheDocument();
  });

  it('Teach button expands inline textarea for the gap', async () => {
    queryMocks.set('agent.supportKnowledgeGaps', {
      data: [{ intent: 'pricing', sampleQuestion: 'How much does it cost?', count: 3 }],
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    const mod = await import('@/app/dashboard/knowledge/page');
    renderPage(mod);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'gapTeachButton' })).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText('gapTeachPlaceholder')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'gapTeachButton' }));
    expect(screen.getByPlaceholderText('gapTeachPlaceholder')).toBeInTheDocument();
  });

  it('saving gap answer calls knowledge.ingest with title "Answer: [intent]"', async () => {
    queryMocks.set('agent.supportKnowledgeGaps', {
      data: [{ intent: 'pricing', sampleQuestion: 'How much does it cost?', count: 3 }],
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    const mockMutate = vi.fn();
    mutationMocks.set('knowledge.ingest', {
      mutate: mockMutate, mutateAsync: vi.fn(), isPending: false, isError: false, error: null,
    });
    const mod = await import('@/app/dashboard/knowledge/page');
    renderPage(mod);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'gapTeachButton' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'gapTeachButton' }));
    const textarea = screen.getByPlaceholderText('gapTeachPlaceholder');
    fireEvent.change(textarea, { target: { value: 'Our pricing starts at $99/month' } });
    fireEvent.click(screen.getByRole('button', { name: 'gapTeachSave' }));

    expect(mockMutate).toHaveBeenCalledWith({
      content: 'Our pricing starts at $99/month',
      title: 'Answer: pricing',
      sourceType: 'upload',
    });
  });

  it("gaps section heading renders 'Unanswered Questions' not 'Knowledge Gaps'", async () => {
    const ns_messages = (messages as unknown as Record<string, Record<string, string>>).knowledge;
    vi.mocked(useTranslations).mockImplementation((ns?: string) => {
      if (ns === 'knowledge') return ((key: string) => ns_messages[key] ?? key) as any;
      return ((key: string) => key) as any;
    });

    const mod = await import('@/app/dashboard/knowledge/page');
    renderPage(mod);

    expect(screen.getByText('Unanswered Questions')).toBeInTheDocument();
    expect(screen.queryByText('Knowledge Gaps')).toBeNull();
  });
});
