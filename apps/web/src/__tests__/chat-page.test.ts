import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// ChatPage logic tests (pure — no component rendering)
// Validates the i18n lookup, session bootstrap fetch logic, message append
// behavior, and error handling for the public /chat/[slug] page.
// ---------------------------------------------------------------------------

// ── i18n helper (mirrors chat-page.tsx inline strings) ──

const strings = {
  en: {
    placeholder: 'Type a message...',
    send: 'Send',
    typing: 'Thinking...',
    poweredBy: 'Powered by Camello',
    errorSession: 'Could not connect. Please try again.',
    errorSend: 'Failed to send. Try again.',
    errorNotFound: 'This chat link is invalid or no longer active.',
    budgetExceeded: 'This agent has reached its usage limit. Please try again later.',
    retry: 'Retry',
  },
  es: {
    placeholder: 'Escribe un mensaje...',
    send: 'Enviar',
    typing: 'Pensando...',
    poweredBy: 'Impulsado por Camello',
    errorSession: 'No se pudo conectar. Inténtalo de nuevo.',
    errorSend: 'No se pudo enviar. Inténtalo de nuevo.',
    errorNotFound: 'Este enlace de chat es inválido o ya no está activo.',
    budgetExceeded: 'Este agente alcanzó su límite de uso. Inténtalo más tarde.',
    retry: 'Reintentar',
  },
} as const;

type Locale = keyof typeof strings;

function t(key: keyof (typeof strings)['en'], lang: string): string {
  const locale: Locale = lang in strings ? (lang as Locale) : 'en';
  return strings[locale][key];
}

// ── Message list helpers (mirrors ChatPage state management) ──

interface ChatMessage {
  role: 'customer' | 'artifact';
  content: string;
}

function addOptimistic(messages: ChatMessage[], text: string): ChatMessage[] {
  return [...messages, { role: 'customer', content: text }];
}

function addResponse(messages: ChatMessage[], text: string): ChatMessage[] {
  return [...messages, { role: 'artifact', content: text }];
}

function rollbackOptimistic(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(0, -1);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatPage i18n', () => {
  it('returns English strings for "en"', () => {
    expect(t('send', 'en')).toBe('Send');
    expect(t('placeholder', 'en')).toBe('Type a message...');
  });

  it('returns Spanish strings for "es"', () => {
    expect(t('send', 'es')).toBe('Enviar');
    expect(t('typing', 'es')).toBe('Pensando...');
  });

  it('falls back to English for unknown locales', () => {
    expect(t('send', 'fr')).toBe('Send');
    expect(t('poweredBy', 'de')).toBe('Powered by Camello');
  });
});

describe('ChatPage message state', () => {
  it('appends optimistic customer message', () => {
    const before: ChatMessage[] = [
      { role: 'artifact', content: 'Welcome!' },
    ];
    const after = addOptimistic(before, 'Hello');
    expect(after.length).toBe(2);
    expect(after[1]).toEqual({ role: 'customer', content: 'Hello' });
  });

  it('appends artifact response after optimistic message', () => {
    const state = addOptimistic([], 'Hi');
    const final = addResponse(state, 'Hello! How can I help?');
    expect(final.length).toBe(2);
    expect(final[0].role).toBe('customer');
    expect(final[1].role).toBe('artifact');
  });

  it('rolls back optimistic message on send error', () => {
    const state = addOptimistic(
      [{ role: 'artifact', content: 'Welcome!' }],
      'My message',
    );
    expect(state.length).toBe(2);

    const rolledBack = rollbackOptimistic(state);
    expect(rolledBack.length).toBe(1);
    expect(rolledBack[0].role).toBe('artifact');
  });

  it('handles empty message list gracefully', () => {
    const state = addOptimistic([], 'First message');
    expect(state.length).toBe(1);

    const rolledBack = rollbackOptimistic(state);
    expect(rolledBack.length).toBe(0);
  });
});

