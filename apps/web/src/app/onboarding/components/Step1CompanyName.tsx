'use client';

import { useEffect } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { CreateOrganization } from '@clerk/nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

interface Props {
  onComplete: (tenantId: string, previewCustomerId: string | null) => void;
}

export function Step1CompanyName({ onComplete }: Props) {
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
    return <p className="text-center text-gray-500">Loading...</p>;
  }

  if (!organization) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Create your organization</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-600">
            Create a Clerk organization to get started. This will be your workspace in Camello.
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
        <CardTitle>Setting up {organization.name}...</CardTitle>
      </CardHeader>
      <CardContent>
        {provision.isPending && <p className="text-sm text-gray-500">Provisioning your workspace...</p>}
        {provision.isError && (
          <p className="text-sm text-red-600">
            Error: {provision.error.message}. Please try refreshing the page.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
