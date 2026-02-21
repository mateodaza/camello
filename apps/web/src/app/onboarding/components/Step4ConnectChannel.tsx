'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

interface Props {
  onComplete: () => void;
}

export function Step4ConnectChannel({ onComplete }: Props) {
  const t = useTranslations('onboarding');
  const [choice, setChoice] = useState<'webchat' | 'whatsapp' | null>(null);
  const [phone, setPhone] = useState('');
  const [copied, setCopied] = useState(false);
  const channelUpsert = trpc.channel.upsert.useMutation({
    onSuccess: () => onComplete(),
  });

  const widgetSnippet = `<script src="${process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:5173'}/widget.js" async></script>`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(widgetSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    if (phone.length >= 10) {
      channelUpsert.mutate({
        channelType: 'whatsapp',
        phoneNumber: phone,
        isActive: true,
      });
    }
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
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('whatsAppPhonePlaceholder')}
          className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
        />
        <p className="text-xs text-dune">
          {t('webhookUrl')} <code>{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/channels/whatsapp/webhook</code>
        </p>
        <div className="flex gap-2">
          <Button onClick={handleWhatsApp} disabled={phone.length < 10 || channelUpsert.isPending}>
            {channelUpsert.isPending ? t('saving') : t('saveAndContinue')}
          </Button>
          <Button variant="ghost" onClick={onComplete}>{t('whatsAppSkip')}</Button>
        </div>
        {channelUpsert.isError && (
          <p className="text-sm text-sunset">{channelUpsert.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