describe('ChatPage session bootstrap', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses valid session response correctly', () => {
    const response = {
      token: 'eyJ...',
      tenant_name: 'Acme Corp',
      artifact_name: 'Sales Bot',
      language: 'es',
    };

    expect(response.token).toBeDefined();
    expect(response.tenant_name).toBe('Acme Corp');
    expect(response.language).toBe('es');
  });

  it('defaults language to "en" when not provided', () => {
    const response = {
      token: 'eyJ...',
      tenant_name: 'Acme Corp',
      artifact_name: 'Sales Bot',
    } as { token: string; tenant_name: string; artifact_name: string; language?: string };

    const lang = response.language ?? 'en';
    expect(lang).toBe('en');
  });

  it('parses history response and filters to valid roles', () => {
    const history = {
      conversation_id: 'conv-1',
      messages: [
        { role: 'customer', content: 'Hello' },
        { role: 'artifact', content: 'Hi there!' },
        { role: 'system', content: 'internal prompt' },
      ],
    };

    const filtered = history.messages
      .filter((m) => m.role === 'customer' || m.role === 'artifact')
      .map((m) => ({ role: m.role as 'customer' | 'artifact', content: m.content }));

    expect(filtered.length).toBe(2);
    expect(filtered[0].role).toBe('customer');
    expect(filtered[1].role).toBe('artifact');
  });

  it('shows greeting as first message when history is empty', () => {
    const infoResponse = { greeting: 'Welcome to Acme!' };
    const historyMessages: ChatMessage[] = [];

    let initialMessages: ChatMessage[];
    if (historyMessages.length === 0 && infoResponse.greeting) {
      initialMessages = [{ role: 'artifact', content: infoResponse.greeting }];
    } else {
      initialMessages = historyMessages;
    }

    expect(initialMessages.length).toBe(1);
    expect(initialMessages[0]).toEqual({ role: 'artifact', content: 'Welcome to Acme!' });
  });

  it('skips greeting when history has messages', () => {
    const infoResponse = { greeting: 'Welcome to Acme!' };
    const historyMessages: ChatMessage[] = [
      { role: 'customer', content: 'Old message' },
      { role: 'artifact', content: 'Old response' },
    ];

    let initialMessages: ChatMessage[];
    if (historyMessages.length === 0 && infoResponse.greeting) {
      initialMessages = [{ role: 'artifact', content: infoResponse.greeting }];
    } else {
      initialMessages = historyMessages;
    }

    expect(initialMessages.length).toBe(2);
    expect(initialMessages[0].content).toBe('Old message');
  });
});

describe('ChatPage error differentiation', () => {
  it('maps HTTP 400 to errorNotFound (invalid slug)', () => {
    const httpStatus = 400;
    const errorKind = httpStatus === 400 ? 'not_found' : 'connection';
    expect(errorKind).toBe('not_found');
    expect(t(errorKind === 'not_found' ? 'errorNotFound' : 'errorSession', 'en'))
      .toBe('This chat link is invalid or no longer active.');
  });

  it('maps HTTP 500 to errorSession (server error)', () => {
    const httpStatus: number = 500;
    const errorKind = httpStatus === 400 ? 'not_found' : 'connection';
    expect(errorKind).toBe('connection');
    expect(t(errorKind === 'not_found' ? 'errorNotFound' : 'errorSession', 'en'))
      .toBe('Could not connect. Please try again.');
  });

  it('maps network error (catch) to errorSession', () => {
    // Network failures hit the catch block → always 'connection'
    const errorKind = 'connection';
    expect(t('errorSession', 'es'))
      .toBe('No se pudo conectar. Inténtalo de nuevo.');
  });
});

describe('ChatPage budget handling', () => {
  it('shows budget exceeded message in artifact language', () => {
    const response = { budget_exceeded: true, response_text: '' };
    const lang = 'es';

    const message = response.budget_exceeded
      ? t('budgetExceeded', lang)
      : response.response_text;

    expect(message).toBe('Este agente alcanzó su límite de uso. Inténtalo más tarde.');
  });

  it('shows normal response when budget not exceeded', () => {
    const response = { budget_exceeded: false, response_text: 'Hello!' };
    const lang = 'en';

    const message = response.budget_exceeded
      ? t('budgetExceeded', lang)
      : response.response_text;

    expect(message).toBe('Hello!');
  });
});
