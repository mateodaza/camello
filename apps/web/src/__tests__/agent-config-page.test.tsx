import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { workspaceQuerySpy } = vi.hoisted(() => ({
  workspaceQuerySpy: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    agent: {
      workspace: {
        useQuery: workspaceQuerySpy,
      },
    },
    knowledge: {
      list: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
    },
    artifact: {
      update: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
    },
    useUtils: vi.fn(() => ({
      agent: { workspace: { invalidate: vi.fn() } },
    })),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: {
    href: string; children: React.ReactNode; className?: string;
  }) => React.createElement('a', { href, className }, children),
}));

vi.mock('lucide-react', () =>
  new Proxy({} as Record<string, unknown>, {
    get: (_t, prop: string) =>
      ({ className }: { className?: string }) =>
        React.createElement('svg', { 'data-icon': prop, className }),
  }),
);

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-id' }),
}));

// Mock all sub-components that make their own tRPC calls
vi.mock('@/components/agent-workspace/sales/trust-graduation-card', () => ({
  TrustGraduationCard: () => null,
}));

vi.mock('@/components/agent-workspace/sales/approvals-section', () => ({
  ApprovalsSection: () => null,
}));

vi.mock('@/components/agent-workspace/performance-panel', () => ({
  AgentPerformance: () => null,
}));

vi.mock('@/components/agent-workspace/agent-activity', () => ({
  AgentActivity: () => null,
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

vi.mock('@/components/agent-workspace/agent-settings-panel', () => ({
  AgentSettingsPanel: () => null,
}));

vi.mock('@/components/agent-workspace/module-settings', () => ({
  ModuleSettings: () => null,
}));

vi.mock('@/components/agent-workspace/widget-appearance-section', () => ({
  WidgetAppearanceSection: () => null,
}));

vi.mock('@/components/agent-workspace/workspace-shell', () => ({
  WorkspaceShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@/components/agent-workspace/workspace-section-error-boundary', () => ({
  WorkspaceSectionErrorBoundary: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

import AgentConfigPage from '../app/dashboard/agents/[id]/page';

const defaultWorkspaceData = {
  artifact: {
    id: 'test-id',
    name: 'Aria',
    isActive: true,
    type: 'sales',
    personality: {},
    config: {},
  },
  boundModules: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  workspaceQuerySpy.mockReturnValue({
    data: defaultWorkspaceData,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NC-248 — Agent config page: dashboard tab as default + layout cleanup', () => {

  it('1 — Dashboard tab is the default active tab on mount', () => {
    render(React.createElement(AgentConfigPage));
    // The configure-agent-link is only rendered in the dashboard tab
    expect(screen.getByTestId('configure-agent-link')).toBeInTheDocument();
    // Setup-only content (configIdentityTitle key) is NOT shown
    expect(screen.queryByText('configIdentityTitle')).not.toBeInTheDocument();
  });

  it('2 — clicking "Configure agent" link switches to Setup tab', () => {
    render(React.createElement(AgentConfigPage));
    fireEvent.click(screen.getByTestId('configure-agent-link'));
    // After click: setup content appears
    expect(screen.getByText('configIdentityTitle')).toBeInTheDocument();
    // Dashboard content (configure-agent-link) is gone
    expect(screen.queryByTestId('configure-agent-link')).not.toBeInTheDocument();
  });

  it('3 — AgentActivity disclosure is collapsed by default', () => {
    render(React.createElement(AgentConfigPage));
    const details = screen.getByTestId('activity-log-disclosure');
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');
  });
});
