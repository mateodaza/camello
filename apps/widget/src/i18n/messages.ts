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
    'chat.error.send': 'Failed to send. Try again.',
    'chat.error.rateLimit': 'Slow down — please wait a moment before sending another message.',
    'chat.error.budgetExceeded': 'This agent has reached its usage limit. Please try again later.',
    'chat.error.conversationLimit': 'This conversation has reached its message limit. Please start a new conversation.',
    'chat.error.dailyLimit': 'You have reached your daily message limit. Please try again tomorrow.',
    'chat.poweredBy': 'Powered by Camello',
    'chat.scrollToBottom': 'Scroll to bottom',
    'chat.retry': 'Retry',
    'chat.teamLabel': 'Team',
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
    'chat.error.send': 'No se pudo enviar. Inténtalo de nuevo.',
    'chat.error.rateLimit': 'Más despacio — espera un momento antes de enviar otro mensaje.',
    'chat.error.budgetExceeded': 'Este agente alcanzó su límite de uso. Inténtalo más tarde.',
    'chat.error.conversationLimit': 'Esta conversación alcanzó su límite de mensajes. Inicia una nueva conversación.',
    'chat.error.dailyLimit': 'Alcanzaste tu límite diario de mensajes. Inténtalo mañana.',
    'chat.poweredBy': 'Impulsado por Camello',
    'chat.scrollToBottom': 'Ir al final',
    'chat.retry': 'Reintentar',
    'chat.teamLabel': 'Equipo',
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
