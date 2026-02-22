'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import type { Suggestion } from '../page';

interface Props {
  initialDescription?: string;
  onComplete: (suggestion: Suggestion, description: string) => void;
}

export function Step2BusinessModel({ initialDescription = '', onComplete }: Props) {
  const t = useTranslations('onboarding');
  const locale = useLocale();
  const [description, setDescription] = useState(initialDescription);
  const parse = trpc.onboarding.parseBusinessModel.useMutation({
    onSuccess: (data, variables) => {
      // Use variables.description (the value sent to the server) instead of
      // the live `description` state — user may have edited the textarea
      // while the mutation was in flight.
      onComplete(data as Suggestion, variables.description);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (description.length >= 10) {
      parse.mutate({ description, locale: locale as 'en' | 'es' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('businessModelTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-charcoal">
            {t('businessModelDescription')}
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('businessModelPlaceholder')}
            className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            rows={4}
            minLength={10}
            maxLength={2000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-dune">{t('charCount', { length: description.length })}</span>
            <Button type="submit" disabled={description.length < 10 || parse.isPending}>
              {parse.isPending ? t('analyzing') : t('continue')}
            </Button>
          </div>
          {parse.isError && (
            <p className="text-sm text-error">{t('analyzeError')}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
