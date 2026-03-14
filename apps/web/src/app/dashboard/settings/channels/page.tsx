'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

export default function ChannelsPage() {
  const t = useTranslations('channels');

  const channelList = trpc.channel.list.useQuery();
  const webhookCfg = trpc.channel.webhookConfig.useQuery();
  const upsert = trpc.channel.upsert.useMutation();
  const verify = trpc.channel.verifyWhatsapp.useMutation();
  const deleteChannel = trpc.channel.delete.useMutation();
  const utils = trpc.useUtils();
  const { addToast } = useToast();

  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const waRow = channelList.data?.find((c) => c.channelType === 'whatsapp');
  const displayPhoneNumber = (waRow as { displayPhoneNumber?: string | null } | undefined)?.displayPhoneNumber ?? null;

  // Pre-populate phoneNumberId from existing config (only on first load).
  // phoneNumberId omitted from deps intentionally: `!phoneNumberId` guard means we
  // only pre-fill once, so including it would overwrite user input on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (waRow?.phoneNumber && !phoneNumberId) {
      setPhoneNumberId(waRow.phoneNumber);
    }
  }, [waRow?.phoneNumber]);

  async function handleSave() {
    setVerifyError(null);
    // 1. Upsert credentials (clears any previous display_phone_number)
    await upsert.mutateAsync({
      channelType: 'whatsapp',
      phoneNumber: phoneNumberId,
      credentials: { access_token: accessToken },
    });
    // 2. Verify with Meta — merges display_phone_number into credentials on success
    const verifyResult = await verify.mutateAsync({ phoneNumberId, accessToken });
    await utils.channel.list.invalidate();
    if (verifyResult.valid) {
      addToast(t('channelWhatsappConnected', { displayPhone: verifyResult.displayPhoneNumber }), 'success');
    } else {
      setVerifyError(t('channelVerifyError'));
      addToast(t('channelVerifyError'), 'error');
    }
  }

  async function handleDisconnect() {
    await deleteChannel.mutateAsync({ channelType: 'whatsapp' });
    await utils.channel.list.invalidate();
    addToast(t('channelDisconnect'), 'success');
  }

  async function copyToClipboard(value: string) {
    await navigator.clipboard.writeText(value);
  }

  const isSaving = upsert.isPending || verify.isPending;

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('channelWhatsapp')}</h1>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-charcoal">{t('channelWhatsappStatus')}:</span>
        {channelList.isLoading ? (
          <Skeleton className="h-5 w-32" />
        ) : displayPhoneNumber ? (
          <span className="rounded-full bg-teal/15 px-3 py-0.5 text-sm font-medium text-teal">
            {t('channelWhatsappConnected', { displayPhone: displayPhoneNumber })}
          </span>
        ) : (
          <span className="rounded-full bg-charcoal/10 px-3 py-0.5 text-sm font-medium text-dune">
            {t('channelWhatsappNotConnected')}
          </span>
        )}
      </div>

      {/* Credentials card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('channelWhatsapp')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-charcoal">
              {t('channelWhatsappAccessToken')}
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <p className="mt-1 text-xs text-dune">{t('channelWhatsappAccessTokenHint')}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-charcoal">
              {t('channelWhatsappPhoneNumberId')}
            </label>
            <input
              type="text"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <p className="mt-1 text-xs text-dune">{t('channelWhatsappPhoneNumberIdHint')}</p>
          </div>

          {verifyError && (
            <p className="text-sm text-sunset">{verifyError}</p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !accessToken || !phoneNumberId}
            >
              {isSaving ? '…' : t('channelSave')}
            </Button>

            {waRow && (
              <Button
                variant="destructive"
                onClick={handleDisconnect}
                disabled={deleteChannel.isPending}
              >
                {t('channelDisconnect')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Webhook config card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('channelWebhookUrl')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {webhookCfg.isError && (
            <p className="text-sm text-sunset">{t('channelWebhookConfigError')}</p>
          )}
          {webhookCfg.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : !webhookCfg.isError && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-charcoal">
                  {t('channelWebhookUrl')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={webhookCfg.data?.webhookUrl ?? ''}
                    readOnly
                    className="flex-1 rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm text-dune"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(webhookCfg.data?.webhookUrl ?? '')}
                  >
                    {t('copy')}
                  </Button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-charcoal">
                  {t('channelWebhookVerifyToken')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={webhookCfg.data?.verifyToken ?? ''}
                    readOnly
                    className="flex-1 rounded-md border border-charcoal/15 bg-cream px-3 py-2 font-mono text-sm text-dune"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(webhookCfg.data?.verifyToken ?? '')}
                  >
                    {t('copy')}
                  </Button>
                </div>
              </div>

              <p className="text-sm text-dune">{t('channelWebhookInstructions')}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
