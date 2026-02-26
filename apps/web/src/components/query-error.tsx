'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function QueryError({
  error,
  onRetry,
}: {
  error: { message: string; data?: { code?: string } | null };
  onRetry?: () => void;
}) {
  const t = useTranslations('common');
  const router = useRouter();
  const code = error.data?.code;

  const getMessage = (): string => {
    switch (code) {
      case 'UNAUTHORIZED':
        return t('error.unauthorized');
      case 'FORBIDDEN':
        return t('error.forbidden');
      case 'NOT_FOUND':
        return t('error.notFound');
      case 'PAYLOAD_TOO_LARGE':
        return t('error.payloadTooLarge');
      case 'TOO_MANY_REQUESTS':
        return t('error.tooManyRequests');
      case 'INTERNAL_SERVER_ERROR':
        return t('error.internalServer');
      default:
        return t('error.generic');
    }
  };

  const isAuthError = code === 'UNAUTHORIZED';

  return (
    <Card className="border-sunset/25 bg-sunset/10">
      <CardContent className="pt-6">
        <p className="font-medium text-charcoal">{getMessage()}</p>
        {/* Only show raw message for non-auth errors (auth errors already have a clear message) */}
        {!isAuthError && error.message && (
          <p className="mt-1 text-sm text-charcoal/80">{error.message}</p>
        )}
        <div className="mt-3 flex gap-2">
          {isAuthError ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/sign-in')}
            >
              {t('error.signIn')}
            </Button>
          ) : (
            onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                {t('error.retry')}
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
