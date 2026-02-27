import type { CustomerFact, FactKey } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Allowed fact keys — strict allowlist, no arbitrary keys */
export const FACT_KEY_ALLOWLIST: readonly FactKey[] = [
  'name',
  'email',
  'phone',
  'preference',
  'past_topic',
] as const;

/** Max facts stored per customer */
export const MAX_STORED_FACTS = 10;

/** Max facts injected into prompt per message */
export const MAX_INJECTED_FACTS = 6;

/** Max chars per fact value */
export const MAX_FACT_VALUE_LENGTH = 120;

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/** Control character and zero-width char ranges */
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g;

/** Instruction-like line patterns that could be prompt injection attempts */
const INJECTION_LINE_PATTERNS = [
  /^SYSTEM:/i,
  /^IGNORE/i,
  /^<\|/,
  /^---/,
  /^###/,
];

/** Backtick code block pattern */
const BACKTICK_BLOCK_RE = /```[\s\S]*?```/g;

/**
 * Sanitize a fact value: trim, cap length, strip instruction-like patterns.
 * CRITICAL security function — defense-in-depth against prompt injection.
 */
export function sanitizeFactValue(raw: string): string {
  let val = raw;

  // Strip backtick blocks first (before line processing)
  val = val.replace(BACKTICK_BLOCK_RE, '');

  // Strip control characters and zero-width chars
  val = val.replace(CONTROL_CHARS_RE, '');
  val = val.replace(ZERO_WIDTH_RE, '');

  // Process line-by-line: remove lines matching injection patterns
  const lines = val.split('\n');
  const safeLines = lines.filter((line) => {
    const trimmed = line.trim();
    return !INJECTION_LINE_PATTERNS.some((pat) => pat.test(trimmed));
  });
  val = safeLines.join(' ');

  // Trim whitespace and cap at max length
  val = val.trim();
  if (val.length > MAX_FACT_VALUE_LENGTH) {
    val = val.slice(0, MAX_FACT_VALUE_LENGTH);
  }

  return val;
}

// ---------------------------------------------------------------------------
// Regex Extraction
// ---------------------------------------------------------------------------

/** Max facts extracted per single invocation */
const MAX_EXTRACT_PER_RUN = 5;

/** Name patterns (English + Spanish) */
const NAME_PATTERNS: RegExp[] = [
  /\bmy name is (\w+)/i,
  /\bI'm (\w+)/i,
  /\bme llamo (\w+)/i,
  /\bsoy (\w+)/i,
];

/** Email pattern */
const EMAIL_RE = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/;

/** Phone pattern: international-style or 7+ digit sequences */
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{2,4}/;

/**
 * Extract name/email/phone facts from customer messages using regex.
 * Only processes messages where role === 'customer'.
 * Returns at most MAX_EXTRACT_PER_RUN facts.
 */
export function extractFactsRegex(
  messages: Array<{ role: string; content: string }>,
  conversationId: string,
): CustomerFact[] {
  const facts: CustomerFact[] = [];
  const now = new Date().toISOString();

  const customerMessages = messages.filter((m) => m.role === 'customer');

  for (const msg of customerMessages) {
    if (facts.length >= MAX_EXTRACT_PER_RUN) break;
    const text = msg.content;

    // Name extraction
    for (const pattern of NAME_PATTERNS) {
      if (facts.length >= MAX_EXTRACT_PER_RUN) break;
      const match = text.match(pattern);
      if (match?.[1]) {
        const value = sanitizeFactValue(match[1]);
        if (value) {
          facts.push({ key: 'name', value, extractedAt: now, conversationId });
          break; // one name per message
        }
      }
    }

    // Email extraction
    if (facts.length < MAX_EXTRACT_PER_RUN) {
      const emailMatch = text.match(EMAIL_RE);
      if (emailMatch?.[1]) {
        const value = sanitizeFactValue(emailMatch[1]);
        if (value) {
          facts.push({ key: 'email', value, extractedAt: now, conversationId });
        }
      }
    }

    // Phone extraction
    if (facts.length < MAX_EXTRACT_PER_RUN) {
      const phoneMatch = text.match(PHONE_RE);
      if (phoneMatch?.[0]) {
        const value = sanitizeFactValue(phoneMatch[0].trim());
        if (value) {
          facts.push({ key: 'phone', value, extractedAt: now, conversationId });
        }
      }
    }
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Merge Logic
// ---------------------------------------------------------------------------

/**
 * Merge new facts into existing, dedup by key (newer wins), FIFO evict
 * when over MAX_STORED_FACTS. Rejects keys not in FACT_KEY_ALLOWLIST.
 */
export function mergeMemoryFacts(
  existing: CustomerFact[],
  newFacts: CustomerFact[],
): CustomerFact[] {
  const allowedSet = new Set<string>(FACT_KEY_ALLOWLIST);

  // Filter to allowed keys only
  const validNew = newFacts.filter((f) => allowedSet.has(f.key));

  // Build map: key -> fact (existing first, then new overrides)
  const map = new Map<string, CustomerFact>();
  for (const fact of existing) {
    if (allowedSet.has(fact.key)) {
      map.set(fact.key, fact);
    }
  }
  for (const fact of validNew) {
    map.set(fact.key, fact); // newer wins
  }

  // Convert to array, preserving insertion order
  const merged = Array.from(map.values());

  // FIFO eviction: keep the most recent MAX_STORED_FACTS
  if (merged.length > MAX_STORED_FACTS) {
    return merged.slice(merged.length - MAX_STORED_FACTS);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Parse JSONB
// ---------------------------------------------------------------------------

/**
 * Safely parse the JSONB `memory` column into typed facts.
 * Handles: {}, {facts: [...]}, null, undefined, malformed data.
 * Returns empty array on any error.
 */
export function parseMemoryFacts(raw: unknown): CustomerFact[] {
  if (!raw || typeof raw !== 'object') return [];

  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.facts)) return [];

  const allowedSet = new Set<string>(FACT_KEY_ALLOWLIST);
  const result: CustomerFact[] = [];

  for (const item of obj.facts) {
    if (
      item &&
      typeof item === 'object' &&
      'key' in item &&
      'value' in item &&
      typeof (item as Record<string, unknown>).key === 'string' &&
      typeof (item as Record<string, unknown>).value === 'string' &&
      allowedSet.has((item as Record<string, unknown>).key as string)
    ) {
      result.push({
        key: (item as Record<string, unknown>).key as FactKey,
        value: (item as Record<string, unknown>).value as string,
        extractedAt: typeof (item as Record<string, unknown>).extractedAt === 'string'
          ? (item as Record<string, unknown>).extractedAt as string
          : '',
        conversationId: typeof (item as Record<string, unknown>).conversationId === 'string'
          ? (item as Record<string, unknown>).conversationId as string
          : '',
      });
    }
  }

  return result;
}
