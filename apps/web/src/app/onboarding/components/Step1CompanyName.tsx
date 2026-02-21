'use client';

import { useEffect } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { CreateOrganization } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

interface Props {
  onComplete: (tenantId: string, previewCustomerId: string | null) => void;
}

export function Step1CompanyName({ onComplete }: Props) {
  const t = useTranslations('onboarding');
  const tc = useTranslations('common');
  const { organization, isLoaded } = useOrganization();
  const provision = trpc.onboarding.provision.useMutation({
    onSuccess: (data) => {
      onComplete(data.tenantId, data.previewCustomerId);
    },
  });

  useEffect(() => {
    if (isLoaded && organization) {
      provision.mutate({ orgId: organization.id, companyName: organization.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, organization?.id]);

  if (!isLoaded) {
    return <p className="text-center text-gray-500">{tc('loading')}</p>;
  }

  if (!organization) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('createOrg')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-600">
            {t('createOrgDescription')}
          </p>
          <CreateOrganization
            afterCreateOrganizationUrl="/onboarding"
            routing="hash"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settingUp', { name: organization.name })}</CardTitle>
      </CardHeader>
      <CardContent>
        {provision.isPending && <p className="text-sm text-gray-500">{t('provisioning')}</p>}
        {provision.isError && (
          <p className="text-sm text-red-600">
            {t('errorMessage', { message: provision.error.message })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
