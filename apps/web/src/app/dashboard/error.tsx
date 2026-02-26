'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');

  useEffect(() => {
    console.error('[dashboard] Unhandled error:', error);
  }, [error]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-sand px-6 text-center">
      <Image
        src="/illustrations/camel-logo.jpeg"
        alt="Camello"
        width={48}
        height={48}
        className="rounded-lg"
        unoptimized
      />
      <h2 className="font-heading text-lg font-bold text-charcoal">
        {t('error.generic')}
      </h2>
      <p className="max-w-md font-body text-sm text-dune">
        {error.message || t('error.internalServer')}
      </p>
      <Button variant="outline" onClick={reset}>
        {t('error.retry')}
      </Button>
    </div>
  );
}
