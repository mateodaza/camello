'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

interface Props {
  agentName: string;
  businessDescription: string;
  alreadySeeded: boolean;
  onSeeded: () => void;
  onComplete: () => void;
}

export function Step4TeachAgent({ agentName, businessDescription, alreadySeeded, onSeeded, onComplete }: Props) {
  const t = useTranslations('onboarding');
  const [quickFacts, setQuickFacts] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [seedStatus, setSeedStatus] = useState<'idle' | 'seeding' | 'done' | 'error'>(
    alreadySeeded ? 'done' : 'idle',
  );
  const [seedChunks, setSeedChunks] = useState(0);
  const [urlQueued, setUrlQueued] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const seeded = useRef(alreadySeeded);
  const settled = useRef(alreadySeeded); // tracks whether mutation resolved

  const ingest = trpc.knowledge.ingest.useMutation();
  const queueUrl = trpc.knowledge.queueUrl.useMutation();

  // Auto-seed business description on mount (skip if already seeded)
  useEffect(() => {
    if (seeded.current || !businessDescription || businessDescription.length < 10) return;
    seeded.current = true;
    setSeedStatus('seeding');

    // Timeout: if embedding hangs, fail gracefully after 15s
    const timeout = setTimeout(() => {
      if (!settled.current) {
        settled.current = true;
        setSeedStatus('error');
      }
    }, 15_000);

    ingest.mutate(
      { content: businessDescription, title: 'Business Description', sourceType: 'upload' },
      {
        onSuccess: (data) => {
          clearTimeout(timeout);
          settled.current = true;
          setSeedStatus('done');
          setSeedChunks(data.chunkCount);
          onSeeded();
        },
        onError: () => {
          clearTimeout(timeout);
          settled.current = true;
          setSeedStatus('error');
        },
      },
    );

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinue = async () => {
    setSubmitting(true);
    try {
      // Ingest quick facts if provided
      if (quickFacts.trim().length >= 10) {
        await ingest.mutateAsync({
          content: quickFacts.trim(),
          title: 'Quick Facts',
          sourceType: 'upload',
        });
      }

      // Queue URL for async scraping if provided
      if (websiteUrl.trim()) {
        await queueUrl.mutateAsync({ url: websiteUrl.trim() });
        setUrlQueued(true);
      }

      onComplete();
    } catch {
      // Errors are shown inline via mutation state
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('teachAgentTitle', { agentName })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Auto-seed status */}
        <div className="rounded-lg border bg-gray-50 p-3">
          {seedStatus === 'seeding' && (
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <div>
                <p className="text-sm text-gray-600">{t('teachingAbout', { agentName })}</p>
                <p className="text-xs text-gray-400">{t('mayTakeSeconds')}</p>
              </div>
            </div>
          )}
          {seedStatus === 'done' && seedChunks > 0 && (
            <p className="text-sm text-green-700">
              {t('learnedBusiness', { agentName, chunkCount: seedChunks })}
            </p>
          )}
          {seedStatus === 'done' && seedChunks === 0 && (
            <p className="text-sm text-green-700">{t('alreadyKnows', { agentName })}</p>
          )}
          {seedStatus === 'error' && (
            <p className="text-sm text-amber-600">
              {t('indexError')}
            </p>
          )}
          {seedStatus === 'idle' && !businessDescription && (
            <p className="text-sm text-gray-500">{t('noDescription')}</p>
          )}
        </div>

        {/* Quick Facts */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            {t('tellMoreLabel', { agentName })} <span className="font-normal text-gray-400">{t('tellMoreOptional')}</span>
          </label>
          <p className="text-xs text-gray-500">
            {t('quickFactsDescription')}
          </p>
          <textarea
            value={quickFacts}
            onChange={(e) => setQuickFacts(e.target.value)}
            placeholder={t('quickFactsPlaceholder')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            rows={4}
            maxLength={5000}
          />
        </div>

        {/* Website URL */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            {t('importFromWebsite')} <span className="font-normal text-gray-400">{t('tellMoreOptional')}</span>
          </label>
          <p className="text-xs text-gray-500">
            {t('importWebsiteDescription')}
          </p>
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder={t('websitePlaceholder')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
          {urlQueued && (
            <p className="text-xs text-green-600">{t('queuedForImport')}</p>
          )}
        </div>

        {/* Error display */}
        {(ingest.isError || queueUrl.isError) && (
          <p className="text-sm text-red-600">
            {ingest.error?.message ?? queueUrl.error?.message ?? t('analyzeError')}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleContinue}
            disabled={submitting || seedStatus === 'seeding'}
          >
            {submitting ? t('saving') : t('continue')}
          </Button>
          <Button variant="ghost" onClick={onComplete} disabled={submitting || seedStatus === 'seeding'}>
            {t('skipForNow')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
