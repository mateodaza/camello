import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { createElement } from 'react';

// ---------------------------------------------------------------------------
// Mocks (all vi.mock calls must appear before the static import)
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('lucide-react', () => ({
  Plus: () => createElement('svg', { 'data-icon': 'Plus' }),
  CheckCircle2: () => createElement('svg', { 'data-icon': 'CheckCircle2' }),
  MoreHorizontal: () => createElement('svg', { 'data-icon': 'MoreHorizontal' }),
}));

vi.mock('@/lib/format', () => ({
  groupChunksByTitle: (chunks: unknown[]) =>
    chunks.map((c: unknown) => ({ ...(c as object), key: (c as { id: string }).id, chunkCount: 1 })),
  truncate: (s: string) => s,
  fmtDate: () => 'Jan 1',
}));

vi.mock('@/components/dashboard/knowledge-guided-empty-state', () => ({
  KnowledgeGuidedEmptyState: () => null,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean; onClose: () => void }) =>
    open ? createElement('div', { 'data-testid': 'dialog' }, children) : null,
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    createElement('div', null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    createElement('h2', null, children),
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    createElement('div', null, children),
  DialogFooter: ({ children }: { children: React.ReactNode }) =>
    createElement('div', null, children),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) =>
    createElement('div', null, children),
  DropdownMenuTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    createElement('button', { type: 'button', ...props } as object, children),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) =>
    createElement('div', { role: 'menu' }, children),
  DropdownMenuItem: ({ children, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    createElement('button', { type: 'button', role: 'menuitem', onClick }, children),
}));

// tRPC mock helpers
const queryMocks = new Map<string, unknown>();
const mutationMocks = new Map<string, unknown>();

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
// Static import of the page under test (must come after all vi.mock calls)
// ---------------------------------------------------------------------------

import KnowledgePage from '@/app/dashboard/knowledge/page';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const knowledgeData = [
  { id: 'd1', title: 'Doc', sourceType: 'upload', chunkCount: 2, createdAt: new Date() },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgePage', () => {
  beforeEach(() => {
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
    queryMocks.set('knowledge.getByTitle', {
      data: [{ id: 'c1', content: 'chunk content text' }],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  // Test A — "Add Knowledge" button opens modal
  it('"Add Knowledge" button opens ingest modal', () => {
    render(createElement(KnowledgePage));
    // Dialog is closed initially — title not in DOM
    expect(screen.queryByText('ingestKnowledge')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /addKnowledge/i }));
    expect(screen.getByText('ingestKnowledge')).toBeInTheDocument();
  });

  // Test B — Document cards render with overflow menu (three items)
  it('document cards render with overflow menu containing edit, delete, viewChunks', () => {
    render(createElement(KnowledgePage));
    const trigger = screen.getByRole('button', { name: 'moreOptions' });
    fireEvent.click(trigger);
    expect(screen.getByText('edit')).toBeInTheDocument();
    expect(screen.getByText('delete')).toBeInTheDocument();
    expect(screen.getByText('viewChunks')).toBeInTheDocument();
  });

  // Test C — Gaps section appears before documents section
  it('gaps section appears before documents section in the DOM', () => {
    const { container } = render(createElement(KnowledgePage));
    const headings = Array.from(container.querySelectorAll('h2'));
    const headingTexts = headings.map((h) => h.textContent);
    const gapsIdx = headingTexts.findIndex((t) => t === 'sectionGaps');
    const docsIdx = headingTexts.findIndex((t) => t === 'sectionDocuments');
    expect(gapsIdx).toBeGreaterThanOrEqual(0);
    expect(docsIdx).toBeGreaterThanOrEqual(0);
    expect(gapsIdx).toBeLessThan(docsIdx);
  });

  it('shows success callout when agent has no knowledge gaps', () => {
    // isError: false, data: [] → must reach gapsEmptySuccess branch, not QueryError
    queryMocks.set('agent.supportKnowledgeGaps', {
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(createElement(KnowledgePage));
    expect(screen.getByTestId('gaps-empty-state')).toBeInTheDocument();
    expect(screen.getByText('gapsEmptySuccess')).toBeInTheDocument();
  });

  it('shows error state (not success callout) when gaps query fails', () => {
    queryMocks.set('agent.supportKnowledgeGaps', {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network error'),
      refetch: vi.fn(),
    });
    render(createElement(KnowledgePage));
    // Success callout must not appear
    expect(screen.queryByTestId('gaps-empty-state')).toBeNull();
    // QueryError retry button must be present, confirming the error branch rendered
    expect(screen.getAllByText('error.retry').length).toBeGreaterThan(0);
  });

  it('teach input submit calls knowledge.ingest with correct payload', () => {
    const mockMutate = vi.fn();
    mutationMocks.set('knowledge.ingest', {
      mutate: mockMutate, mutateAsync: vi.fn(), isPending: false, isError: false, error: null,
    });
    render(createElement(KnowledgePage));
    const text = 'This is a test knowledge entry that is long enough';
    fireEvent.change(screen.getByPlaceholderText('teachInputPlaceholder'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'teachInputAdd' }));
    expect(mockMutate).toHaveBeenCalledWith({
      content: text,
      title: expect.stringMatching(new RegExp(`^Manual entry — ${text.slice(0, 50)} \\[\\d+\\]$`)),
      sourceType: 'upload',
    });
  });

  it('teach input shows inline error when text is shorter than 20 chars', () => {
    render(createElement(KnowledgePage));
    fireEvent.change(screen.getByPlaceholderText('teachInputPlaceholder'), { target: { value: 'too short' } });
    fireEvent.click(screen.getByRole('button', { name: 'teachInputAdd' }));
    expect(screen.getByText('teachInputTooShort')).toBeInTheDocument();
  });

  it('Teach button expands inline textarea for the gap', () => {
    queryMocks.set('agent.supportKnowledgeGaps', {
      data: [{ intent: 'pricing', sampleQuestion: 'How much does it cost?', count: 3 }],
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    render(createElement(KnowledgePage));

    const teachBtn = screen.getByRole('button', { name: 'gapTeachButton' });
    expect(screen.queryByPlaceholderText('gapTeachPlaceholder')).toBeNull();
    fireEvent.click(teachBtn);
    expect(screen.getByPlaceholderText('gapTeachPlaceholder')).toBeInTheDocument();
  });

  it('saving gap answer calls knowledge.ingest with title "Answer: [intent]"', () => {
    queryMocks.set('agent.supportKnowledgeGaps', {
      data: [{ intent: 'pricing', sampleQuestion: 'How much does it cost?', count: 3 }],
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    const mockMutate = vi.fn();
    mutationMocks.set('knowledge.ingest', {
      mutate: mockMutate, mutateAsync: vi.fn(), isPending: false, isError: false, error: null,
    });
    render(createElement(KnowledgePage));

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
});
