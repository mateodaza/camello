'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { Sidebar } from '@/components/sidebar';
import { QueryError } from '@/components/query-error';
import { trpc } from '@/lib/trpc';
import { useMobileSidebar } from '@/hooks/use-mobile-sidebar';
import { cn } from '@/lib/utils';

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');
  const tenant = trpc.tenant.me.useQuery();
  const router = useRouter();

  // A tenant is "onboarded" if they completed the wizard OR already have a
  // default artifact (set up via API/seed data). Prevents forcing existing
  // tenants through the wizard just because the flag isn't set.
  const isOnboarded = tenant.data
    ? !!(tenant.data.settings as Record<string, unknown>)?.onboardingComplete || !!tenant.data.defaultArtifactId
    : false;

  useEffect(() => {
    if (tenant.isError) {
      const errorCode = tenant.error.data?.code;
      if (errorCode === 'UNAUTHORIZED') {
        router.replace('/sign-in');
        return;
      }
      if (errorCode === 'FORBIDDEN') {
        router.replace('/onboarding');
        return;
      }
    }
    if (tenant.data && !isOnboarded) {
      router.replace('/onboarding');
    }
  }, [tenant.data, tenant.isError, tenant.error, router, isOnboarded]);

  if (tenant.isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-dune">{t('loading')}</p>
      </div>
    );
  }

  if (tenant.isError) {
    const errorCode = tenant.error.data?.code;
    // Auth errors: show nothing while redirect happens
    if (errorCode === 'UNAUTHORIZED' || errorCode === 'FORBIDDEN') return null;
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <QueryError error={tenant.error} onRetry={() => tenant.refetch()} />
      </div>
    );
  }

  if (tenant.data && !isOnboarded) {
    return null;
  }

  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('sidebar');
  const { open: mobileOpen, openSidebar, closeSidebar } = useMobileSidebar();

  return (
    <OnboardingGate>
      <div className="flex h-dvh flex-col md:flex-row">
        {/* Mobile header */}
        <header className="flex h-14 shrink-0 items-center justify-between bg-midnight px-4 md:hidden">
          <button
            onClick={openSidebar}
            aria-label={t('openMenu')}
            className="rounded-md p-1.5 text-cream/70 hover:bg-cream/10 hover:text-cream"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/illustrations/camel-logo.jpeg"
              alt="Camello"
              width={24}
              height={24}
              className="rounded-md"
              unoptimized
            />
            <span className="font-heading text-sm font-semibold uppercase tracking-wide text-cream">
              Camello
            </span>
          </Link>
          <UserButton afterSignOutUrl="/" />
        </header>

        <Sidebar mobileOpen={mobileOpen} onMobileClose={closeSidebar} />

        <main
          className={cn(
            'flex-1 overflow-y-auto bg-sand p-4 md:p-6',
            mobileOpen && 'overflow-y-hidden',
          )}
        >
          <div className="mx-auto max-w-5xl">
            {children}
          </div>
        </main>
      </div>
    </OnboardingGate>
  );
}
