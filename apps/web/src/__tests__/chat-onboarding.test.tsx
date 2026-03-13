import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React, { createElement } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { mockOrgRef } = vi.hoisted(() => ({
  mockOrgRef: {
    current: { id: 'org_123', name: 'Test Co' } as { id: string; name: string } | null,
  },
}));

vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({ organization: mockOrgRef.current, isLoaded: true }),
  CreateOrganization: () => null,
}));

const mutateSpies = new Map<string, ReturnType<typeof vi.fn>>();
const pendingMutations = new Set<string>();
const errorMutations = new Set<string>();
const queryDataMap = new Map<string, unknown>();

function buildUtilsProxy(): unknown {
  const fn = () => Promise.resolve();
  return new Proxy(fn, {
    get(_, prop: string) {
      if (prop === 'then') return undefined;
      return buildUtilsProxy();
    },
    apply() { return Promise.resolve(); },
  });
}

function buildNestedProxy(target: Record<string, unknown>, path: string[] = []): unknown {
  return new Proxy(target, {
    get(_, prop: string) {
      if (prop === 'useUtils') return () => buildUtilsProxy();
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
        return (_input?: unknown, _opts?: unknown) => ({
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

vi.stubGlobal('navigator', {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

import { ChatOnboarding } from '../app/onboarding/components/ChatOnboarding';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderChat(props: { _testStage?: Parameters<typeof ChatOnboarding>[0]['_testStage'] } = {}) {
  return render(createElement(ChatOnboarding, props));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatOnboarding', () => {
  beforeEach(() => {
    mutateSpies.clear();
    pendingMutations.clear();
    errorMutations.clear();
    queryDataMap.clear();
    mockOrgRef.current = { id: 'org_123', name: 'Test Co' };
  });

  // Test 1: creating_org calls provision when org loads
  it('calls provision with orgId and companyName when organization loads', async () => {
    await act(async () => { renderChat(); });

    const spy = mutateSpies.get('onboarding.provision');
    expect(spy).toHaveBeenCalledWith(
      { orgId: 'org_123', companyName: 'Test Co' },
    );
  });

  // Test 2: description step shows typing indicator during parseBusinessModel
  it('shows typing indicator when description is submitted', () => {
    pendingMutations.add('onboarding.parseBusinessModel');
    renderChat({ _testStage: 'ask_description' });

    const textarea = screen.getByPlaceholderText('descriptionPlaceholder');
    fireEvent.change(textarea, { target: { value: 'We sell premium coffee equipment online' } });
    fireEvent.click(screen.getByText('submit'));

    // After submit, stage becomes generating_agent → typing indicator visible
    expect(screen.getByText('analyzing')).toBeInTheDocument();
  });

  // Test 3: resume restores from saved step
  it('resumes to ask_channel when onboardingStep is 5 in getStatus', async () => {
    queryDataMap.set('onboarding.getStatus', {
      settings: { onboardingStep: 5 },
      previewCustomerId: 'cust-abc',
      tenantName: 'Test Co',
    });

    await act(async () => {
      renderChat();
    });

    // Should show channel choice buttons from ask_channel stage
    expect(screen.getByText('webchatChoice')).toBeInTheDocument();
    expect(screen.getByText('whatsappChoice')).toBeInTheDocument();
  });

  // Test 4: collecting_knowledge step shows both textarea and skip button
  it('shows knowledge textarea and skip button at collecting_knowledge stage', () => {
    renderChat({ _testStage: 'collecting_knowledge' });

    expect(screen.getByPlaceholderText('knowledgePlaceholder')).toBeInTheDocument();
    expect(screen.getByText('skipForNow')).toBeInTheDocument();
  });

  // Test 5: webchat snippet renders at ask_channel with organization: null (no tenantId needed)
  it('renders webchat snippet at ask_channel even when organization is null', () => {
    mockOrgRef.current = null;
    renderChat({ _testStage: 'ask_channel' });

    fireEvent.click(screen.getByText('webchatChoice'));

    // widgetSnippet should be visible in the code block
    const codeEl = document.querySelector('code');
    expect(codeEl).toBeTruthy();
    expect(codeEl?.textContent).toContain('widget.js');
    expect(screen.getByText('copySnippet')).toBeInTheDocument();
  });

  // Test 5b: resume from step 6 restores to done stage
  it('resumes to done stage when onboardingStep is 6 in getStatus', async () => {
    queryDataMap.set('onboarding.getStatus', {
      settings: { onboardingStep: 6, suggestion: null },
      previewCustomerId: 'cust-abc',
      tenantName: 'Test Co',
    });

    await act(async () => {
      renderChat();
    });

    // Should show done message + dashboard button, not channel choice
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.getByText('openDashboard')).toBeInTheDocument();
    expect(screen.queryByText('webchatChoice')).not.toBeInTheDocument();
  });

  // Test 6: WhatsApp section renders webhook URL + verify token from channel.webhookConfig query
  it('renders webhook URL and verify token read-only fields from channel.webhookConfig', () => {
    queryDataMap.set('channel.webhookConfig', {
      webhookUrl: 'https://api.example.com/webhook',
      verifyToken: 'secret-token-abc',
    });

    renderChat({ _testStage: 'ask_channel' });
    fireEvent.click(screen.getByText('whatsappChoice'));

    const webhookInput = screen.getByDisplayValue('https://api.example.com/webhook');
    expect(webhookInput).toBeInTheDocument();
    expect(webhookInput).toHaveAttribute('readOnly');

    const verifyInput = screen.getByDisplayValue('secret-token-abc');
    expect(verifyInput).toBeInTheDocument();
    expect(verifyInput).toHaveAttribute('readOnly');
  });
});
