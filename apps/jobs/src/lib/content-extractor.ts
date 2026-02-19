import * as cheerio from 'cheerio';
import { resolve4 } from 'node:dns/promises';
import { URL } from 'node:url';

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;

// RFC 1918 + loopback + link-local + unspecified
const BLOCKED_IP_PREFIXES = [
  '127.', '10.', '0.',
  '169.254.',
  '192.168.',
];

function isPrivateIp(ip: string): boolean {
  if (BLOCKED_IP_PREFIXES.some(prefix => ip.startsWith(prefix))) return true;
  // 172.16.0.0/12 — 172.16.x.x through 172.31.x.x
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 loopback
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  return false;
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/**
 * Validate a URL against SSRF attacks before fetching.
 * - Only http: and https: protocols allowed
 * - Hostname resolved via DNS, blocked if it points to private IP ranges
 */
async function validateUrl(url: string): Promise<URL> {
  const parsed = new URL(url);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfError(`Blocked protocol: ${parsed.protocol}`);
  }

  // Resolve hostname to IP and check against block-list
  try {
    const addresses = await resolve4(parsed.hostname);
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        throw new SsrfError(`Blocked private IP: ${addr} for host ${parsed.hostname}`);
      }
    }
  } catch (err) {
    if (err instanceof SsrfError) throw err;
    throw new SsrfError(`DNS resolution failed for ${parsed.hostname}: ${(err as Error).message}`);
  }

  return parsed;
}

/**
 * Fetch a URL with SSRF protections, redirect limiting, and size cap.
 * Returns the raw response body as a string.
 */
async function safeFetch(url: string): Promise<{ body: string; contentType: string }> {
  let currentUrl = url;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await validateUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Camello-Ingestion/1.0',
          'Accept': 'text/html, text/plain, text/markdown, */*;q=0.1',
        },
      });

      // Handle redirects manually — re-validate each hop
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new ExtractionError(`Redirect ${response.status} with no Location header`);
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }

      if (!response.ok) {
        throw new ExtractionError(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Stream body with size cap
      const reader = response.body?.getReader();
      if (!reader) throw new ExtractionError('No response body');

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
          reader.cancel();
          throw new ExtractionError(`Response exceeded ${MAX_BODY_BYTES} byte limit`);
        }
        chunks.push(value);
      }

      const body = new TextDecoder().decode(Buffer.concat(chunks));
      const contentType = response.headers.get('content-type') ?? '';

      return { body, contentType };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ExtractionError(`Too many redirects (max ${MAX_REDIRECTS})`);
}

/**
 * Extract clean text from HTML using cheerio.
 * Strips navigation, scripts, styles, and non-content elements.
 */
function extractFromHtml(html: string): string {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, nav, footer, header, aside, iframe, noscript, svg, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();

  // Prefer semantic content containers
  const $content = $('article').length
    ? $('article')
    : $('main').length
      ? $('main')
      : $('[role="main"]').length
        ? $('[role="main"]')
        : $('body');

  // Get text, collapse whitespace
  const text = $content
    .text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

/**
 * Fetch a URL and extract clean text content.
 * - SSRF-safe (validates protocol, blocks private IPs)
 * - Size-limited (5 MB)
 * - Content-aware (HTML → cheerio extraction, text/markdown → passthrough)
 */
export async function extractContent(url: string): Promise<string> {
  const { body, contentType } = await safeFetch(url);

  const ct = contentType.toLowerCase();

  if (ct.includes('text/html') || ct.includes('application/xhtml')) {
    const text = extractFromHtml(body);
    if (!text) throw new ExtractionError('No text content extracted from HTML');
    return text;
  }

  if (ct.includes('text/plain') || ct.includes('text/markdown') || ct.includes('text/csv')) {
    return body.trim();
  }

  // Fallback: try HTML extraction (some servers don't set content-type correctly)
  if (body.trimStart().startsWith('<!') || body.trimStart().startsWith('<html')) {
    const text = extractFromHtml(body);
    if (text) return text;
  }

  // Last resort: treat as plain text if it looks like text
  if (body.length > 0 && body.length < MAX_BODY_BYTES) {
    return body.trim();
  }

  throw new ExtractionError(`Unsupported content type: ${contentType}`);
}
