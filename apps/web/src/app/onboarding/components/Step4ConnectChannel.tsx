'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc';

interface Props {
  onComplete: () => void;
}

export function Step4ConnectChannel({ onComplete }: Props) {
  const t = useTranslations('onboarding');
  const tc = useTranslations('channels');
  const [choice, setChoice] = useState<'webchat' | 'whatsapp' | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [token, setToken] = useState('');
  const [errors, setErrors] = useState<{ phoneNumberId?: string; token?: string }>({});
  const [copied, setCopied] = useState(false);
  const channelUpsert = trpc.channel.upsert.useMutation({
    onSuccess: () => onComplete(),
  });
  const webhookCfg = trpc.channel.webhookConfig.useQuery();

  const widgetSnippet = `<script src="${process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:5173'}/widget.js" async></script>`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(widgetSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  async function handleCopyValue(value: string) {
    await navigator.clipboard.writeText(value);
  }

  const handleWhatsApp = () => {
    const errs: { phoneNumberId?: string; token?: string } = {};
    if (!phoneNumberId.trim()) errs.phoneNumberId = t('whatsAppPhoneNumberIdRequired');
    if (!token.trim()) errs.token = t('whatsAppAccessTokenRequired');
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    channelUpsert.mutate({
      channelType: 'whatsapp',
      phoneNumber: phoneNumberId,
      credentials: { access_token: token },
    });
  };

  if (!choice) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('connectChannelTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-charcoal">
            {t('connectChannelDescription')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setChoice('webchat')}
              className="rounded-lg border border-charcoal/10 p-4 text-left transition hover:border-charcoal/25 hover:shadow-sm"
            >
              <p className="font-medium">{t('webChatWidget')}</p>
              <p className="mt-1 text-xs text-dune">{t('webChatDescription')}</p>
            </button>
            <button
              onClick={() => setChoice('whatsapp')}
              className="rounded-lg border border-charcoal/10 p-4 text-left transition hover:border-charcoal/25 hover:shadow-sm"
            >
              <p className="font-medium">{t('whatsApp')}</p>
              <p className="mt-1 text-xs text-dune">{t('whatsAppDescription')}</p>
            </button>
          </div>
          <div className="pt-2">
            <Button variant="ghost" onClick={onComplete}>
              {t('skipForNow')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (choice === 'webchat') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('webChatSetupTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-charcoal">
            {t('webChatSnippetDesc')}
          </p>
          <div className="rounded bg-midnight p-3">
            <code className="text-xs text-green-400">{widgetSnippet}</code>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCopy}>
              {copied ? t('copied') : t('copySnippet')}
            </Button>
            <Button onClick={onComplete}>{t('continue')}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('whatsAppSetupTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-charcoal">
          {t('whatsAppPhoneDesc')}
        </p>

        <div className="space-y-1">
          <label htmlFor="wa-phone-number-id" className="text-sm font-medium">
            {tc('channelWhatsappPhoneNumberId')}
          </label>
          <input
            type="text"
            id="wa-phone-number-id"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder={t('whatsAppPhonePlaceholder')}
            className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
          <p className="text-xs text-dune">{tc('channelWhatsappPhoneNumberIdHint')}</p>
          {errors.phoneNumberId && (
            <p className="text-sm text-error">{errors.phoneNumberId}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="wa-access-token" className="text-sm font-medium">
            {tc('channelWhatsappAccessToken')}
          </label>
          <input
            type="password"
            id="wa-access-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
          <p className="text-xs text-dune">{tc('channelWhatsappAccessTokenHint')}</p>
          {errors.token && (
            <p className="text-sm text-error">{errors.token}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">
            {tc('channelWebhookUrl')}
          </label>
          {webhookCfg.isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={webhookCfg.data?.webhookUrl ?? ''}
                className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm bg-charcoal/5"
              />
              <Button
                variant="outline"
                onClick={() => handleCopyValue(webhookCfg.data?.webhookUrl ?? '')}
              >
                {t('copy')}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">
            {tc('channelWebhookVerifyToken')}
          </label>
          {webhookCfg.isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm bg-charcoal/5 font-mono"
                value={webhookCfg.data?.verifyToken ?? ''}
              />
              <Button
                variant="outline"
                onClick={() => handleCopyValue(webhookCfg.data?.verifyToken ?? '')}
              >
                {t('copy')}
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-dune">{tc('channelWebhookInstructions')}</p>

        <div className="flex gap-2">
          <Button disabled={channelUpsert.isPending} onClick={handleWhatsApp}>
            {channelUpsert.isPending ? t('saving') : t('saveAndContinue')}
          </Button>
          <Button variant="ghost" onClick={onComplete}>{t('whatsAppSkip')}</Button>
        </div>

        {channelUpsert.isError && (
          <p className="text-sm text-error">{channelUpsert.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
