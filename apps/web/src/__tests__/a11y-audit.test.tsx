import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { createElement } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// next-intl: passthrough translation function
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
  useLocale: () => 'en',
}));

// next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-artifact-id' }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard/agents/test-artifact-id',
}));

// next/link — render as <a>
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) =>
    createElement('a', { href, ...props }, children),
}));

// Toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// tRPC mock helpers (same pattern as agent-workspace.test.ts)
const mockQueryResult = (data: unknown, overrides?: Partial<{ isLoading: boolean; isError: boolean; error: unknown }>) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  ...overrides,
});

const mockMutationResult = (overrides?: Partial<{ mutate: ReturnType<typeof vi.fn>; isPending: boolean }>) => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  ...overrides,
});

const queryMocks = new Map<string, ReturnType<typeof mockQueryResult>>();
const mutationMocks = new Map<string, ReturnType<typeof mockMutationResult>>();

function setQueryMock(path: string, data: unknown, overrides?: Parameters<typeof mockQueryResult>[1]) {
  queryMocks.set(path, mockQueryResult(data, overrides));
}

function setMutationMock(path: string, overrides?: Parameters<typeof mockMutationResult>[0]) {
  mutationMocks.set(path, mockMutationResult(overrides));
}

function buildNestedProxy(target: Record<string, unknown>, path: string[] = []): unknown {
  return new Proxy(target, {
    get(_, prop: string) {
      if (prop === 'useQuery') {
        const key = path.join('.');
        return () => queryMocks.get(key) ?? mockQueryResult(undefined, { isLoading: true });
      }
      if (prop === 'useMutation') {
        const key = path.join('.');
        return (opts?: {
          onMutate?: (vars: unknown) => unknown;
          onSuccess?: () => void;
          onError?: (err: unknown, vars: unknown, ctx: unknown) => void;
        }) => {
          const base = mutationMocks.get(key) ?? mockMutationResult();
          const baseMutate = base.mutate as (vars: unknown) => void;
          return {
            ...base,
            mutate: (vars: unknown) => {
              void opts?.onMutate?.(vars);
              baseMutate(vars);
            },
          };
        };
      }
      if (prop === 'useUtils') {
        return () => new Proxy({}, {
          get(_, ns: string) {
            return new Proxy({}, {
              get(_, resource: string) {
                return new Proxy({}, {
                  get(_, method: string) {
                    return vi.fn();
                  },
                });
              },
            });
          },
        });
      }
      return buildNestedProxy({}, [...path, prop]);
    },
  });
}

vi.mock('@/lib/trpc', () => ({
  trpc: buildNestedProxy({}, []),
}));

// ---------------------------------------------------------------------------
// Sheet a11y
// ---------------------------------------------------------------------------

describe('Sheet a11y', () => {
  it('panel has role="dialog"', async () => {
    const { Sheet } = await import('@/components/ui/sheet');
    const { container } = render(createElement(Sheet, {
      open: true,
      onClose: vi.fn(),
      children: createElement('div', null, 'content'),
    }));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('panel has aria-modal="true"', async () => {
    const { Sheet } = await import('@/components/ui/sheet');
    const { container } = render(createElement(Sheet, {
      open: true,
      onClose: vi.fn(),
      children: createElement('div', null, 'content'),
    }));
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
  });

  it('Escape fires onClose', async () => {
    const onClose = vi.fn();
    const { Sheet } = await import('@/components/ui/sheet');
    render(createElement(Sheet, {
      open: true,
      onClose,
      children: createElement('div', null, 'content'),
    }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ModuleSettings a11y
// ---------------------------------------------------------------------------

describe('ModuleSettings a11y', () => {
  beforeEach(() => {
    queryMocks.clear();
    mutationMocks.clear();
  });

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

  it('expand button has aria-expanded and aria-controls', async () => {
    setMutationMock('artifact.attachModule');
    const { ModuleSettings } = await import('@/components/agent-workspace/module-settings');
    render(createElement(ModuleSettings as any, {
      artifactId: 'art-1',
      boundModules: sampleModules,
    }));
    const btn = screen.getByRole('button', { name: 'moduleSettings' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe('module-settings-panel');
  });

  it('autonomy toggle is rendered as a checkbox switch', async () => {
    setMutationMock('artifact.attachModule');
    const { ModuleSettings } = await import('@/components/agent-workspace/module-settings');
    render(createElement(ModuleSettings as any, {
      artifactId: 'art-1',
      boundModules: sampleModules,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'moduleSettings' }));
    const toggle = screen.getByRole('switch');
    expect(toggle.tagName).toBe('INPUT');
  });

  it('save button has type="button"', async () => {
    setMutationMock('artifact.attachModule');
    const { ModuleSettings } = await import('@/components/agent-workspace/module-settings');
    render(createElement(ModuleSettings as any, {
      artifactId: 'art-1',
      boundModules: sampleModules,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'moduleSettings' }));
    const saveBtn = screen.getByRole('button', { name: 'saveSettings' }) as HTMLButtonElement;
    expect(saveBtn.type).toBe('button');
  });
});

// ---------------------------------------------------------------------------
// BarChartCss a11y
// ---------------------------------------------------------------------------

describe('BarChartCss a11y', () => {
  it('container has role="list"', async () => {
    const { BarChartCss } = await import('@/components/agent-workspace/primitives/bar-chart-css');
    const { container } = render(createElement(BarChartCss, {
      bars: [{ label: 'Web Chat', value: 5 }],
    }));
    expect(container.querySelector('[role="list"]')).not.toBeNull();
  });

  it('each bar row has role="listitem" with aria-label containing label and value', async () => {
    const { BarChartCss } = await import('@/components/agent-workspace/primitives/bar-chart-css');
    const { container } = render(createElement(BarChartCss, {
      bars: [
        { label: 'Web Chat', value: 10 },
        { label: 'WhatsApp', value: 5 },
      ],
    }));
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('aria-label')).toBe('Web Chat: 10');
    expect(items[1].getAttribute('aria-label')).toBe('WhatsApp: 5');
  });

  it('ariaLabel prop applied to container', async () => {
    const { BarChartCss } = await import('@/components/agent-workspace/primitives/bar-chart-css');
    const { container } = render(createElement(BarChartCss, {
      bars: [{ label: 'Source', value: 3 }],
      ariaLabel: 'Source Breakdown',
    }));
    const list = container.querySelector('[role="list"]');
    expect(list?.getAttribute('aria-label')).toBe('Source Breakdown');
  });
});
