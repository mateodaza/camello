import { Card, CardContent } from '@/components/ui/card';

export function QueryError({ error }: { error: { message: string } }) {
  const isUnauthorized = error.message.includes('UNAUTHORIZED');
  const isForbidden = error.message.includes('FORBIDDEN');

  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="pt-6">
        <p className="font-medium text-red-800">
          {isUnauthorized
            ? 'Not authenticated. Please sign in again.'
            : isForbidden
              ? 'No tenant linked. Set camello_tenant_id in your Clerk organization metadata.'
              : 'Something went wrong'}
        </p>
        <p className="mt-1 text-sm text-red-600">{error.message}</p>
      </CardContent>
    </Card>
  );
}
