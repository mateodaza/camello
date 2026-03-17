import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { artifactListSpy } = vi.hoisted(() => ({
  artifactListSpy: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    artifact: {
      list: { useQuery: artifactListSpy },
    },
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}));

vi.mock('lucide-react', () => ({
  Bot: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'Bot', className }),
  BrainCircuit: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'BrainCircuit', className }),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => React.createElement('div', { 'data-testid': 'skeleton' }),
}));

vi.mock('@/components/query-error', () => ({
  QueryError: () => React.createElement('div', { 'data-testid': 'query-error' }),
}));

vi.mock('@/components/dashboard/empty-state', () => ({
  EmptyState: () => React.createElement('div', { 'data-testid': 'empty-state' }),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => (args as string[]).filter(Boolean).join(' '),
}));

// ---------------------------------------------------------------------------
// Import page under test
// ---------------------------------------------------------------------------

import AgentsIndexPage from '../app/dashboard/agents/page';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const salesArtifact = { id: 's1', name: 'Sales', type: 'sales', isActive: true };
const advisorArtifact = { id: 'a1', name: 'Advisor', type: 'advisor', isActive: true };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentsIndexPage (NC-291)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    artifactListSpy.mockReturnValue({
      data: [salesArtifact, advisorArtifact],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('renders 2 agent cards when data loaded', () => {
    render(<AgentsIndexPage />);
    expect(screen.getAllByTestId('agent-card')).toHaveLength(2);
  });

  it('sales card links to /dashboard/agent', () => {
    render(<AgentsIndexPage />);
    const links = screen.getAllByRole('link');
    const salesLink = links.find((l) => l.getAttribute('href') === '/dashboard/agent');
    expect(salesLink).toBeDefined();
  });

  it('advisor card links to /dashboard/agents/advisor', () => {
    render(<AgentsIndexPage />);
    const links = screen.getAllByRole('link');
    const advisorLink = links.find((l) => l.getAttribute('href') === '/dashboard/agents/advisor');
    expect(advisorLink).toBeDefined();
  });

  it('shows 2 skeleton cards while loading', () => {
    artifactListSpy.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AgentsIndexPage />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(2);
  });

  it('shows QueryError on error', () => {
    artifactListSpy.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('fail'),
      refetch: vi.fn(),
    });
    render(<AgentsIndexPage />);
    expect(screen.getByTestId('query-error')).toBeDefined();
  });

  it('shows EmptyState when data is empty', () => {
    artifactListSpy.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AgentsIndexPage />);
    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  it('both cards render even when only one artifact type returned', () => {
    artifactListSpy.mockReturnValue({
      data: [salesArtifact],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AgentsIndexPage />);
    expect(screen.getAllByTestId('agent-card')).toHaveLength(2);
  });
});
