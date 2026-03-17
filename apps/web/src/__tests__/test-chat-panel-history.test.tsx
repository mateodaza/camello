import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('lucide-react', () =>
  new Proxy({} as Record<string, unknown>, {
    get: (_t, prop: string) =>
      ({ className }: { className?: string }) =>
        React.createElement('svg', { 'data-icon': prop, className }),
  }),
);

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', props, children),
}));

vi.mock('@/components/simple-markdown', () => ({
  SimpleMarkdown: ({ text }: { text: string }) => React.createElement('span', {}, text),
}));

// ---------------------------------------------------------------------------
// tRPC mock setup
// ---------------------------------------------------------------------------

type QueryResult = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
  refetch: ReturnType<typeof vi.fn>;
};

const queryMocks = new Map<string, QueryResult>();

function mockQueryResult(data: unknown, overrides?: Partial<QueryResult>): QueryResult {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: data !== undefined,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

function buildNestedProxy(path: string[] = []): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_, prop: string) {
      if (prop === 'useQuery') {
        const key = path.join('.');
        return () => queryMocks.get(key) ?? mockQueryResult(undefined, { isLoading: true });
      }
      if (prop === 'useMutation') {
        return () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null });
      }
      if (prop === 'useUtils') {
        return () => new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn() }) });
      }
      return buildNestedProxy([...path, prop]);
    },
  });
}

vi.mock('@/lib/trpc', () => ({
  trpc: buildNestedProxy([]),
}));

import { TestChatPanel } from '../components/test-chat-panel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(role: string, content: string, id = Math.random().toString()) {
  return {
    id,
    conversationId: 'conv-1',
    tenantId: 'tenant-1',
    role,
    content,
    metadata: {},
    createdAt: new Date(),
  };
}

const DEFAULT_PROPS = {
  artifactId: 'art-1',
  artifactName: 'Advisor',
  artifactType: 'advisor',
  open: true,
  onClose: vi.fn(),
};

beforeEach(() => {
  queryMocks.clear();
  vi.clearAllMocks();
  queryMocks.set('conversation.messages', mockQueryResult([]));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TestChatPanel — history loading', () => {
  it('renders customer and artifact messages when initialConversationId is set', () => {
    // Mock returns DESC order (newest first), component reverses to ASC
    queryMocks.set('conversation.messages', mockQueryResult([
      makeMsg('artifact', 'Hello from advisor'),
      makeMsg('customer', 'What are my sales?'),
    ]));

    render(
      React.createElement(TestChatPanel, {
        ...DEFAULT_PROPS,
        initialConversationId: 'conv-1',
      }),
    );

    expect(screen.getByText('What are my sales?')).toBeInTheDocument();
    expect(screen.getByText('Hello from advisor')).toBeInTheDocument();
  });

  it('filters out system and human messages from history', () => {
    queryMocks.set('conversation.messages', mockQueryResult([
      makeMsg('system',   'System context — should be hidden'),
      makeMsg('human',    'Human override — should be hidden'),
      makeMsg('customer', 'Visible user message'),
      makeMsg('artifact', 'Visible advisor reply'),
    ]));

    render(
      React.createElement(TestChatPanel, {
        ...DEFAULT_PROPS,
        initialConversationId: 'conv-1',
      }),
    );

    expect(screen.getByText('Visible user message')).toBeInTheDocument();
    expect(screen.getByText('Visible advisor reply')).toBeInTheDocument();
    expect(screen.queryByText('System context — should be hidden')).not.toBeInTheDocument();
    expect(screen.queryByText('Human override — should be hidden')).not.toBeInTheDocument();
  });

  it('does not render history messages when initialConversationId is not set', () => {
    queryMocks.set('conversation.messages', mockQueryResult([
      makeMsg('customer', 'Should not appear'),
    ]));

    render(
      React.createElement(TestChatPanel, {
        ...DEFAULT_PROPS,
        // no initialConversationId
      }),
    );

    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
  });
});
