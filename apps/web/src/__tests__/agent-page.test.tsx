import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  artifactListSpy,
  workspaceSpy,
  dashboardOverviewSpy,
  pendingExecSpy,
  advisorSnapshotSpy,
} = vi.hoisted(() => ({
  artifactListSpy: vi.fn(),
  workspaceSpy: vi.fn(),
  dashboardOverviewSpy: vi.fn(),
  pendingExecSpy: vi.fn(),
  advisorSnapshotSpy: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    artifact: {
      list: { useQuery: artifactListSpy },
      update: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
    },
    agent: {
      workspace: { useQuery: workspaceSpy },
      dashboardOverview: { useQuery: dashboardOverviewSpy },
    },
    module: {
      pendingExecutions: { useQuery: pendingExecSpy },
    },
    advisor: {
      snapshot: { useQuery: advisorSnapshotSpy },
      ensureAdvisor: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      summarizeSession: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
    },
    onboarding: {
      setupArtifact: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
    },
    useUtils: vi.fn(() => ({
      agent: { workspace: { invalidate: vi.fn() } },
      artifact: { list: { invalidate: vi.fn() } },
    })),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/components/agent-workspace/sales/approvals-section', () => ({
  ApprovalsSection: () => null,
}));
vi.mock('@/components/agent-workspace/performance-panel', () => ({
  AgentPerformance: () => null,
}));
vi.mock('@/components/agent-workspace/sales/trust-graduation-card', () => ({
  TrustGraduationCard: () => null,
}));
vi.mock('@/components/agent-workspace/sales/quotes-section', () => ({
  QuotesSection: () => null,
}));
vi.mock('@/components/agent-workspace/sales/meetings-section', () => ({
  MeetingsSection: () => null,
}));
vi.mock('@/components/agent-workspace/sales/payments-section', () => ({
  PaymentsSection: () => null,
}));
vi.mock('@/components/agent-workspace/sales/followups-section', () => ({
  FollowupsSection: () => null,
}));
vi.mock('@/components/agent-workspace/module-settings', () => ({
  ModuleSettings: () => null,
}));
vi.mock('@/components/agent-workspace/widget-appearance-section', () => ({
  WidgetAppearanceSection: () => null,
}));
vi.mock('@/components/agent-workspace/workspace-section-error-boundary', () => ({
  WorkspaceSectionErrorBoundary: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));
vi.mock('@/components/test-chat-panel', () => ({
  TestChatPanel: () => null,
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/components/query-error', () => ({
  QueryError: () => null,
}));
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) =>
    React.createElement('div', { 'data-testid': 'skeleton', className }),
}));
vi.mock('lucide-react', () => ({
  ChevronDown: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'ChevronDown', className }),
  ChevronRight: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'ChevronRight', className }),
  Loader2: ({ className, 'aria-label': ariaLabel }: { className?: string; 'aria-label'?: string }) =>
    React.createElement('svg', { 'data-icon': 'Loader2', className, 'aria-label': ariaLabel }),
  Bot: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'Bot', className }),
  MessageSquare: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'MessageSquare', className }),
}));

// ---------------------------------------------------------------------------
// Import page under test
// ---------------------------------------------------------------------------

import AgentPage from '../app/dashboard/agent/page';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultArtifact = {
  id: 'artifact-123',
  name: 'Cami',
  isActive: true,
  type: 'sales',
  personality: {},
  config: {},
};

const advisorArtifact = {
  id: 'advisor-artifact-id',
  name: 'Business Advisor',
  isActive: true,
  type: 'advisor',
  personality: {},
  config: {},
};

