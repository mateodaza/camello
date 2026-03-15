import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted spies
// ---------------------------------------------------------------------------

const { billingPlanSpy, replaceSpy } = vi.hoisted(() => ({
  billingPlanSpy: vi.fn(),
  replaceSpy: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',                        // REQUIRED: called unconditionally in ProfileSection and BillingSection
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), replace: replaceSpy }),      // REQUIRED: called unconditionally in ProfileSection
}));

vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({
    organization: { publicMetadata: { camello_tenant_id: 'tenant-123' } },
  }),
}));

vi.mock('next/script', () => ({
  default: () => null,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    tenant: {
      me: { useQuery: () => ({ data: undefined, isLoading: true }) },
      sessionAnalytics: { useQuery: () => ({ data: undefined, isLoading: true }) },
      updateLocale: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      updateProfile: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }) },
      uploadAvatar: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    channel: {
      list: { useQuery: () => ({ data: undefined, isLoading: true }) },
      webhookConfig: { useQuery: () => ({ data: undefined, isLoading: true, isError: false }) },
      upsert: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      verifyWhatsapp: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      delete: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
    billing: {
      currentPlan: { useQuery: billingPlanSpy },
      history: { useQuery: () => ({ data: undefined, isLoading: true }) },
      createCheckout: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }) },
      cancelSubscription: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }) },
    },
    useUtils: vi.fn(() => ({
      tenant: { me: { invalidate: vi.fn() } },
      billing: { currentPlan: { invalidate: vi.fn() }, history: { invalidate: vi.fn() } },
      channel: { list: { invalidate: vi.fn() } },
    })),
  },
}));

vi.mock('@/components/query-error', () => ({
  QueryError: () => null,
}));

vi.mock('@/components/stat-card', () => ({
  StatCard: () => null,
}));

vi.mock('@/lib/qr-svg', () => ({
  generateQrSvg: () => '',
}));

vi.mock('@/lib/format', () => ({
  fmtDate: (d: unknown) => String(d),
  fmtCost: (v: unknown) => String(v),
}));

vi.mock('@camello/shared/constants', () => ({
  PLAN_LIMITS: {
    starter: { artifacts: 1, modules: 3, channels: 2, resolutions_per_month: 500 },
    growth:  { artifacts: 5, modules: 9, channels: 5, resolutions_per_month: 2000 },
    scale:   { artifacts: Infinity, modules: Infinity, channels: Infinity, resolutions_per_month: Infinity },
  },
  PLAN_PRICES: {
    starter: { label: 'Starter', monthly: 99 },
    growth:  { label: 'Growth',  monthly: 299 },
    scale:   { label: 'Scale',   monthly: 799 },
  },
}));

// ---------------------------------------------------------------------------
// Import page under test
// ---------------------------------------------------------------------------

import SettingsPage from '../app/dashboard/settings/page';
import DashboardRedirect from '../app/dashboard/page';

// ---------------------------------------------------------------------------
// Setup default billing spy (loading state — safe for Test 1)
// ---------------------------------------------------------------------------

billingPlanSpy.mockReturnValue({ data: undefined, isLoading: true });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NC-278 — One-page Settings (/dashboard/settings)', () => {

  it('1 — profile section is expanded by default', () => {
    render(React.createElement(SettingsPage));
    const allDetails = document.querySelectorAll('details');
    // First <details> (Profile) must have the open attribute
    expect(allDetails[0]).toHaveAttribute('open');
    // Other sections start collapsed
    expect(allDetails[1]).not.toHaveAttribute('open');
    expect(allDetails[2]).not.toHaveAttribute('open');
  });

  it('2 — billing section shows the current plan', () => {
    billingPlanSpy.mockReturnValue({
      data: {
        planTier: 'starter' as const,
        subscriptionStatus: 'active',
        paddleSubscriptionId: null,
        paddleCustomerId: null,
        monthlyCostBudgetUsd: null,
        limits: { artifacts: 1, modules: 3, channels: 2, resolutions_per_month: 500 },
        price: { monthly: 99, label: 'Starter' },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(React.createElement(SettingsPage));
    // tierLabel('starter') = PLAN_PRICES.starter.label = 'Starter' appears in current-plan summary
    // plan cards loop also renders price.label = 'Starter' for the starter card
    // → two DOM occurrences; getAllByText required
    const starterEls = screen.getAllByText('Starter');
    expect(starterEls.length).toBeGreaterThan(0);
  });

  it('3 — old /dashboard/settings/profile redirects to /dashboard/settings', async () => {
    const { redirect } = await import('next/navigation');
    const { default: ProfilePage } = await import(
      '../app/dashboard/settings/profile/page'
    );
    ProfilePage();
    expect(redirect).toHaveBeenCalledWith('/dashboard/settings');
  });

});

describe('NC-282 — Sprint flow: redirects + dashboard home', () => {

  it('4 — /dashboard redirects to /dashboard/conversations', () => {
    replaceSpy.mockClear();
    render(React.createElement(DashboardRedirect));
    expect(replaceSpy).toHaveBeenCalledWith('/dashboard/conversations');
  });

  it('5 — /dashboard/settings/billing redirects to /dashboard/settings', async () => {
    const { redirect } = await import('next/navigation');
    const { default: BillingPage } = await import(
      '../app/dashboard/settings/billing/page'
    );
    BillingPage();
    expect(redirect).toHaveBeenCalledWith('/dashboard/settings');
  });

  it('6 — /dashboard/settings/channels redirects to /dashboard/settings', async () => {
    const { redirect } = await import('next/navigation');
    const { default: ChannelsPage } = await import(
      '../app/dashboard/settings/channels/page'
    );
    ChannelsPage();
    expect(redirect).toHaveBeenCalledWith('/dashboard/settings');
  });

});
