'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Palette } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';

interface WidgetAppearanceSectionProps {
  artifactId: string;
  initialConfig: Record<string, unknown>;
  initialPersonality: Record<string, unknown>;
  onSaveSuccess?: () => void;
}

export function WidgetAppearanceSection({
  artifactId,
  initialConfig,
  initialPersonality,
  onSaveSuccess,
}: WidgetAppearanceSectionProps) {
  const t = useTranslations('agentWorkspace');
  const { addToast } = useToast();

  const [primaryColor, setPrimaryColor] = useState<string>(
    (initialConfig.widgetPrimaryColor as string) ?? '#00897B',
  );
  const [position, setPosition] = useState<'bottom-right' | 'bottom-left'>(
    (initialConfig.widgetPosition as 'bottom-right' | 'bottom-left') ?? 'bottom-right',
  );

  const updateArtifact = trpc.artifact.update.useMutation({
    onError: (err) => addToast(err.message, 'error'),
  });

  function handleSave() {
    updateArtifact.mutate(
      {
        id: artifactId,
        config: { ...initialConfig, widgetPrimaryColor: primaryColor, widgetPosition: position },
      },
      { onSuccess: () => {
          addToast(t('configWidgetAppearanceSaved'), 'success');
          onSaveSuccess?.();
        }
      },
    );
  }

  const greeting = initialPersonality.greeting;
  const greetingText = Array.isArray(greeting)
    ? (greeting as string[]).join(' ')
    : ((greeting as string) ?? '');
  const avatarUrl = initialPersonality.avatarUrl as string | undefined;

  const sectionClass = 'rounded-xl border border-charcoal/8 bg-cream p-5';
  const labelClass = 'mb-1 block text-xs font-medium text-charcoal';
  const inputClass =
    'w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal';

  return (
    <div className={sectionClass}>
      <div className="mb-4 flex items-center gap-2">
        <Palette className="h-4 w-4 text-teal" />
        <h2 className="font-heading text-base font-semibold text-charcoal">
          {t('configWidgetAppearanceTitle')}
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Controls */}
        <div className="space-y-4">
          {/* Brand Color */}
          <div>
            <label className={labelClass}>{t('widgetPrimaryColor')}</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-charcoal/15 p-0.5"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                maxLength={7}
                className="w-28 rounded-md border border-charcoal/15 bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-teal"
              />
            </div>
            <p className="mt-0.5 text-xs text-dune">{t('widgetPrimaryColorHint')}</p>
          </div>

          {/* Widget Position */}
          <div>
            <label className={labelClass}>{t('widgetPosition')}</label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as 'bottom-right' | 'bottom-left')}
              className={inputClass}
            >
              <option value="bottom-right">{t('widgetPositionBottomRight')}</option>
              <option value="bottom-left">{t('widgetPositionBottomLeft')}</option>
            </select>
          </div>

          {/* Welcome Message (read-only reference) */}
          <div>
            <label className={labelClass}>{t('widgetWelcomeMessage')}</label>
            <div className="rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm text-dune">
              {greetingText || <span className="italic text-charcoal/40">—</span>}
            </div>
            <p className="mt-0.5 text-xs text-dune">{t('widgetWelcomeMessageHint')}</p>
          </div>

          {/* Avatar (read-only reference) */}
          <div>
            <label className={labelClass}>{t('widgetAvatarPreview')}</label>
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Agent avatar"
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-charcoal/10"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-charcoal/10 text-xs text-dune">
                  ?
                </div>
              )}
            </div>
            <p className="mt-0.5 text-xs text-dune">{t('widgetAvatarHint')}</p>
          </div>
        </div>

        {/* Live Preview */}
        <div>
          <p className="mb-2 text-xs font-medium text-charcoal">{t('configWidgetPreviewLabel')}</p>
          <div className="relative h-56 overflow-hidden rounded-xl border border-charcoal/10 bg-sand">
            {/* Chat bubble mockup */}
            <div
              className={`absolute bottom-16 ${position === 'bottom-right' ? 'right-4' : 'left-4'} w-44 rounded-xl bg-white p-3 shadow-md`}
            >
              <div className="flex items-start gap-2">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Agent avatar"
                    className="h-7 w-7 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    AI
                  </div>
                )}
                <p className="text-xs leading-snug text-charcoal">
                  {greetingText || 'Hello! How can I help?'}
                </p>
              </div>
            </div>

            {/* Launcher button */}
            <div
              className={`absolute bottom-4 ${position === 'bottom-right' ? 'right-4' : 'left-4'} flex h-10 w-10 items-center justify-center rounded-full shadow-lg`}
              style={{ backgroundColor: primaryColor }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="white"
                className="h-5 w-5"
              >
                <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 0 0-1.032-.211 50.89 50.89 0 0 0-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 0 0 2.433 3.984L7.28 21.53A.75.75 0 0 1 6 21v-4.03a48.527 48.527 0 0 1-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979Z" />
                <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 0 0 1.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0 0 15.75 7.5Z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={updateArtifact.isPending}
          className="rounded-md bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50"
        >
          {t('configSave')}
        </button>
      </div>
    </div>
  );
}
