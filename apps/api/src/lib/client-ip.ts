/**
 * Extract the client IP from a Request, preferring trusted proxy headers.
 *
 * Priority (most-trusted → least-trusted):
 * 1. cf-connecting-ip  — Cloudflare terminates TLS, sets this unconditionally
 * 2. x-real-ip         — Nginx / ALB / Caddy single-hop header
 * 3. x-forwarded-for   — first IP (leftmost) in chain; spoofable without
 *                         a trusted proxy, but still better than nothing
 * 4. Fallback '0.0.0.0'
 */
export function extractClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    // Take only the first (leftmost) IP — it's the original client IP
    // when a trusted proxy appends downstream IPs.
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  return '0.0.0.0';
}
