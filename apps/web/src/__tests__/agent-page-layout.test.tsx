/**
 * agent-page-layout.test.tsx
 *
 * Component rendering tests for the NC-285 split-pane layout.
 *
 * AgentPage uses useState(false) for isDesktop (SSR-safe).
 * A useEffect reads window.matchMedia on mount and sets the correct value.
 *
 * Because we mock matchMedia BEFORE render() and wrap render in
 * `await act(async () => {...})`, the effect fires and the correct
 * isDesktop value is committed before assertions run.
 *
 * - Desktop mode: right column (desktop-test-chat) present, mobile button absent.
 * - Mobile mode: mobile button (mobile-test-chat-btn) present, right column absent.
 *
 * These tests fail if page.tsx renders both elements unconditionally
 * or if the useEffect is missing.
 */

import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// ── Hoisted mock declarations ────────────────────────────────────────────────
const mockAddToast = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());
const mockInvalidate = vi.hoisted(() => vi.fn());

// ── matchMedia mock helper ───────────────────────────────────────────────────
// Called BEFORE render() so the useEffect reads mql.matches on mount.
// act() ensures the effect fires and state updates are flushed before assertions.
function mockMatchMedia(isDesktop: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const mql = {
    matches: isDesktop,
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.push(fn),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => mql),
  });
  return mql;
}

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    artifact: {
      list: {
        useQuery: () => ({
          data: [{ id: 'art-1', name: 'Sales Bot', type: 'sales', isActive: true }],
          isLoading: false,
          isError: false,
        }),
      },
      update: { useMutation: () => ({ mutate: mockMutate, isPending: false }) },
    },
    agent: {
      workspace: {
        useQuery: () => ({
          data: {
            artifact: { id: 'art-1', name: 'Sales Bot', type: 'sales', isActive: true, personality: {}, config: {} },
            metrics: null,
            boundModules: [],
          },
          isLoading: false,
        }),
      },
      dashboardOverview: {
        useQuery: () => ({ data: { pendingApprovalsCount: 0, activeLeadsCount: 0 } }),
      },
      salesActivityCounts: {
        useQuery: () => ({ data: { total: 5 }, isSuccess: true }),
      },
    },
    tenant: {
      me: { useQuery: () => ({ data: { slug: 'test-slug' }, isLoading: false }) },
    },
    module: {
      pendingExecutions: { useQuery: () => ({ data: [], isSuccess: true }) },
    },
    onboarding: {
      setupArtifact: { useMutation: () => ({ mutate: mockMutate, isPending: false }) },
      ensurePreviewCustomer: { useMutation: () => ({ mutate: mockMutate }) },
    },
    chat: {
      send: { useMutation: () => ({ mutate: mockMutate, isPending: false, isError: false }) },
    },
    useUtils: () => ({
      agent: { workspace: { invalidate: mockInvalidate } },
      artifact: { list: { invalidate: mockInvalidate } },
    }),
  },
}));

vi.mock('@/components/agent-workspace/module-settings', () => ({
  ModuleSettings: () => <div data-testid="module-settings" />,
}));
vi.mock('@/components/agent-workspace/widget-appearance-section', () => ({
  WidgetAppearanceSection: () => <div data-testid="widget-appearance" />,
}));
vi.mock('@/components/agent-workspace/sales/approvals-section', () => ({
  ApprovalsSection: () => <div />,
}));
vi.mock('@/components/agent-workspace/performance-panel', () => ({
  AgentPerformance: () => <div />,
}));
vi.mock('@/components/agent-workspace/sales/trust-graduation-card', () => ({
  TrustGraduationCard: () => <div />,
}));
vi.mock('@/components/agent-workspace/sales/quotes-section', () => ({
  QuotesSection: () => <div />,
}));
vi.mock('@/components/agent-workspace/sales/meetings-section', () => ({
  MeetingsSection: () => <div />,
}));
vi.mock('@/components/agent-workspace/sales/payments-section', () => ({
  PaymentsSection: () => <div />,
}));
vi.mock('@/components/agent-workspace/sales/followups-section', () => ({
  FollowupsSection: () => <div />,
}));
vi.mock('@/components/dashboard/advisor-panel', () => ({
  AdvisorPanel: () => <div />,
}));
vi.mock('@/components/agent-workspace/workspace-section-error-boundary', () => ({
  WorkspaceSectionErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Tests ────────────────────────────────────────────────────────────────────
import AgentPage from '@/app/dashboard/agent/page';

describe('AgentPage split-pane layout (NC-285)', () => {
  beforeAll(() => {
    // JSDOM does not implement scrollIntoView; stub it so TestChatPanel's
    // messagesEndRef scroll effect does not throw when rendered inline.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('desktop: renders right chat column; mobile sticky bar is absent', async () => {
    // Mock BEFORE render so the useEffect reads mql.matches = true on mount.
    // act() flushes the effect + re-render before assertions.
    mockMatchMedia(true); // simulate desktop ≥1024px
    await act(async () => {
      render(<AgentPage />);
    });
    // Desktop chat column must be in DOM after effect fires
    expect(screen.getByTestId('desktop-test-chat')).toBeInTheDocument();
    // Mobile sticky bar must NOT be rendered (JS-conditional, not just CSS-hidden)
    expect(screen.queryByTestId('mobile-test-chat-btn')).not.toBeInTheDocument();
  });

  it('mobile: renders sticky bottom button; desktop chat column is absent', async () => {
    // mql.matches = false → isDesktop stays false after effect fires.
    mockMatchMedia(false); // simulate mobile <1024px
    await act(async () => {
      render(<AgentPage />);
    });
    // Mobile button must be in DOM
    expect(screen.getByTestId('mobile-test-chat-btn')).toBeInTheDocument();
    // Desktop chat column must NOT be rendered (JS-conditional, not just CSS-hidden)
    expect(screen.queryByTestId('desktop-test-chat')).not.toBeInTheDocument();
  });
});
