'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import type { Suggestion } from '../page';

interface Props {
  suggestion: Suggestion;
  onComplete: () => void;
}

const ARCHETYPE_MODULE_SLUGS: Record<string, readonly string[]> = {
  sales:     ['qualify_lead', 'book_meeting', 'collect_payment', 'send_quote'],
  support:   ['create_ticket', 'escalate_to_human'],
  marketing: ['send_followup', 'capture_interest', 'draft_content'],
  custom:    [],
};

const SLUG_TO_LABEL: Record<string, string> = {
  qualify_lead:     'Qualify Lead',
  book_meeting:     'Book Meeting',
  collect_payment:  'Collect Payment',
  send_quote:       'Send Quote',
  create_ticket:    'Create Ticket',
  escalate_to_human:'Escalate to Human',
  send_followup:    'Send Follow-up',
  capture_interest: 'Capture Interest',
  draft_content:    'Draft Content',
};

export function Step3MeetAgent({ suggestion, onComplete }: Props) {
  const t = useTranslations('onboarding');
  const tWorkspace = useTranslations('agentWorkspace');
  const [name, setName] = useState(suggestion.agentName);
  const [editing, setEditing] = useState(false);

  const uploadAvatar  = trpc.tenant.uploadAvatar.useMutation();
  const updateProfile = trpc.tenant.updateProfile.useMutation();

  const [tagline, setTagline]               = useState('');
  const [bio, setBio]                       = useState('');
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar]   = useState(false);

  const setup = trpc.onboarding.setupArtifact.useMutation();

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
    type AllowedType = typeof allowedTypes[number];
    if (!allowedTypes.includes(file.type as AllowedType)) return;
    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      if (!base64) { setUploadingAvatar(false); return; }
      uploadAvatar.mutate(
        { base64, contentType: file.type as AllowedType },
        {
          onSuccess: (data) => { setPendingAvatarUrl(data.avatarUrl); setUploadingAvatar(false); },
          onError: () => setUploadingAvatar(false),
        },
      );
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = () => {
    const profilePayload = {
      tagline: tagline.trim() || undefined,
      bio: bio.trim() || undefined,
      avatarUrl: pendingAvatarUrl ?? undefined,
    };
    setup.mutate(
      {
        name,
        type: suggestion.agentType as 'sales' | 'support' | 'marketing' | 'custom',
        personality: suggestion.personality as Record<string, unknown>,
        constraints: suggestion.constraints,
        profile: profilePayload,
      },
      {
        onSuccess: () =>
          updateProfile.mutate(profilePayload, { onSuccess: () => onComplete() }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('meetAgentTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-charcoal/8 bg-sand p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-midnight text-lg text-cream">
              {name[0]?.toUpperCase()}
            </div>
            <div>
              {editing ? (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded border border-charcoal/15 px-2 py-1 text-sm"
                  autoFocus
                  onBlur={() => setEditing(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
                />
              ) : (
                <button onClick={() => setEditing(true)} className="text-left">
                  <p className="font-semibold">{name}</p>
                  <p className="text-xs text-dune">{t('clickToRename')}</p>
                </button>
              )}
            </div>
            <Badge className="ml-auto">{suggestion.agentType}</Badge>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-charcoal">{t('greeting')}</p>
          <p className="mt-1 text-sm text-charcoal">&ldquo;{suggestion.personality.greeting}&rdquo;</p>
        </div>

        <div>
          <p className="text-sm font-medium text-charcoal">{t('goals')}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-charcoal">
            {suggestion.personality.goals.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-medium text-charcoal">{tWorkspace('boundModules')}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {(ARCHETYPE_MODULE_SLUGS[suggestion.agentType] ?? []).map((slug) => (
              <Badge key={slug} variant="outline">{SLUG_TO_LABEL[slug] ?? slug}</Badge>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-charcoal/8 bg-cream p-4">
          <p className="text-sm font-semibold text-charcoal">{t('quickProfileTitle')}</p>
          <p className="text-xs text-dune">{t('quickProfileDescription')}</p>

          <div>
            <label className="mb-1 block text-xs font-medium text-charcoal" htmlFor="onb-tagline">
              {t('taglineLabel')}
            </label>
            <input
              id="onb-tagline"
              value={tagline}
              maxLength={50}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={t('taglinePlaceholder')}
              className="w-full rounded border border-charcoal/15 px-3 py-1.5 text-sm"
            />
            <p className="mt-0.5 text-right text-xs text-dune">{tagline.length}/50</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-charcoal" htmlFor="onb-bio">
              {t('bioLabel')}
            </label>
            <textarea
              id="onb-bio"
              value={bio}
              maxLength={150}
              rows={2}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('bioPlaceholder')}
              className="w-full resize-none rounded border border-charcoal/15 px-3 py-1.5 text-sm"
            />
            <p className="mt-0.5 text-right text-xs text-dune">{bio.length}/150</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-charcoal" htmlFor="onb-avatar">
              {t('avatarLabel')} <span className="text-dune">({t('optional')})</span>
            </label>
            {pendingAvatarUrl && (
              <img src={pendingAvatarUrl} alt="Avatar preview"
                className="mb-2 h-12 w-12 rounded-full object-cover" />
            )}
            <input
              id="onb-avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarFile}
              disabled={uploadingAvatar}
              className="block text-sm text-charcoal"
            />
            {uploadingAvatar && <p className="mt-0.5 text-xs text-dune">{t('uploadingAvatar')}</p>}
            {uploadAvatar.isError && <p className="mt-0.5 text-xs text-sunset">{t('avatarUploadError')}</p>}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleCreate}
            disabled={setup.isPending || updateProfile.isPending || uploadingAvatar || !name.trim()}
          >
            {setup.isPending || updateProfile.isPending ? t('creating') : t('looksGood')}
          </Button>
        </div>

        {setup.isError && (
          <p className="text-sm text-sunset">{setup.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
