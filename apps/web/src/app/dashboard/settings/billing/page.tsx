'use client';

import { useState, useEffect, useRef } from 'react';
import Script from 'next/script';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { fmtDate, fmtCost } from '@/lib/format';
import { PLAN_LIMITS, PLAN_PRICES } from '@camello/shared/constants';
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

function fmtLimit(val: number): string {
  return val === Infinity ? 'Unlimited' : val.toLocaleString();
}

export default function BillingPage() {
  const utils = trpc.useUtils();
  const plan = trpc.billing.currentPlan.useQuery();
  const history = trpc.billing.history.useQuery();
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const paddleReady = useRef(false);

  const initPaddle = () => {
    if (!window.Paddle || paddleReady.current || !PADDLE_CLIENT_TOKEN) return;
    window.Paddle.Environment.set(PADDLE_ENV);
    window.Paddle.Initialize({
      token: PADDLE_CLIENT_TOKEN,
      eventCallback: (event) => {
        if (event.name === 'checkout.completed') {
          utils.billing.currentPlan.invalidate();
          utils.billing.history.invalidate();
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
    },
  });

  if (plan.isLoading) return <div className="text-gray-500">Loading...</div>;
  if (plan.isError) return <QueryError error={plan.error} />;

  const current = plan.data!;
  const isActive = current.subscriptionStatus === 'active';

  return (
    <div className="space-y-8">
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        onLoad={initPaddle}
      />
      <h1 className="text-2xl font-bold">Billing</h1>

      {/* Current plan summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold">{tierLabel(current.planTier)}</span>
            <Badge variant={isActive ? 'active' : undefined}>
              {current.subscriptionStatus}
            </Badge>
          </div>
          <p className="text-sm text-gray-600">
            ${current.price.monthly}/mo &middot;{' '}
            Up to {fmtLimit(current.limits.artifacts)} artifacts,{' '}
            {fmtLimit(current.limits.modules)} modules,{' '}
            {fmtLimit(current.limits.channels)} channels,{' '}
            {fmtLimit(current.limits.resolutions_per_month)} resolutions/mo
          </p>
          {current.monthlyCostBudgetUsd && (
            <p className="text-sm text-gray-500">
              AI budget: {fmtCost(current.monthlyCostBudgetUsd)}/mo
            </p>
          )}
        </CardContent>
      </Card>

      {/* Plan cards */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Plans</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {tiers.map((tier) => {
            const price = PLAN_PRICES[tier];
            const limits = PLAN_LIMITS[tier];
            const isCurrent = tier === current.planTier;

            return (
              <Card key={tier} className={isCurrent ? 'ring-2 ring-gray-900' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {price.label}
                    {isCurrent && <Badge>Current</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <p className="text-2xl font-bold">${price.monthly}<span className="text-sm font-normal text-gray-500">/mo</span></p>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li>{fmtLimit(limits.artifacts)} artifacts</li>
                    <li>{fmtLimit(limits.modules)} modules</li>
                    <li>{fmtLimit(limits.channels)} channels</li>
                    <li>{fmtLimit(limits.resolutions_per_month)} resolutions/mo</li>
                  </ul>
                  <Button
                    className="w-full"
                    disabled={isCurrent || checkout.isPending}
                    onClick={() => checkout.mutate({ planTier: tier })}
                  >
                    {checkout.isPending ? 'Processing...' : isCurrent ? 'Current Plan' : isActive ? `Switch to ${price.label}` : `Subscribe to ${price.label}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {checkout.isError && (
          <p className="text-sm text-red-600">{checkout.error.message}</p>
        )}
      </div>

      {/* Cancel */}
      {isActive && (
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="font-medium text-gray-900">Cancel subscription</p>
              <p className="text-sm text-gray-500">
                Your plan will remain active until the end of the current billing period.
              </p>
            </div>
            {cancelConfirm ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  onClick={() => cancel.mutate()}
                  disabled={cancel.isPending}
                >
                  {cancel.isPending ? 'Canceling...' : 'Confirm Cancel'}
                </Button>
                <Button variant="ghost" onClick={() => setCancelConfirm(false)}>
                  Keep Plan
                </Button>
              </div>
            ) : (
              <Button variant="destructive" onClick={() => setCancelConfirm(true)}>
                Cancel Subscription
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {cancel.isError && (
        <p className="text-sm text-red-600">{cancel.error.message}</p>
      )}

      {/* Billing history */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Billing History</h2>
        {history.isError && <QueryError error={history.error} />}
        {history.isLoading ? (
          <div className="text-gray-500">Loading...</div>
        ) : !history.data?.length ? (
          <p className="text-gray-500">No billing events yet.</p>
        ) : (
          <div className="rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((evt) => (
                  <tr key={evt.id} className="border-b last:border-0">
                    <td className="px-4 py-3 text-gray-500">{fmtDate(evt.createdAt)}</td>
                    <td className="px-4 py-3">{evt.type}</td>
                    <td className="px-4 py-3">{evt.amountUsd ? fmtCost(evt.amountUsd) : '—'}</td>
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
