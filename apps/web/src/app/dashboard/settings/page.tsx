'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Section } from '@/components/dashboard/section';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/stat-card';
import { InfoTooltip } from '@/components/ui/tooltip';
import { generateQrSvg } from '@/lib/qr-svg';
import { fmtDate, fmtCost } from '@/lib/format';
import { PLAN_LIMITS, PLAN_PRICES } from '@camello/shared/constants';
import { useToast } from '@/hooks/use-toast';
import type { PlanTier } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Shared constants / types
// ---------------------------------------------------------------------------

const PLATFORM_OPTIONS = ['twitter', 'linkedin', 'instagram', 'facebook', 'whatsapp', 'website', 'tiktok', 'youtube'] as const;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB

interface SocialLink {
  platform: string;
  url: string;
}

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

// ---------------------------------------------------------------------------
// Sparkline — lightweight inline SVG bar chart (no external deps)
// ---------------------------------------------------------------------------

function Sparkline({ data, height = 48, barWidth = 8, gap = 2 }: {
  data: Array<{ day: string; count: number }>;
  height?: number;
  barWidth?: number;
  gap?: number;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const width = data.length * (barWidth + gap) - gap;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-label="Session sparkline"
    >
      {data.map((d, i) => {
        const barH = Math.max((d.count / max) * (height - 2), 1);
        return (
          <rect
            key={d.day}
            x={i * (barWidth + gap)}
            y={height - barH}
            width={barWidth}
            height={barH}
            rx={2}
            className="fill-teal/70"
          >
            <title>{`${d.day}: ${d.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ProfileSection
// ---------------------------------------------------------------------------

function ProfileSection() {
  const t = useTranslations('profile');
  const tb = useTranslations('billing');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { addToast } = useToast();
  const tenant = trpc.tenant.me.useQuery();
  const sessionAnalytics = trpc.tenant.sessionAnalytics.useQuery(undefined, {
    enabled: !!tenant.data,
  });
  const updateLocale = trpc.tenant.updateLocale.useMutation({
    onSuccess: (_data, variables) => {
      document.cookie = `locale=${variables.locale};path=/;max-age=31536000`;
      utils.tenant.me.invalidate();
      router.refresh();
    },
  });
  const updateProfile = trpc.tenant.updateProfile.useMutation({
    onSuccess: () => {
      addToast(t('saved'), 'success');
      tenant.refetch();
    },
  });
  const uploadAvatarMut = trpc.tenant.uploadAvatar.useMutation({
    onSuccess: (data) => {
      setAvatarUrl(data.avatarUrl);
      addToast(t('avatarUploaded'), 'success');
      tenant.refetch();
    },
    onError: (err) => {
      addToast(err.message, 'error');
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tagline, setTagline] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [location, setLocation] = useState('');
  const [hours, setHours] = useState('');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [copied, setCopied] = useState(false);

  // Populate form from tenant data
  useEffect(() => {
    if (!tenant.data) return;
    const settings = tenant.data.settings as Record<string, unknown> | null;
    const profile = (settings?.profile as Record<string, unknown>) ?? {};
    setTagline((profile.tagline as string) ?? '');
    setBio((profile.bio as string) ?? '');
    setAvatarUrl((profile.avatarUrl as string) ?? '');
    setLocation((profile.location as string) ?? '');
    setHours((profile.hours as string) ?? '');
    setSocialLinks((profile.socialLinks as SocialLink[]) ?? []);
  }, [tenant.data]);

  const slug = tenant.data?.slug ?? '';
  const chatUrl = slug ? `https://camello.xyz/chat/${slug}` : '';
  const sessionInits = (() => {
    const settings = tenant.data?.settings as Record<string, unknown> | null;
    const val = settings?.sessionInits;
    return typeof val === 'number' ? val : 0;
  })();

  const handleSave = () => {
    updateProfile.mutate({
      tagline: tagline || undefined,
      bio: bio || undefined,
      avatarUrl: avatarUrl || '',
      location: location || undefined,
      hours: hours || undefined,
      socialLinks: socialLinks.length > 0 ? socialLinks : undefined,
    });
  };

  const handleAvatarFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      addToast(t('avatarTypeError'), 'error');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      addToast(t('avatarSizeError'), 'error');
      return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the data URI prefix: "data:image/png;base64,..."
      const base64 = dataUrl.split(',')[1];
      if (!base64) return;
      uploadAvatarMut.mutate({ base64, contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' });
    };
    reader.readAsDataURL(file);
  };

  const addSocialLink = () => {
    if (socialLinks.length >= 6) return;
    setSocialLinks([...socialLinks, { platform: 'website', url: '' }]);
  };

  const removeSocialLink = (idx: number) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== idx));
  };

  const updateSocialLink = (idx: number, field: 'platform' | 'url', value: string) => {
    setSocialLinks(socialLinks.map((link, i) => i === idx ? { ...link, [field]: value } : link));
  };

  const handleCopy = async () => {
    if (!chatUrl) return;
    await navigator.clipboard.writeText(chatUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (tenant.isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
  if (tenant.isError) return <QueryError error={tenant.error} onRetry={() => tenant.refetch()} />;

  // QR SVG — generated by our deterministic encoder (only <rect> elements, no user HTML)
  const qrSvgHtml = chatUrl ? generateQrSvg(chatUrl, { moduleSize: 3, margin: 2 }) : '';

  // Sparkline data from session analytics
  const sparklineData = (sessionAnalytics.data ?? []) as Array<{ day: string; count: number }>;
  const last30Total = sparklineData.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-6">
      <p className="font-body text-sm text-dune">{t('description')}</p>

      {/* Session analytics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard title={t('sessionInits')} value={sessionInits} />
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-dune">{t('last30Days')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-3xl font-bold">{last30Total}</p>
            {sparklineData.length > 0 && (
              <Sparkline data={sparklineData} />
            )}
            {sessionAnalytics.isLoading && (
              <Skeleton className="h-12 w-full" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Language selector */}
      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="font-medium text-charcoal">{tb('language')}</p>
            <p className="text-sm text-dune">{tb('languageDescription')}</p>
          </div>
          <select
            value={locale}
            onChange={(e) => updateLocale.mutate({ locale: e.target.value as 'en' | 'es' })}
            disabled={updateLocale.isPending}
            className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          >
            <option value="en">{tb('english')}</option>
            <option value="es">{tb('spanish')}</option>
          </select>
        </CardContent>
      </Card>

      {/* Profile form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('businessCard')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-charcoal">{t('tagline')}</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={t('taglinePlaceholder')}
              maxLength={50}
              className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <span className="text-xs text-dune">{tagline.length}/50</span>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-charcoal">{t('bio')}</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('bioPlaceholder')}
              maxLength={150}
              rows={2}
              className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <span className="text-xs text-dune">{bio.length}/150</span>
          </div>

          {/* Avatar upload */}
          <div>
            <label className="mb-1 block text-sm font-medium text-charcoal">{t('avatar')}</label>
            <div className="flex items-center gap-3">
              {avatarUrl && (
                <img src={avatarUrl} alt="Avatar preview" className="h-14 w-14 shrink-0 rounded-lg border border-charcoal/10 object-cover" />
              )}
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadAvatarMut.isPending}
                >
                  {uploadAvatarMut.isPending ? tc('loading') : t('uploadAvatar')}
                </Button>
                <p className="text-xs text-dune">{t('avatarHint')}</p>
              </div>
            </div>
            {avatarUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 text-xs text-dune"
                onClick={() => {
                  setAvatarUrl('');
                  // Clear will be saved when user clicks Save
                }}
              >
                {t('removeAvatar')}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-charcoal">{t('location')}</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('locationPlaceholder')}
                maxLength={50}
                className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-charcoal">{t('hours')}</label>
              <input
                type="text"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder={t('hoursPlaceholder')}
                maxLength={50}
                className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          </div>

          {/* Social links */}
          <div>
            <label className="mb-1 block text-sm font-medium text-charcoal">{t('socialLinks')}</label>
            <div className="space-y-2">
              {socialLinks.map((link, idx) => (
                <div key={idx} className="flex flex-wrap gap-2">
                  <select
                    value={link.platform}
                    onChange={(e) => updateSocialLink(idx, 'platform', e.target.value)}
                    className="w-full rounded-md border border-charcoal/15 bg-cream px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal sm:w-32"
                  >
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="url"
                    value={link.url}
                    onChange={(e) => updateSocialLink(idx, 'url', e.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeSocialLink(idx)}>
                    {t('removeLink')}
                  </Button>
                </div>
              ))}
              {socialLinks.length < 6 && (
                <Button variant="outline" size="sm" onClick={addSocialLink}>
                  {t('addLink')}
                </Button>
              )}
            </div>
          </div>

          <Button onClick={handleSave} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? tc('loading') : t('save')}
          </Button>
          {updateProfile.isError && (
            <p className="text-sm text-sunset">{updateProfile.error.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Share link + QR */}
      {chatUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('shareLink')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatUrl}
                readOnly
                className="flex-1 rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm text-dune"
              />
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? t('linkCopied') : t('copyLink')}
              </Button>
            </div>

            <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-6">
              {/* QR SVG — deterministic encoder (only <rect> elements, safe output) */}
              <div dangerouslySetInnerHTML={{ __html: qrSvgHtml }} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChannelsSection
// ---------------------------------------------------------------------------

function ChannelsSection() {
  const t = useTranslations('channels');
  const tt = useTranslations('tooltips');

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
            <div className="flex items-center gap-1 mb-1">
              <label className="text-sm font-medium text-charcoal">
                {t('channelWhatsappPhoneNumberId')}
              </label>
              <InfoTooltip label={tt('tooltipPhoneNumberId')} />
            </div>
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
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-sm font-medium text-charcoal">
                    {t('channelWebhookUrl')}
                  </label>
                  <InfoTooltip label={tt('tooltipWebhookUrl')} />
                </div>
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
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-sm font-medium text-charcoal">
                    {t('channelWebhookVerifyToken')}
                  </label>
                  <InfoTooltip label={tt('tooltipVerifyToken')} />
                </div>
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

// ---------------------------------------------------------------------------
// BillingSection
// ---------------------------------------------------------------------------

function BillingSection() {
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
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="overflow-x-auto rounded-xl border-2 border-charcoal/8 bg-cream">
            <table className="min-w-[400px] w-full text-sm">
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

// ---------------------------------------------------------------------------
// SettingsPage — single-page accordion wrapper (no <h1>, layout owns it)
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const t = useTranslations('settings');
  return (
    <div className="flex flex-col gap-3">
      <Section title={t('sectionProfile')} defaultOpen={true}>
        <ProfileSection />
      </Section>
      <Section title={t('sectionChannels')} defaultOpen={false}>
        <ChannelsSection />
      </Section>
      <Section title={t('sectionBilling')} defaultOpen={false}>
        <BillingSection />
      </Section>
    </div>
  );
}
