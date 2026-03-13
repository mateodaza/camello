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

vi.stubGlobal('navigator', {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

import { Step4ConnectChannel } from '../app/onboarding/components/Step4ConnectChannel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderStep4(props: { onComplete?: () => void } = {}) {
  return render(createElement(Step4ConnectChannel, {
    onComplete: props.onComplete ?? vi.fn(),
  }));
}

function enterWhatsApp() {
  fireEvent.click(screen.getByText('whatsApp'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Step4ConnectChannel', () => {
  beforeEach(() => {
    mutateSpies.clear();
    pendingMutations.clear();
    errorMutations.clear();
    queryDataMap.clear();
  });

  it('submits both token + phoneNumberId to channel.upsert', () => {
    queryDataMap.set('channel.webhookConfig', {
      webhookUrl: 'https://api.test/webhook',
      verifyToken: 'tok123',
    });

    renderStep4();
    enterWhatsApp();

    fireEvent.change(screen.getByLabelText('channelWhatsappPhoneNumberId'), {
      target: { value: '123456789012345' },
    });
    fireEvent.change(screen.getByLabelText('channelWhatsappAccessToken'), {
      target: { value: 'EAAtest123' },
    });
    fireEvent.click(screen.getByText('saveAndContinue'));

    const spy = mutateSpies.get('channel.upsert');
    expect(spy).toHaveBeenCalledWith({
      channelType: 'whatsapp',
      phoneNumber: '123456789012345',
      credentials: { access_token: 'EAAtest123' },
    });
  });

  it('shows inline validation errors when fields empty on submit', () => {
    queryDataMap.set('channel.webhookConfig', {
      webhookUrl: 'https://api.test/webhook',
      verifyToken: 'tok123',
    });

    renderStep4();
    enterWhatsApp();

    fireEvent.click(screen.getByText('saveAndContinue'));

    expect(screen.getByText('whatsAppPhoneNumberIdRequired')).toBeInTheDocument();
    expect(screen.getByText('whatsAppAccessTokenRequired')).toBeInTheDocument();

    expect(mutateSpies.get('channel.upsert')).not.toHaveBeenCalled();
  });

  it('renders webhook URL and verify token from webhookConfig query', () => {
    queryDataMap.set('channel.webhookConfig', {
      webhookUrl: 'https://api.test/webhook',
      verifyToken: 'tok123',
    });

    renderStep4();
    enterWhatsApp();

    const webhookInput = screen.getByDisplayValue('https://api.test/webhook');
    expect(webhookInput).toBeInTheDocument();
    expect(webhookInput).toHaveAttribute('readOnly');

    const verifyInput = screen.getByDisplayValue('tok123');
    expect(verifyInput).toBeInTheDocument();
    expect(verifyInput).toHaveAttribute('readOnly');
  });
});
