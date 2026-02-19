import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dns and fetch before importing the module
const mockResolve4 = vi.fn<(hostname: string) => Promise<string[]>>();
vi.mock('node:dns/promises', () => ({
  resolve4: (...args: [string]) => mockResolve4(...args),
}));

const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks are set up
const { extractContent, SsrfError } = await import('../lib/content-extractor.js');

function makeResponse(body: string, contentType = 'text/html', status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType },
  });
}

describe('content-extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve4.mockResolvedValue(['93.184.216.34']); // safe public IP
  });

  describe('SSRF protection', () => {
    it('blocks non-http protocols', async () => {
      await expect(extractContent('ftp://example.com/file.txt')).rejects.toThrow(SsrfError);
      await expect(extractContent('file:///etc/passwd')).rejects.toThrow(SsrfError);
      await expect(extractContent('data:text/html,<h1>hi</h1>')).rejects.toThrow(SsrfError);
    });

    it('blocks localhost / 127.x.x.x', async () => {
      mockResolve4.mockResolvedValue(['127.0.0.1']);
      await expect(extractContent('http://localhost/secret')).rejects.toThrow(SsrfError);
    });

    it('blocks private IPs (10.x.x.x)', async () => {
      mockResolve4.mockResolvedValue(['10.0.0.1']);
      await expect(extractContent('http://internal.corp/data')).rejects.toThrow(SsrfError);
    });

    it('blocks private IPs (172.16-31.x.x)', async () => {
      mockResolve4.mockResolvedValue(['172.16.0.1']);
      await expect(extractContent('http://internal.corp/data')).rejects.toThrow(SsrfError);
    });

    it('blocks private IPs (192.168.x.x)', async () => {
      mockResolve4.mockResolvedValue(['192.168.1.1']);
      await expect(extractContent('http://router.local/admin')).rejects.toThrow(SsrfError);
    });

    it('blocks link-local (169.254.x.x)', async () => {
      mockResolve4.mockResolvedValue(['169.254.169.254']);
      await expect(extractContent('http://metadata.cloud/latest')).rejects.toThrow(SsrfError);
    });

    it('allows public IPs', async () => {
      mockResolve4.mockResolvedValue(['93.184.216.34']);
      mockFetch.mockResolvedValue(makeResponse('Hello world', 'text/plain'));
      const result = await extractContent('https://example.com/page');
      expect(result).toBe('Hello world');
    });

    it('blocks DNS resolution failure', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      await expect(extractContent('http://nonexistent.invalid/page')).rejects.toThrow(SsrfError);
    });
  });

  describe('redirect handling', () => {
    it('follows redirects up to max limit, re-validating each hop', async () => {
      // First hop redirects
      mockFetch
        .mockResolvedValueOnce(new Response(null, {
          status: 302,
          headers: { Location: 'https://example.com/page2' },
        }))
        .mockResolvedValueOnce(makeResponse('Final content', 'text/plain'));

      const result = await extractContent('https://example.com/page1');
      expect(result).toBe('Final content');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('rejects after too many redirects', async () => {
      const redirect = () => new Response(null, {
        status: 302,
        headers: { Location: 'https://example.com/next' },
      });
      mockFetch
        .mockResolvedValueOnce(redirect())
        .mockResolvedValueOnce(redirect())
        .mockResolvedValueOnce(redirect())
        .mockResolvedValueOnce(redirect());

      await expect(extractContent('https://example.com/start')).rejects.toThrow('Too many redirects');
    });
  });

  describe('HTML extraction', () => {
    it('extracts text from article tag, strips nav/script/style', async () => {
      const html = `
        <html>
          <head><style>body { color: red; }</style></head>
          <body>
            <nav>Menu items</nav>
            <article>
              <h1>Title</h1>
              <p>Article content here.</p>
            </article>
            <footer>Footer stuff</footer>
            <script>alert('xss')</script>
          </body>
        </html>`;
      mockFetch.mockResolvedValue(makeResponse(html, 'text/html'));

      const result = await extractContent('https://example.com/article');
      expect(result).toContain('Title');
      expect(result).toContain('Article content here.');
      expect(result).not.toContain('Menu items');
      expect(result).not.toContain('Footer stuff');
      expect(result).not.toContain('alert');
      expect(result).not.toContain('color: red');
    });

    it('falls back to main then body if no article', async () => {
      const html = `<html><body><main><p>Main content</p></main></body></html>`;
      mockFetch.mockResolvedValue(makeResponse(html, 'text/html'));

      const result = await extractContent('https://example.com/main-page');
      expect(result).toContain('Main content');
    });
  });

  describe('plaintext passthrough', () => {
    it('passes through text/plain content', async () => {
      mockFetch.mockResolvedValue(makeResponse('Raw text content', 'text/plain'));
      const result = await extractContent('https://example.com/file.txt');
      expect(result).toBe('Raw text content');
    });

    it('passes through text/markdown content', async () => {
      mockFetch.mockResolvedValue(makeResponse('# Heading\n\nParagraph', 'text/markdown'));
      const result = await extractContent('https://example.com/readme.md');
      expect(result).toBe('# Heading\n\nParagraph');
    });
  });

  describe('size limit', () => {
    it('rejects responses exceeding 5 MB', async () => {
      const bigBody = 'x'.repeat(6 * 1024 * 1024);
      mockFetch.mockResolvedValue(makeResponse(bigBody, 'text/plain'));
      await expect(extractContent('https://example.com/huge')).rejects.toThrow('byte limit');
    });
  });

  describe('HTTP errors', () => {
    it('throws ExtractionError on 404', async () => {
      mockFetch.mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));
      await expect(extractContent('https://example.com/missing')).rejects.toThrow('HTTP 404');
    });

    it('throws ExtractionError on 500', async () => {
      mockFetch.mockResolvedValue(new Response('Error', { status: 500, statusText: 'Internal Server Error' }));
      await expect(extractContent('https://example.com/broken')).rejects.toThrow('HTTP 500');
    });
  });
});
