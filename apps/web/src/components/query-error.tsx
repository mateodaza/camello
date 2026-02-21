'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';

export function QueryError({ error }: { error: { message: string; data?: { code?: string } | null } }) {
  const t = useTranslations('common');
  const code = error.data?.code;

  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="pt-6">
        <p className="font-medium text-red-800">
          {code === 'UNAUTHORIZED'
            ? t('error.unauthorized')
            : code === 'FORBIDDEN'
              ? t('error.forbidden')
              : t('error.generic')}
        </p>
        <p className="mt-1 text-sm text-red-600">{error.message}</p>
      </CardContent>
    </Card>
  );
}
