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
  archetype?: string;
  onSeeded: () => void;
  onComplete: () => void;
}

const RECOMMENDED_MIN_DOCS = 3;

const TOPICS_BY_ARCHETYPE: Record<string, Array<{ labelKey: string; promptTemplate: string }>> = {
  sales: [
    { labelKey: 'topicPricing',       promptTemplate: 'Pricing information:\n' },
    { labelKey: 'topicServices',      promptTemplate: 'Our services:\n' },
    { labelKey: 'topicIdealCustomer', promptTemplate: 'Our ideal customer:\n' },
    { labelKey: 'topicFaq',           promptTemplate: 'Frequently asked questions:\nQ: \nA: \n' },
  ],
  support: [
    { labelKey: 'topicFaq',             promptTemplate: 'Frequently asked questions:\nQ: \nA: \n' },
    { labelKey: 'topicTroubleshooting', promptTemplate: 'Troubleshooting steps:\n' },
    { labelKey: 'topicPolicies',        promptTemplate: 'Our policies:\n' },
    { labelKey: 'topicHours',           promptTemplate: 'Business hours:\nContact:\n' },
  ],
  marketing: [
    { labelKey: 'topicBrandStory',  promptTemplate: 'Our brand story:\n' },
    { labelKey: 'topicPromotions',  promptTemplate: 'Current promotions:\n' },
    { labelKey: 'topicServices',    promptTemplate: 'Our products/services:\n' },
    { labelKey: 'topicFaq',         promptTemplate: 'Frequently asked questions:\nQ: \nA: \n' },
  ],
  custom: [
    { labelKey: 'topicServices',  promptTemplate: 'Our services:\n' },
    { labelKey: 'topicFaq',       promptTemplate: 'Frequently asked questions:\nQ: \nA: \n' },
    { labelKey: 'topicHours',     promptTemplate: 'Business hours:\nContact:\n' },
    { labelKey: 'topicPolicies',  promptTemplate: 'Our policies:\n' },
  ],
};

export function Step4TeachAgent({ agentName, businessDescription, alreadySeeded, archetype, onSeeded, onComplete }: Props) {
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

  const utils = trpc.useUtils();
  const ingest = trpc.knowledge.ingest.useMutation();
  const queueUrl = trpc.knowledge.queueUrl.useMutation();

  // Accurate count from COUNT(DISTINCT title) — no chunk limit, no title-Set computation
  const docCountQuery = trpc.knowledge.docCount.useQuery();
  const docCount = docCountQuery.data ?? 0;

  // Resolved topics array for this archetype (fallback to 'custom')
  const topics = TOPICS_BY_ARCHETYPE[archetype ?? 'custom'] ?? TOPICS_BY_ARCHETYPE['custom']!;

  // Soft warning: show only when 0 docs and not loading
  const showSoftWarning = !docCountQuery.isLoading && docCount === 0;

  // Progress bar fill: 0.0 to 1.0, clamped
  const progressFraction = Math.min(docCount / RECOMMENDED_MIN_DOCS, 1);

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
          void utils.knowledge.docCount.invalidate();
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
        void utils.knowledge.docCount.invalidate();
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

        {/* Knowledge count badge + progress indicator */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            {docCountQuery.isLoading ? (
              <svg className="h-3 w-3 animate-spin text-dune" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <span className="inline-flex items-center rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-medium text-teal">
                {docCount > 0 ? t('docsAdded', { count: docCount }) : t('noDocsYet')}
              </span>
            )}
          </div>
          {/* Progress bar: shows onboarding knowledge completion toward RECOMMENDED_MIN_DOCS */}
          <div
            role="progressbar"
            aria-valuenow={docCount}
            aria-valuemin={0}
            aria-valuemax={RECOMMENDED_MIN_DOCS}
            aria-label={docCount > 0 ? t('docsAdded', { count: docCount }) : t('noDocsYet')}
            className="h-1.5 w-full overflow-hidden rounded-full bg-charcoal/8"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                progressFraction >= 1 ? 'bg-teal' : progressFraction > 0 ? 'bg-gold' : 'bg-transparent'
              }`}
              style={{ width: `${progressFraction * 100}%` }}
            />
          </div>
        </div>

        {/* Suggested topics */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-dune">{t('suggestedTopics')}</p>
          <div className="flex flex-wrap gap-2">
            {topics.map(({ labelKey, promptTemplate }) => (
              <button
                key={labelKey}
                type="button"
                onClick={() => setQuickFacts(promptTemplate)}
                className="min-h-[36px] rounded-full border border-charcoal/15 px-3 py-1 text-xs text-charcoal hover:border-teal hover:text-teal focus:outline-none focus:ring-2 focus:ring-teal"
              >
                {t(labelKey as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
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

        {/* Soft warning: 0 docs — matches AC condition exactly */}
        {showSoftWarning && (
          <div className="rounded-md border border-gold/30 bg-gold/5 px-3 py-2">
            <p className="text-xs text-charcoal">{t('softWarning')}</p>
          </div>
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
