import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { createElement } from 'react';
import messages from '../../messages/en.json';
import { useTranslations } from 'next-intl';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(),
  useLocale: () => 'en',
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-artifact-id' }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard/agents/test-artifact-id',
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// tRPC proxy — function declaration so JS function-hoisting makes it available
// inside the vi.mock('@/lib/trpc') factory below.
function buildNestedProxy(target: Record<string, unknown>, path: string[] = []): unknown {
  return new Proxy(target, {
    get(_, prop: string) {
      if (prop === 'useMutation') {
        return () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null });
      }
      if (prop === 'useUtils') {
        return () => new Proxy({}, { get: () => new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn() }) }) });
      }
      return buildNestedProxy({}, [...path, prop]);
    },
  });
}

vi.mock('@/lib/trpc', () => ({
  trpc: buildNestedProxy({}, []),
}));

// ---------------------------------------------------------------------------
// Test 1 — JSON value assertions (fast, no render)
// ---------------------------------------------------------------------------

describe('Terminology audit — en.json values', () => {
  it('agent namespace: agentModules renamed to Skills & Approvals', () => {
    expect((messages as any).agent.agentModules).toBe('Skills & Approvals');
  });

  it('agentWorkspace namespace: all developer terms replaced', () => {
    const ws = (messages as any).agentWorkspace;
    expect(ws.autonomyLevel).toBe('Approval Mode');           // AC required
    expect(ws.autonomyFullyAutonomous).toBe('Automatic');
    expect(ws.autonomyDraftAndApprove).toBe('Review First');
    expect(ws.autonomySuggestOnly).toBe('Manual');
    expect(ws.boundModules).toBe('Skills');
    expect(ws.moduleSettings).toBe('Skill Settings');
    expect(ws.configKnowledgeGapsTitle).toBe('Unanswered Questions');  // AC required
    expect(ws.performanceModuleUsage).toBe('Runs (all time)');
    expect(ws.performanceModuleUsageTitle).toBe('Skill Usage');
    expect(ws.trustGoToModules).toBe('Configure Skills');
    expect(ws.trustEmpty).toBe('No skills configured yet');
    expect(ws.riskTierLow).toBe('Low sensitivity');
    expect(ws.riskTierMedium).toBe('Medium sensitivity');
    expect(ws.riskTierHigh).toBe('High sensitivity');
    expect(ws.metricTotal).toBe('Times Used');
  });

  it('knowledge namespace: sectionGaps renamed to Unanswered Questions', () => {
    expect((messages as any).knowledge.sectionGaps).toBe('Unanswered Questions');
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Render: ModuleSettings renders "Approval Mode" label (AC-required)
// ---------------------------------------------------------------------------

describe('ModuleSettings — Approval Mode label renders', () => {
  const sampleModules = [
    {
      id: 'bind-1',
      moduleId: 'mod-book-meeting',
      slug: 'book_meeting',
      name: 'Book Meeting',
      autonomyLevel: 'fully_autonomous',
      configOverrides: { calendarUrl: '' },
    },
  ];

  beforeEach(() => {
    const ws = (messages as unknown as Record<string, Record<string, string>>).agentWorkspace;
    vi.mocked(useTranslations).mockImplementation((ns?: string) => {
      if (ns === 'agentWorkspace') return ((key: string) => ws[key] ?? key) as any;
      return ((key: string) => key) as any;
    });
  });

  it("renders toggle label from t('autoToggleLabel')", async () => {
    const { ModuleSettings } = await import('@/components/agent-workspace/module-settings');
    render(createElement(ModuleSettings as any, {
      artifactId: 'art-1',
      boundModules: sampleModules,
    }));

    // Expand the panel — button now says "Skill Settings" (from real en.json)
    fireEvent.click(screen.getByRole('button', { name: 'Skill Settings' }));

    expect(screen.getByText('Agent handles this automatically')).toBeInTheDocument();
  });
});
