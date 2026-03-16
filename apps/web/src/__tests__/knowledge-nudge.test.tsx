import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { useTranslations } from 'next-intl';

// ---------------------------------------------------------------------------
// vi.hoisted — must come before vi.mock factories that reference these vars
// ---------------------------------------------------------------------------

const {
  mockSufficiencyScore,
  mockArtifactList,
  mockTenantMe,
  mockDashboardOverview,
  mockActivityFeed,
  mockUpdateName,
  mockGetStatus,
} = vi.hoisted(() => ({
  mockSufficiencyScore: vi.fn(),
  mockArtifactList: vi.fn(),
  mockTenantMe: vi.fn(),
  mockDashboardOverview: vi.fn(),
  mockActivityFeed: vi.fn(),
  mockUpdateName: vi.fn(),
  mockGetStatus: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    knowledge: {
      sufficiencyScore: { useQuery: mockSufficiencyScore },
    },
    artifact: {
      list: { useQuery: mockArtifactList },
    },
    tenant: {
      me: { useQuery: mockTenantMe },
      updateName: { useMutation: mockUpdateName },
    },
    agent: {
      dashboardOverview: { useQuery: mockDashboardOverview },
      dashboardActivityFeed: { useQuery: mockActivityFeed },
    },
    onboarding: {
      getStatus: { useQuery: mockGetStatus },
    },
  },
}));

vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({ organization: null }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: {
    href: string; children: React.ReactNode; className?: string;
  }) => React.createElement('a', { href, className }, children),
}));

vi.mock('lucide-react', () =>
  new Proxy({}, {
    get: (_t: object, prop: string) =>
      ({ className }: { className?: string }) =>
        React.createElement('svg', { 'data-icon': prop, className }),
  }),
);

vi.mock('@/lib/format', () => ({
  fmtDateTime: () => 'Jan 1, 2026',
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { KnowledgeBanner } from '@/components/dashboard/knowledge-banner';
import { KnowledgeGuidedEmptyState } from '@/components/dashboard/knowledge-guided-empty-state';

// ---------------------------------------------------------------------------
// Default mock implementations (overridden per-test as needed)
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockTenantMe.mockReturnValue({
    data: { name: 'Test Co', slug: null, planTier: null },
    isLoading: false, isError: false, refetch: vi.fn(),
  });
  mockDashboardOverview.mockReturnValue({
    data: null, isLoading: false, isError: false, refetch: vi.fn(),
  });
  mockActivityFeed.mockReturnValue({
    data: null, isLoading: false, isError: false, refetch: vi.fn(),
  });
  mockUpdateName.mockReturnValue({ mutate: vi.fn(), isPending: false });
  // Default: onboarding complete → banner hidden
  mockGetStatus.mockReturnValue({
    data: { settings: { onboardingComplete: true }, previewCustomerId: null, tenantName: 'Test Co' },
    isLoading: false,
  });
  // Default: one active agent
  mockArtifactList.mockReturnValue({
    data: [{ id: 'a1', name: 'Aria', isActive: true, type: 'sales' }],
    isLoading: false, isError: false, refetch: vi.fn(),
  });
  // Default: score=80 → banner hidden
  mockSufficiencyScore.mockReturnValue({
    data: { score: 80, signals: [], docCount: 5, gapCount: 0 },
    isLoading: false,
  });
});

// ---------------------------------------------------------------------------
// KnowledgeBanner — isolated component tests
// ---------------------------------------------------------------------------

describe('KnowledgeBanner', () => {
  const mockT = ((k: string, values?: Record<string, unknown>) =>
    values?.name ? String(values.name) : k
  ) as unknown as ReturnType<typeof useTranslations<'dashboard'>>;

  it('1 — renders agent name', () => {
    render(
      React.createElement(KnowledgeBanner, {
        agentName: 'Aria',
        score: 45,
        topSignal: 'No website connected',
        t: mockT,
      }),
    );
    expect(screen.getByText(/Aria/)).toBeInTheDocument();
  });

  it('2 — renders action link to knowledge base', () => {
    render(
      React.createElement(KnowledgeBanner, {
        agentName: 'Aria',
        score: 45,
        topSignal: 'No website connected',
        t: mockT,
      }),
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/dashboard/knowledge');
    expect(link.textContent).toBe('knowledgeScoreAddCta');
  });
});

// ---------------------------------------------------------------------------
// KnowledgeGuidedEmptyState — isolated component tests
// ---------------------------------------------------------------------------

describe('KnowledgeGuidedEmptyState', () => {
  it('3 — renders 3 action buttons and fires correct type', () => {
    const onAddType = vi.fn();
    render(
      React.createElement(KnowledgeGuidedEmptyState, {
        onAddType,
        t: (k: string) => k,
      }),
    );

    // All 3 action buttons present
    expect(screen.getByRole('button', { name: 'guidedUrlAction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'guidedDocAction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'guidedFactsAction' })).toBeInTheDocument();

    // URL card fires 'url'
    fireEvent.click(screen.getByRole('button', { name: 'guidedUrlAction' }));
    expect(onAddType).toHaveBeenCalledWith('url');

    // Doc card fires 'upload'
    fireEvent.click(screen.getByRole('button', { name: 'guidedDocAction' }));
    expect(onAddType).toHaveBeenCalledWith('upload');
  });
});

// DashboardOverview tests removed — /dashboard is now a server-side redirect.
// Knowledge banner + onboarding banner moved to conversations page.
