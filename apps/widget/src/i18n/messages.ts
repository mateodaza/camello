const messages = {
  en: {
    'chat.placeholder': 'Type a message...',
    'chat.send': 'Send',
    'chat.typing': 'Typing...',
    'chat.empty': 'Send a message to get started',
    'chat.close': 'Close chat',
    'chat.open': 'Open chat',
    'chat.error.session': 'Failed to create session',
    'chat.error.unknown': 'Unknown error',
    'chat.poweredBy': 'Powered by Camello',
  },
  es: {
    'chat.placeholder': 'Escribe un mensaje...',
    'chat.send': 'Enviar',
    'chat.typing': 'Escribiendo...',
    'chat.empty': 'Envía un mensaje para comenzar',
    'chat.close': 'Cerrar chat',
    'chat.open': 'Abrir chat',
    'chat.error.session': 'No se pudo crear la sesión',
    'chat.error.unknown': 'Error desconocido',
    'chat.poweredBy': 'Impulsado por Camello',
  },
} as const;

type Locale = keyof typeof messages;
type MessageKey = keyof (typeof messages)['en'];

/**
 * Look up a translated string by key and locale.
 * Falls back to English for unknown locales or missing keys.
 */
export function t(key: MessageKey, locale: string): string {
  const lang: Locale = locale in messages ? (locale as Locale) : 'en';
  return messages[lang][key] ?? messages.en[key] ?? key;
}

export type { Locale, MessageKey };
