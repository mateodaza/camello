import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';

// ── Hoisted mock variables — shared between vi.mock factory and test bodies ──
// vi.hoisted() ensures these are available before the vi.mock() factories run.
const { mockSendMutate, mockEnsureCustomerMutate } = vi.hoisted(() => ({
  mockSendMutate: vi.fn(),
  mockEnsureCustomerMutate: vi.fn(),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    chat: {
      send: {
        useMutation: () => ({ mutate: mockSendMutate, isPending: false, isError: false, error: null }),
      },
    },
    onboarding: {
      ensurePreviewCustomer: {
        useMutation: () => ({ mutate: mockEnsureCustomerMutate }),
      },
    },
    conversation: {
      messages: {
        useQuery: () => ({ data: undefined, isLoading: false, isSuccess: false, isError: false, error: null }),
      },
    },
  },
}));

vi.mock('@/components/simple-markdown', () => ({
  SimpleMarkdown: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

import { TestChatPanel } from '@/components/test-chat-panel';

const QUICK_PROMPTS = ['Prompt A', 'Prompt B'];

describe('TestChatPanel quick prompt pills', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockEnsureCustomerMutate.mockImplementation((_: unknown, opts: any) => {
      opts?.onSuccess?.({ customerId: 'preview-123' });
    });

    mockSendMutate.mockImplementation(vi.fn());
  });

  afterEach(() => {
    mockSendMutate.mockReset();
    mockEnsureCustomerMutate.mockReset();
  });

  it('renders quick prompt pills when quickPrompts prop is provided', () => {
    render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="advisor"
        open={true}
        onClose={() => {}}
        inline={true}
        sessionKey={0}
        quickPrompts={QUICK_PROMPTS}
      />,
    );

    expect(screen.getByText('Prompt A')).toBeInTheDocument();
    expect(screen.getByText('Prompt B')).toBeInTheDocument();
  });

  it('clicking a quick prompt pill calls sendMessage.mutate with the prompt text', async () => {
    render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="advisor"
        open={true}
        onClose={() => {}}
        inline={true}
        sessionKey={0}
        quickPrompts={QUICK_PROMPTS}
      />,
    );

    await act(async () => {}); // flush ensureCustomer → customerId set

    fireEvent.click(screen.getByText('Prompt A'));

    expect(mockSendMutate).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Prompt A', sandbox: true, channel: 'webchat' }),
      expect.any(Object),
    );
  });

  it('quick prompt pills are hidden after a user message is sent via pill click', async () => {
    render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="advisor"
        open={true}
        onClose={() => {}}
        inline={true}
        sessionKey={0}
        quickPrompts={QUICK_PROMPTS}
      />,
    );

    await act(async () => {});

    expect(screen.getByRole('button', { name: 'Prompt A' })).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Prompt A' })); });

    expect(screen.queryByRole('button', { name: 'Prompt A' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prompt B' })).not.toBeInTheDocument();
  });

  it('quick prompt pills are not rendered when quickPrompts prop is omitted', () => {
    render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="advisor"
        open={true}
        onClose={() => {}}
        inline={true}
        sessionKey={0}
      />,
    );

    expect(screen.queryByText('Prompt A')).not.toBeInTheDocument();
    expect(screen.queryByText('Prompt B')).not.toBeInTheDocument();
  });

  it('quick prompt pills reappear after sessionKey resets', async () => {
    const { rerender } = render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="advisor"
        open={true}
        onClose={() => {}}
        inline={true}
        sessionKey={0}
        quickPrompts={QUICK_PROMPTS}
      />,
    );

    await act(async () => {});

    // Click pill to hide it
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Prompt A' })); });
    expect(screen.queryByRole('button', { name: 'Prompt A' })).not.toBeInTheDocument();

    // Reset session via sessionKey increment
    await act(async () => {
      rerender(
        <TestChatPanel
          artifactId="art-1"
          artifactName="Bot"
          artifactType="advisor"
          open={true}
          onClose={() => {}}
          inline={true}
          sessionKey={1}
          initialMessages={[]}
          quickPrompts={QUICK_PROMPTS}
        />,
      );
    });

    expect(screen.getByText('Prompt A')).toBeInTheDocument();
    expect(screen.getByText('Prompt B')).toBeInTheDocument();
  });
});
