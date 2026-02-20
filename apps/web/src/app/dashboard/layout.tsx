'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { QueryError } from '@/components/query-error';
import { trpc } from '@/lib/trpc';

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const tenant = trpc.tenant.me.useQuery();
  const router = useRouter();

  // A tenant is "onboarded" if they completed the wizard OR already have a
  // default artifact (set up via API/seed data). Prevents forcing existing
  // tenants through the wizard just because the flag isn't set.
  const isOnboarded = tenant.data
    ? !!(tenant.data.settings as Record<string, unknown>)?.onboardingComplete || !!tenant.data.defaultArtifactId
    : false;

  useEffect(() => {
    if (tenant.isError && tenant.error.data?.code === 'FORBIDDEN') {
      router.replace('/onboarding');
    }
    if (tenant.data && !isOnboarded) {
      router.replace('/onboarding');
    }
  }, [tenant.data, tenant.isError, tenant.error, router, isOnboarded]);

  if (tenant.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (tenant.isError) {
    if (tenant.error.data?.code === 'FORBIDDEN') return null;
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <QueryError error={tenant.error} />
      </div>
    );
  }

  if (tenant.data && !isOnboarded) {
    return null;
  }

  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingGate>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-100 p-6">
          {children}
        </main>
      </div>
    </OnboardingGate>
  );
}
