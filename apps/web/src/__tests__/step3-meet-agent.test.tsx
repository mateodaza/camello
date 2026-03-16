import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mutateSpies = new Map<string, ReturnType<typeof vi.fn>>();
const pendingMutations = new Set<string>();
const errorMutations = new Set<string>();

function buildNestedProxy(target: Record<string, unknown>, path: string[] = []): unknown {
  return new Proxy(target, {
    get(_, prop: string) {
      if (prop === 'useMutation') {
        const key = path.join('.');
        return () => {
          const spy = mutateSpies.get(key) ?? vi.fn();
          if (!mutateSpies.has(key)) mutateSpies.set(key, spy);
          return {
            mutate: spy,
            isPending: pendingMutations.has(key),
            isError: errorMutations.has(key),
            error: null,
          };
        };
      }
      return buildNestedProxy({}, [...path, prop]);
    },
  });
}

vi.mock('@/lib/trpc', () => ({ trpc: buildNestedProxy({}) }));

const mockFileReaderInstances: { onload: (() => void) | null; result: string | null }[] = [];
vi.stubGlobal('FileReader', class {
  onload: (() => void) | null = null;
  result: string | null = null;
  constructor() { mockFileReaderInstances.push(this); }
  readAsDataURL(_file: Blob) { /* test triggers onload manually */ }
});

import { Step3MeetAgent } from '../app/onboarding/components/Step3MeetAgent';
import type { Suggestion } from '../app/onboarding/page';

const baseSuggestion: Suggestion = {
  agentName: 'Maya',
  agentType: 'sales',
  personality: { tone: 'friendly', greeting: 'Hi!', goals: ['Qualify leads'] },
  constraints: { neverDiscuss: [], alwaysEscalate: [] },
  template: 'saas',
  industry: 'software',
  confidence: 0.9,
};

function renderStep3(overrides: Partial<Suggestion> = {}, onComplete = vi.fn()) {
  return render(createElement(Step3MeetAgent, {
    suggestion: { ...baseSuggestion, ...overrides },
    onComplete,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Step3MeetAgent', () => {
  beforeEach(() => {
    mutateSpies.clear();
    pendingMutations.clear();
    errorMutations.clear();
    mockFileReaderInstances.length = 0;
  });

  it('renders module badges for sales archetype without network call', () => {
    renderStep3({ agentType: 'sales' });

    expect(screen.getByText('Qualify Lead')).toBeInTheDocument();
    expect(screen.getByText('Book Meeting')).toBeInTheDocument();
    expect(screen.getByText('Collect Payment')).toBeInTheDocument();
    expect(screen.getByText('Send Quote')).toBeInTheDocument();
    expect(screen.queryByText('Create Ticket')).not.toBeInTheDocument();
  });

  it('renders module badges for support archetype', () => {
    renderStep3({ agentType: 'support' });

    expect(screen.getByText('Create Ticket')).toBeInTheDocument();
    expect(screen.getByText('Escalate to Human')).toBeInTheDocument();
    expect(screen.queryByText('Qualify Lead')).not.toBeInTheDocument();
  });

  it('renders no module badges for custom archetype', () => {
    renderStep3({ agentType: 'custom' });

    expect(screen.queryByText('Qualify Lead')).not.toBeInTheDocument();
    expect(screen.queryByText('Create Ticket')).not.toBeInTheDocument();
    expect(screen.queryByText('Send Follow-up')).not.toBeInTheDocument();
  });

  it('tagline char counter reflects current length', () => {
    renderStep3();

    const taglineInput = screen.getByLabelText('taglineLabel') as HTMLInputElement;
    fireEvent.change(taglineInput, { target: { value: 'Hello world' } });

    expect(screen.getByText('11/50')).toBeInTheDocument();
  });

  it('file input triggers uploadAvatar mutation with base64', () => {
    const uploadSpy = vi.fn();
    mutateSpies.set('tenant.uploadAvatar', uploadSpy);

    renderStep3();

    const fileInput = screen.getByLabelText(/avatarLabel/i) as HTMLInputElement;
    const file = new File(['data'], 'logo.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(mockFileReaderInstances).toHaveLength(1);

    const reader = mockFileReaderInstances[0];
    reader.result = 'data:image/png;base64,abc123';
    reader.onload?.();

    expect(uploadSpy).toHaveBeenCalledWith(
      { base64: 'abc123', contentType: 'image/png' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('handleCreate calls setupArtifact with tagline and bio in profile', () => {
    const setupSpy = vi.fn();
    mutateSpies.set('onboarding.setupArtifact', setupSpy);

    renderStep3();

    const taglineInput = screen.getByLabelText('taglineLabel') as HTMLInputElement;
    const bioInput = screen.getByLabelText('bioLabel') as HTMLTextAreaElement;
    fireEvent.change(taglineInput, { target: { value: 'My tagline' } });
    fireEvent.change(bioInput, { target: { value: 'My bio text' } });

    fireEvent.click(screen.getByText('looksGood'));

    expect(setupSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          tagline: 'My tagline',
          bio: 'My bio text',
        }),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('on setupArtifact success, calls updateProfile then onComplete', () => {
    const onComplete = vi.fn();

    let setupPerCallOnSuccess: (() => void) | undefined;
    const setupSpy = vi.fn((_vars: unknown, callbacks: { onSuccess?: () => void }) => {
      setupPerCallOnSuccess = callbacks?.onSuccess;
    });
    mutateSpies.set('onboarding.setupArtifact', setupSpy);

    let updatePerCallOnSuccess: (() => void) | undefined;
    const updateSpy = vi.fn((_vars: unknown, callbacks: { onSuccess?: () => void }) => {
      updatePerCallOnSuccess = callbacks?.onSuccess;
    });
    mutateSpies.set('tenant.updateProfile', updateSpy);

    const { rerender } = render(createElement(Step3MeetAgent, { suggestion: baseSuggestion, onComplete }));
    rerender(createElement(Step3MeetAgent, { suggestion: baseSuggestion, onComplete }));

    fireEvent.click(screen.getByText('looksGood'));

    setupPerCallOnSuccess?.();
    expect(updateSpy).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    updatePerCallOnSuccess?.();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('Looks Good button is disabled when setup mutation is pending', () => {
    pendingMutations.add('onboarding.setupArtifact');
    renderStep3();

    expect(screen.getByText('creating').closest('button')).toBeDisabled();
  });

  it('Looks Good button is disabled when agent name is empty', () => {
    renderStep3();

    const nameInput = screen.getByRole('button', { name: /Maya/i });
    fireEvent.click(nameInput);
    const editInput = screen.getByDisplayValue('Maya') as HTMLInputElement;
    fireEvent.change(editInput, { target: { value: '' } });
    fireEvent.blur(editInput);

    expect(screen.getByText('looksGood').closest('button')).toBeDisabled();
  });
});
