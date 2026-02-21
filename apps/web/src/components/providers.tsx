'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ClerkProvider, useAuth } from '@clerk/nextjs';
import { esES } from '@clerk/localizations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { trpc, makeTrpcClient } from '@/lib/trpc';

function TrpcQueryProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => makeTrpcClient(getToken));

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <LocaleSync />
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}

/** Syncs tenant preferred locale to cookie. Triggers router.refresh() once if mismatch. */
function LocaleSync() {
  const { isLoaded, isSignedIn, orgId } = useAuth();
  const locale = useLocale();
  const router = useRouter();
  const synced = useRef(false);

  const enabled = isLoaded && !!isSignedIn && !!orgId;

  const tenant = trpc.tenant.me.useQuery(undefined, {
    enabled,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (synced.current || !tenant.data) return;
    const raw = (tenant.data.settings as Record<string, unknown>)?.preferredLocale;
    // Only accept known locales — prevents refresh loop if DB has unsupported value
    const preferred = raw === 'en' || raw === 'es' ? raw : null;
    if (preferred && preferred !== locale) {
      document.cookie = `locale=${preferred};path=/;max-age=31536000`;
      synced.current = true;
      router.refresh();
    }
  }, [tenant.data, locale, router]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  return (
    <ClerkProvider localization={locale === 'es' ? esES : undefined}>
      <TrpcQueryProvider>{children}</TrpcQueryProvider>
    </ClerkProvider>
  );
}
