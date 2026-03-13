import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import enMessages from '../../messages/en.json';
import esMessages from '../../messages/es.json';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { createMutateSpy, listQuerySpy } = vi.hoisted(() => ({
  createMutateSpy: vi.fn(),
  listQuerySpy: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    artifact: {
      list: {
        useQuery: listQuerySpy,
      },
      create: {
        useMutation: vi.fn(() => ({ mutate: createMutateSpy, isPending: false })),
      },
      update: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      listModules: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
    },
    analytics: {
      overview: {
        useQuery: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
      },
    },
    useUtils: vi.fn(() => ({
      artifact: { list: { invalidate: vi.fn() } },
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

vi.mock('@/components/test-chat-panel', () => ({
  TestChatPanel: () => null,
}));

import ArtifactsPage from '../app/dashboard/artifacts/page';

// Default: no artifacts; each test that needs artifacts overrides per-test.
beforeEach(() => {
  vi.clearAllMocks();
  listQuerySpy.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NC-247 — artifacts page: sales-only mode', () => {

  // Test 1: DOM rendering — badge span appears in the DOM for each disabled archetype.
  it('disabled cards render a "Coming soon" badge for each non-sales archetype', () => {
    render(React.createElement(ArtifactsPage));
    // Identity mock: t('comingSoon') → 'comingSoon'.
    // The badge <span> renders for support, marketing, custom — exactly 3 times.
    const badges = screen.getAllByText('comingSoon');
    expect(badges).toHaveLength(3);
  });

  // Test 2: i18n key validation — no mocking; reads actual JSON files directly.
  it('en.json and es.json contain artifacts.comingSoon with correct localized text', () => {
    const en = enMessages as unknown as Record<string, Record<string, string>>;
    const es = esMessages as unknown as Record<string, Record<string, string>>;
    // Fails if key is missing, misnamed, or has wrong value — directly validates Step 5.
    expect(en['artifacts']['comingSoon']).toBe('Coming soon');
    expect(es['artifacts']['comingSoon']).toBe('Próximamente');
  });

  // Test 3: DOM rendering — disabled cards have no interactive controls at all.
  // DisabledCard renders no buttons, links, or toggles — purely informational.
  // This structurally prevents any accidental createArtifact calls from disabled archetypes.
  it('disabled cards render no interactive controls and cannot trigger createArtifact', () => {
    render(React.createElement(ArtifactsPage));

    const disabledGrid = document.querySelector('[data-testid="disabled-grid"]')!;
    expect(disabledGrid).toBeTruthy();

    // No buttons inside the disabled grid — DisabledCard is purely informational.
    const buttonsInGrid = disabledGrid.querySelectorAll('button');
    expect(buttonsInGrid).toHaveLength(0);

    // No links inside the disabled grid — no workspace or other navigation.
    const linksInGrid = disabledGrid.querySelectorAll('a');
    expect(linksInGrid).toHaveLength(0);

    // createArtifact was never called — the disabled grid cannot trigger mutations.
    expect(createMutateSpy).not.toHaveBeenCalled();
  });

  // Test 4: disabled card with existing artifact — action buttons (Personality, Test, Workspace)
  // must NOT appear in the DOM. Validates the !isDisabled gate on the artifact action block.
  it('disabled card with an existing artifact renders no action buttons', () => {
    // Inject a support artifact. Support is disabled: true in ARCHETYPES.
    listQuerySpy.mockReturnValue({
      data: [
        {
          id: 'support-1',
          name: 'Support Assistant',
          type: 'support',
          isActive: false,
          createdAt: new Date('2025-01-01'),
          personality: {},
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(React.createElement(ArtifactsPage));

    // Identity mock: t('personalitySection') → 'personalitySection'.
    // With {artifact && !isDisabled && (...)}, this button must not render for the disabled card.
    // If the guard were missing, the Personality button would be in the DOM.
    expect(screen.queryByText('personalitySection')).toBeNull();

    // Belt-and-suspenders: t('test') → 'test'; TestChatPanel trigger button must not appear.
    // (Workspace link is only shown when isActive=true, so it wouldn't appear anyway;
    //  but Personality has no isActive guard — this is the critical assertion.)
    expect(screen.queryByText('test')).toBeNull();
  });
});
