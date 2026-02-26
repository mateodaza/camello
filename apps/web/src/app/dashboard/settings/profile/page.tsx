'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/stat-card';
import { generateQrSvg } from '@/lib/qr-svg';
import { useToast } from '@/hooks/use-toast';

const PLATFORM_OPTIONS = ['twitter', 'linkedin', 'instagram', 'facebook', 'whatsapp', 'website', 'tiktok', 'youtube'] as const;

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB

interface SocialLink {
  platform: string;
  url: string;
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
// Profile Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
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
      <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('title')}</h1>
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
