import { en } from './en.js';
import { es } from './es.js';

const messages: Record<string, Record<string, string>> = { en, es };

/**
 * Look up a translated backend message by key and locale.
 * Falls back to English for unknown locales or missing keys.
 */
export function t(key: string, locale?: string): string {
  const lang = locale && messages[locale] ? locale : 'en';
  return messages[lang][key] ?? messages.en[key] ?? key;
}
