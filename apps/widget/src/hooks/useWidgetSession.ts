import { useState, useCallback } from 'react';

interface WidgetSession {
  token: string | null;
  tenantName: string;
  artifactName: string;
  language: string;
  branding: { primaryColor: string; position: 'bottom-right' | 'bottom-left' };
  isLoading: boolean;
  error: string | null;
  init: () => void;
}

/**
 * Manages widget session lifecycle.
 *
 * - Token stored in memory only (NOT localStorage — XSS protection per spec).
 * - Fingerprint is a simple device hash (good enough for anonymous visitor dedup).
 */
export function useWidgetSession(tenantSlug: string, apiUrl: string): WidgetSession {
  // Token in memory only — cleared on page refresh (by design)
  const [token, setToken] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState('');
  const [artifactName, setArtifactName] = useState('');
  const [language, setLanguage] = useState('en');
  const [branding, setBranding] = useState<{ primaryColor: string; position: 'bottom-right' | 'bottom-left' }>({
    primaryColor: '#4f46e5',
    position: 'bottom-right',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const init = useCallback(async () => {
    if (token || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const fingerprint = await getVisitorFingerprint();

      const res = await fetch(`${apiUrl}/api/widget/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          visitor_fingerprint: fingerprint,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to create session');
      }

      const data = await res.json() as {
        token: string;
        tenant_name: string;
        artifact_name: string;
        language?: string;
        branding?: { primaryColor?: string; position?: string };
      };

      setToken(data.token);
      setTenantName(data.tenant_name);
      setArtifactName(data.artifact_name);
      setLanguage(data.language ?? 'en');
      setBranding({
        primaryColor: typeof data.branding?.primaryColor === 'string' ? data.branding.primaryColor : '#4f46e5',
        position: data.branding?.position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, apiUrl, token, isLoading]);

  return { token, tenantName, artifactName, language, branding, isLoading, error, init };
}

/** Simple browser fingerprint (not cryptographically strong, just for dedup). */
async function getVisitorFingerprint(): Promise<string> {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  const raw = parts.join('|');
  // Use SubtleCrypto if available, otherwise fallback to simple hash
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback: simple string hash
  let hash = 0;
  for (const ch of raw) {
    hash = (hash << 5) - hash + ch.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