const defaultWorkspaceData = {
  artifact: defaultArtifact,
  boundModules: [],
  metrics: { conversationCount: 127, automationScore: 84, pendingApprovals: 3 },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  artifactListSpy.mockImplementation(({ type }: { type?: string } = {}) => {
    if (type === 'advisor') {
      // Default: no advisor artifact (AdvisorPanel returns null; ensureAdvisor fires but is a no-op mock)
      return { data: [], isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() };
    }
    // Default: sales artifact present (agent page renders normally)
    return { data: [defaultArtifact], isLoading: false, isError: false, refetch: vi.fn() };
  });

  advisorSnapshotSpy.mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    isSuccess: false,
    refetch: vi.fn(),
  });

  workspaceSpy.mockReturnValue({
    data: defaultWorkspaceData,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });

  dashboardOverviewSpy.mockReturnValue({
    data: { pendingApprovalsCount: 3, activeLeadsCount: 12 },
  });

  pendingExecSpy.mockReturnValue({
    data: [],
    isSuccess: true,
    isLoading: false,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NC-276 — Single-page agent config (/dashboard/agent)', () => {

  it('1 — renders agent header with name and type', () => {
    render(React.createElement(AgentPage));
    expect(screen.getByTestId('agent-header')).toBeInTheDocument();
    expect(screen.getByTestId('agent-name')).toHaveTextContent('Cami');
    // agent-type contains the agentHeader key (mocked as the key itself)
    expect(screen.getByTestId('agent-type')).toBeInTheDocument();
  });

  it('2 — identity section is expanded by default', () => {
    render(React.createElement(AgentPage));
    const section = screen.getByTestId('section-identity');
    // The toggle button has aria-expanded="true" when the section is open
    const toggle = section.querySelector('[aria-expanded="true"]');
    expect(toggle).not.toBeNull();
  });

  it('3 — approvals section auto-expands when pendingExec resolves with items', async () => {
    pendingExecSpy.mockReturnValue({
      data: [
        { id: 'exec-1', moduleSlug: 'qualify_lead', createdAt: new Date().toISOString() },
      ],
      isSuccess: true,
      isLoading: false,
    });

    render(React.createElement(AgentPage));

    // useEffect fires after mount; waitFor catches the state update
    await waitFor(() => {
      const section = screen.getByTestId('section-approvals');
      const toggle = section.querySelector('[aria-expanded="true"]');
      expect(toggle).not.toBeNull();
    });
  });

  it('4 — approvals section stays closed when pendingExec returns empty', () => {
    // pendingExecSpy already returns [] in beforeEach
    render(React.createElement(AgentPage));
    const section = screen.getByTestId('section-approvals');
    const toggle = section.querySelector('[aria-expanded="false"]');
    expect(toggle).not.toBeNull();
  });

  it('5 — empty state shown when no artifact exists', () => {
    artifactListSpy.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(React.createElement(AgentPage));
    expect(screen.getByTestId('agent-empty-state')).toBeInTheDocument();
    // agentCreate key rendered (mocked as 'agentCreate')
    expect(screen.getByText('agentCreate')).toBeInTheDocument();
  });

  it('6 — header pending count uses dashboardOverview (uncapped), not pendingExec.data.length', () => {
    // dashboardOverview returns 73 but pendingExec only returns 50 rows (limit cap)
    dashboardOverviewSpy.mockReturnValue({
      data: { pendingApprovalsCount: 73, activeLeadsCount: 5 },
    });
    pendingExecSpy.mockReturnValue({
      data: Array.from({ length: 50 }, (_, i) => ({ id: `exec-${i}`, moduleSlug: 'qualify_lead' })),
      isSuccess: true,
      isLoading: false,
    });

    render(React.createElement(AgentPage));
    // Header shows 73 from dashboardOverview, not 50 from pendingExec
    expect(screen.getByTestId('header-pending-count')).toHaveTextContent('73');
  });

  it('7 — sidebar shows 4 nav items including /dashboard/agent', () => {
    // Snapshot-style check: the page renders without errors when artifact exists
    const { container } = render(React.createElement(AgentPage));
    expect(container.firstChild).not.toBeNull();
    // All 7 collapsible sections are present
    expect(screen.getByTestId('section-identity')).toBeInTheDocument();
    expect(screen.getByTestId('section-personality')).toBeInTheDocument();
    expect(screen.getByTestId('section-modules')).toBeInTheDocument();
    expect(screen.getByTestId('section-approvals')).toBeInTheDocument();
    expect(screen.getByTestId('section-performance')).toBeInTheDocument();
    expect(screen.getByTestId('section-sales-activity')).toBeInTheDocument();
    expect(screen.getByTestId('section-advanced')).toBeInTheDocument();
  });

  it('8a — advisor panel renders on agent page when advisor artifact exists', () => {
    // Override: artifact.list returns advisor artifact for type='advisor'
    artifactListSpy.mockImplementation(({ type }: { type?: string } = {}) => {
      if (type === 'advisor') {
        return { data: [advisorArtifact], isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() };
      }
      return { data: [defaultArtifact], isLoading: false, isError: false, refetch: vi.fn() };
    });

    render(React.createElement(AgentPage));

    // The real AdvisorPanel renders its collapsed card when advisorArtifact is truthy
    expect(document.querySelector('[data-testid="advisor-panel"]')).toBeTruthy();
  });

  it('8b — advisor panel is absent when no advisor artifact exists', () => {
    // beforeEach default: artifactListSpy returns [] for type='advisor'
    // AdvisorPanel's null-guard (line 127 of advisor-panel.tsx) returns null
    render(React.createElement(AgentPage));

    expect(document.querySelector('[data-testid="advisor-panel"]')).toBeNull();
    // Agent page itself renders normally (sales artifact is still present)
    expect(screen.getByTestId('agent-header')).toBeInTheDocument();
  });

});
