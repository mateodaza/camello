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
  const settled = useRef(alreadySeeded);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  const ingest = trpc.knowledge.ingest.useMutation();
  const queueUrl = trpc.knowledge.queueUrl.useMutation();

  const MAX_RETRIES = 2;
  const WATCHDOG_MS = 15_000;

  const armWatchdog = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!settled.current) {
        settled.current = true;
        setSeedStatus('error');
      }
    }, WATCHDOG_MS);
  };

  const fireIngest = () => {
    ingest.mutate(
      { content: businessDescription, title: 'Business Description', sourceType: 'upload' },
      {
        onSuccess: (data) => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          settled.current = true;
          setSeedStatus('done');
          setSeedChunks(data.chunkCount);
          onSeeded();
        },
        onError: () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          if (retryCount.current < MAX_RETRIES) {
            retryCount.current += 1;
            armWatchdog();
            fireIngest();
            return;
          }
          settled.current = true;
          setSeedStatus('error');
        },
      },
    );
  };

  // Auto-seed business description when available (skip if already seeded).
  // Watches `businessDescription` so that on wizard resume the seed fires once
  // the parent hydrates the prop (it starts empty, then gets restored from DB).
  // The `seeded` ref guard prevents double-fire on subsequent prop changes.
  useEffect(() => {
    if (settled.current) return;

    if (seeded.current) {
      // Strict Mode remount: mutation in-flight but cleanup killed the watchdog. Re-arm.
      armWatchdog();
      return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }

    if (!businessDescription || businessDescription.length < 10) return;

    seeded.current = true;
    setSeedStatus('seeding');
    armWatchdog();
    fireIngest();

    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessDescription]);

  const handleContinue = async () => {
    setSubmitting(true);

    // Ingest quick facts if provided (optional — don't block wizard)
    if (quickFacts.trim().length >= 10) {
      try {
        await ingest.mutateAsync({
          content: quickFacts.trim(),
          title: 'Quick Facts',
          sourceType: 'upload',
        });
      } catch {
        // Error shown inline; continue anyway
      }
    }

    // Queue URL for async scraping if provided (optional)
    if (websiteUrl.trim()) {
      try {
        await queueUrl.mutateAsync({ url: websiteUrl.trim() });
        setUrlQueued(true);
      } catch {
        // Error shown inline; continue anyway
      }
    }

    onComplete();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('teachAgentTitle', { agentName })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Auto-seed status */}
        <div className="rounded-lg border border-charcoal/8 bg-sand p-3">
          {seedStatus === 'seeding' && (
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin text-dune" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <div>
                <p className="text-sm text-charcoal">{t('teachingAbout', { agentName })}</p>
                <p className="text-xs text-dune">{t('mayTakeSeconds')}</p>
              </div>
            </div>
          )}
          {seedStatus === 'done' && seedChunks > 0 && (
            <p className="text-sm text-teal">
              {t('learnedBusiness', { agentName, chunkCount: seedChunks })}
            </p>
          )}
          {seedStatus === 'done' && seedChunks === 0 && (
            <p className="text-sm text-teal">{t('alreadyKnows', { agentName })}</p>
          )}
          {seedStatus === 'error' && (
            <p className="text-sm text-gold">
              {t('indexError')}
            </p>
          )}
          {seedStatus === 'idle' && !businessDescription && (
            <p className="text-sm text-dune">{t('noDescription')}</p>
          )}
        </div>

        {/* Quick Facts */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-charcoal">
            {t('tellMoreLabel', { agentName })} <span className="font-normal text-dune">{t('tellMoreOptional')}</span>
          </label>
          <p className="text-xs text-dune">
            {t('quickFactsDescription')}
          </p>
          <textarea
            value={quickFacts}
            onChange={(e) => setQuickFacts(e.target.value)}
            placeholder={t('quickFactsPlaceholder')}
            className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            rows={4}
            maxLength={5000}
          />
        </div>

        {/* Website URL */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-charcoal">
            {t('importFromWebsite')} <span className="font-normal text-dune">{t('tellMoreOptional')}</span>
          </label>
          <p className="text-xs text-dune">
            {t('importWebsiteDescription')}
          </p>
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder={t('websitePlaceholder')}
            className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
          {urlQueued && (
            <p className="text-xs text-teal">{t('queuedForImport')}</p>
          )}
        </div>

        {/* Error display */}
        {(ingest.isError || queueUrl.isError) && (
          <p className="text-sm text-error">
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
          <Button variant="ghost" onClick={onComplete} disabled={submitting}>
            {t('skipForNow')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
