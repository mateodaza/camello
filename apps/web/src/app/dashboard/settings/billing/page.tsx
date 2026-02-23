'use client';

import { useState, useEffect, useRef } from 'react';
import Script from 'next/script';
import { useTranslations, useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtDate, fmtCost } from '@/lib/format';
import { PLAN_LIMITS, PLAN_PRICES } from '@camello/shared/constants';
import { useToast } from '@/hooks/use-toast';
import type { PlanTier } from '@camello/shared/types';

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void };
      Initialize: (opts: { token: string; eventCallback?: (event: PaddleEvent) => void }) => void;
      Checkout: { open: (opts: { transactionId: string }) => void };
    };
  }
}

interface PaddleEvent {
  name: string;
  data?: unknown;
}

const PADDLE_CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? '';
const PADDLE_ENV = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? 'sandbox';

const tiers: PlanTier[] = ['starter', 'growth', 'scale'];

function tierLabel(tier: PlanTier): string {
  return PLAN_PRICES[tier].label;
}

export default function BillingPage() {
  const t = useTranslations('billing');
  const tc = useTranslations('common');
  const locale = useLocale();
  const utils = trpc.useUtils();
  const { addToast } = useToast();
  const plan = trpc.billing.currentPlan.useQuery();
  const history = trpc.billing.history.useQuery();
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const paddleReady = useRef(false);

  function fmtLimit(val: number): string {
    return val === Infinity ? t('unlimited') : val.toLocaleString();
  }

  const initPaddle = () => {
    if (!window.Paddle || paddleReady.current || !PADDLE_CLIENT_TOKEN) return;
    window.Paddle.Environment.set(PADDLE_ENV);
    window.Paddle.Initialize({
      token: PADDLE_CLIENT_TOKEN,
      eventCallback: (event) => {
        if (event.name === 'checkout.completed' || event.name === 'checkout.closed') {
          const refresh = () => {
            utils.billing.currentPlan.invalidate();
            utils.billing.history.invalidate();
          };
          refresh();
          setTimeout(refresh, 2000);
          setTimeout(refresh, 5000);
        }
      },
    });
    paddleReady.current = true;
  };

  useEffect(() => {
    // If script was already loaded (e.g. cached), init immediately
    if (window.Paddle) initPaddle();
  }, []);

  const checkout = trpc.billing.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.transactionId && window.Paddle) {
        window.Paddle.Checkout.open({ transactionId: data.transactionId });
      } else {
        // In-place upgrade (no checkout needed)
        utils.billing.currentPlan.invalidate();
      }
    },
  });

  const cancel = trpc.billing.cancelSubscription.useMutation({
    onSuccess: () => {
      utils.billing.currentPlan.invalidate();
      setCancelConfirm(false);
      addToast(t('canceledToast'), 'success');
    },
  });

  if (plan.isLoading) return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-28 rounded-xl" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-24" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
  if (plan.isError) return <QueryError error={plan.error} onRetry={() => plan.refetch()} />;

  const current = plan.data!;
  const isActive = current.subscriptionStatus === 'active';

  return (
    <div className="space-y-8">
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        onLoad={initPaddle}
      />
      <h1 className="font-heading text-2xl font-bold text-charcoal">{t('pageTitle')}</h1>

      {/* Current plan summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('currentPlan')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold">{tierLabel(current.planTier)}</span>
            <Badge variant={isActive ? 'active' : undefined}>
              {current.subscriptionStatus}
            </Badge>
          </div>
          <p className="text-sm text-charcoal">
            ${current.price.monthly}{t('monthly')} &middot;{' '}
            {fmtLimit(current.limits.artifacts)} {t('artifacts')},{' '}
            {fmtLimit(current.limits.modules)} {t('modules')},{' '}
            {fmtLimit(current.limits.channels)} {t('channels')},{' '}
            {fmtLimit(current.limits.resolutions_per_month)} {t('resolutionsPerMonth')}
          </p>
          {current.monthlyCostBudgetUsd && (
            <p className="text-sm text-dune">
              {t('aiBudget', { budget: Number(current.monthlyCostBudgetUsd).toFixed(0) })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Plan cards */}
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-charcoal">{t('plans')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {tiers.map((tier) => {
            const price = PLAN_PRICES[tier];
            const limits = PLAN_LIMITS[tier];
            const isCurrent = tier === current.planTier;

            return (
              <Card key={tier} className={isCurrent ? 'ring-2 ring-teal' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {price.label}
                    {isCurrent && <Badge>{t('current')}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <p className="text-2xl font-bold">${price.monthly}<span className="text-sm font-normal text-dune">{t('monthly')}</span></p>
                  <ul className="space-y-1 text-sm text-charcoal">
                    <li>{fmtLimit(limits.artifacts)} {t('artifacts')}</li>
                    <li>{fmtLimit(limits.modules)} {t('modules')}</li>
                    <li>{fmtLimit(limits.channels)} {t('channels')}</li>
                    <li>{fmtLimit(limits.resolutions_per_month)} {t('resolutionsPerMonth')}</li>
                  </ul>
                  <Button
                    className="w-full"
                    disabled={isCurrent || checkout.isPending}
                    onClick={() => checkout.mutate({ planTier: tier })}
                  >
                    {checkout.isPending
                      ? t('processing')
                      : isCurrent
                        ? t('current')
                        : isActive
                          ? t('switchTo', { label: price.label })
                          : t('subscribeTo', { label: price.label })}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {checkout.isError && (
          <p className="text-sm text-error">{checkout.error.message}</p>
        )}
      </div>

      {/* Cancel */}
      {isActive && (
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="font-medium text-charcoal">{t('cancelSubscription')}</p>
              <p className="text-sm text-dune">{t('cancelMessage')}</p>
            </div>
            {cancelConfirm ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  onClick={() => cancel.mutate()}
                  disabled={cancel.isPending}
                >
                  {cancel.isPending ? t('canceling') : t('confirmCancel')}
                </Button>
                <Button variant="ghost" onClick={() => setCancelConfirm(false)}>
                  {t('keepPlan')}
                </Button>
              </div>
            ) : (
              <Button variant="destructive" onClick={() => setCancelConfirm(true)}>
                {t('cancelSubscription')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {cancel.isError && (
        <p className="text-sm text-error">{cancel.error.message}</p>
      )}

      {/* Billing history */}
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-charcoal">{t('billingHistory')}</h2>
        {history.isError && <QueryError error={history.error} onRetry={() => history.refetch()} />}
        {history.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !history.data?.length ? (
          <p className="text-dune">{t('noBillingEvents')}</p>
        ) : (
          <div className="rounded-xl border-2 border-charcoal/8 bg-cream">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-charcoal/8 text-left text-dune">
                  <th className="px-4 py-3 font-medium">{t('columnDate')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnType')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((evt) => (
                  <tr key={evt.id} className="border-b border-charcoal/8 last:border-0">
                    <td className="px-4 py-3 text-dune">{fmtDate(evt.createdAt, locale)}</td>
                    <td className="px-4 py-3">{evt.type}</td>
                    <td className="px-4 py-3">{evt.amountUsd ? fmtCost(evt.amountUsd, locale) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
