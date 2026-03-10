import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { createElement } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mutateSpies = new Map<string, ReturnType<typeof vi.fn>>();
const pendingMutations = new Set<string>();
const errorMutations = new Set<string>();
const queryDataMap = new Map<string, unknown>();

// Callable proxy for utils — any terminal call (e.g. invalidate()) resolves
function buildUtilsProxy(): unknown {
  const fn = () => Promise.resolve();
  return new Proxy(fn, {
    get(_, prop: string) {
      if (prop === 'then') return undefined; // not a Promise itself
      return buildUtilsProxy();
    },
    apply() {
      return Promise.resolve();
    },
  });
}

function buildNestedProxy(target: Record<string, unknown>, path: string[] = []): unknown {
  return new Proxy(target, {
    get(_, prop: string) {
      if (prop === 'useUtils') {
        return () => buildUtilsProxy();
      }
      if (prop === 'useMutation') {
        const key = path.join('.');
        return () => {
          const spy = mutateSpies.get(key) ?? vi.fn();
          if (!mutateSpies.has(key)) mutateSpies.set(key, spy);
          return {
            mutate: spy,
            mutateAsync: spy,
            isPending: pendingMutations.has(key),
            isError: errorMutations.has(key),
            error: null,
          };
        };
      }
      if (prop === 'useQuery') {
        const key = path.join('.');
        return (_input?: unknown) => ({
          data: queryDataMap.get(key),
          isLoading: false,
          isError: false,
        });
      }
      return buildNestedProxy({}, [...path, prop]);
    },
  });
}

vi.mock('@/lib/trpc', () => ({ trpc: buildNestedProxy({}) }));

import { Step4TeachAgent } from '../app/onboarding/components/Step4TeachAgent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Step4Props {
  agentName?: string;
  businessDescription?: string;
  alreadySeeded?: boolean;
  archetype?: string;
  onSeeded?: () => void;
  onComplete?: () => void;
}

function renderStep4(props: Step4Props = {}) {
  return render(createElement(Step4TeachAgent, {
    agentName: props.agentName ?? 'Aria',
    businessDescription: props.businessDescription ?? 'A software company that sells SaaS tools.',
    alreadySeeded: props.alreadySeeded ?? false,
    archetype: props.archetype,
    onSeeded: props.onSeeded ?? vi.fn(),
    onComplete: props.onComplete ?? vi.fn(),
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Step4TeachAgent', () => {
  beforeEach(() => {
    mutateSpies.clear();
    pendingMutations.clear();
    errorMutations.clear();
    queryDataMap.clear();
    // Default: docCount = 0 so soft warning shows unless overridden
    queryDataMap.set('knowledge.docCount', 0);
  });

  it('renders 4 topic cards for sales archetype', () => {
    queryDataMap.set('knowledge.docCount', 2);
    renderStep4({ archetype: 'sales' });

    expect(screen.getByText('topicPricing')).toBeInTheDocument();
    expect(screen.getByText('topicIdealCustomer')).toBeInTheDocument();
    expect(screen.getByText('topicFaq')).toBeInTheDocument();
    expect(screen.getByText('topicServices')).toBeInTheDocument();
  });

  it('clicking a topic card pre-fills the textarea', () => {
    queryDataMap.set('knowledge.docCount', 0);
    renderStep4({ archetype: 'sales' });

    fireEvent.click(screen.getByText('topicPricing'));

    const textarea = screen.getByRole('textbox', { name: /tellMoreLabel/i }) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Pricing information:\n');
  });

  it('renders different topics for support archetype', () => {
    queryDataMap.set('knowledge.docCount', 0);
    renderStep4({ archetype: 'support' });

    expect(screen.getByText('topicTroubleshooting')).toBeInTheDocument();
    expect(screen.queryByText('topicIdealCustomer')).not.toBeInTheDocument();
  });

  it('shows soft warning when docCount is 0', () => {
    queryDataMap.set('knowledge.docCount', 0);
    renderStep4({ alreadySeeded: false });

    expect(screen.getByText('softWarning')).toBeInTheDocument();
  });

  it('does not show soft warning when docCount > 0', () => {
    queryDataMap.set('knowledge.docCount', 2);
    renderStep4();

    expect(screen.queryByText('softWarning')).not.toBeInTheDocument();
  });

  it('progress bar reflects partial fill at 1 doc', () => {
    queryDataMap.set('knowledge.docCount', 1);
    renderStep4();

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '1');
    expect(progressbar).toHaveAttribute('aria-valuemax', '3');
  });
});
