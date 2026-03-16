import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// next-intl: passthrough translation function
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

// next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-artifact-id' }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard/agents/test-artifact-id',
}));

// Toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// tRPC mock — expose attachModuleSpy via artifact.attachModule.useMutation
const attachModuleSpy = vi.fn();

vi.mock('@/lib/trpc', () => {
  function buildNestedProxy(target: Record<string, unknown>, path: string[] = []): unknown {
    return new Proxy(target, {
      get(_, prop: string) {
        if (prop === 'useMutation') {
          const key = path.join('.');
          if (key === 'artifact.attachModule') {
            return () => ({
              mutate: attachModuleSpy,
              mutateAsync: vi.fn(),
              isPending: false,
              isError: false,
              error: null,
            });
          }
          return () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null });
        }
        if (prop === 'useUtils') {
          return () => new Proxy({}, {
            get: () => new Proxy({}, {
              get: () => new Proxy({}, { get: () => vi.fn() }),
            }),
          });
        }
        return buildNestedProxy({}, [...path, prop]);
      },
    });
  }
  return { trpc: buildNestedProxy({}, []) };
});

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const sampleModule = {
  id: 'bind-1',
  moduleId: 'mod-book-meeting',
  slug: 'book_meeting',
  name: 'Book Meeting',
  autonomyLevel: 'draft_and_approve',
  configOverrides: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModuleSettings — autonomy toggle', () => {
  beforeEach(() => {
    attachModuleSpy.mockClear();
    vi.resetModules();
  });

  it('Toggle ON → calls attachModule with fully_autonomous', async () => {
    const { ModuleSettings } = await import('@/components/agent-workspace/module-settings');
    render(createElement(ModuleSettings as any, {
      artifactId: 'art-1',
      boundModules: [{ ...sampleModule, autonomyLevel: 'draft_and_approve' }],
    }));

    // Expand panel
    fireEvent.click(screen.getByRole('button', { name: 'moduleSettings' }));

    const checkbox = screen.getByRole('switch');
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);

    expect(attachModuleSpy).toHaveBeenCalled();
    expect(attachModuleSpy.mock.calls[0][0].autonomyLevel).toBe('fully_autonomous');
  });

  it('Toggle OFF → calls attachModule with draft_and_approve', async () => {
    const { ModuleSettings } = await import('@/components/agent-workspace/module-settings');
    render(createElement(ModuleSettings as any, {
      artifactId: 'art-1',
      boundModules: [{ ...sampleModule, autonomyLevel: 'fully_autonomous' }],
    }));

    // Expand panel
    fireEvent.click(screen.getByRole('button', { name: 'moduleSettings' }));

    const checkbox = screen.getByRole('switch');
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    fireEvent.click(checkbox);

    expect(attachModuleSpy).toHaveBeenCalled();
    expect(attachModuleSpy.mock.calls[0][0].autonomyLevel).toBe('draft_and_approve');
  });

  it('Toggle rolls back to previous state on mutation failure', async () => {
    attachModuleSpy.mockImplementationOnce((_input: unknown, callbacks: { onError?: () => void }) => {
      callbacks?.onError?.();
    });

    const { ModuleSettings } = await import('@/components/agent-workspace/module-settings');
    render(createElement(ModuleSettings as any, {
      artifactId: 'art-1',
      boundModules: [{ ...sampleModule, autonomyLevel: 'draft_and_approve' }],
    }));

    fireEvent.click(screen.getByRole('button', { name: 'moduleSettings' }));

    const checkbox = screen.getByRole('switch');
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);

    // Mutation failed → toggle should roll back to OFF
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it('suggest_only normalized to OFF (draft_and_approve) on render', async () => {
    const { ModuleSettings } = await import('@/components/agent-workspace/module-settings');
    render(createElement(ModuleSettings as any, {
      artifactId: 'art-1',
      boundModules: [{ ...sampleModule, autonomyLevel: 'suggest_only' }],
    }));

    // Expand panel
    fireEvent.click(screen.getByRole('button', { name: 'moduleSettings' }));

    const checkbox = screen.getByRole('switch');
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });
});
