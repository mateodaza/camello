import { createTRPCReact, httpBatchLink } from '@trpc/react-query';
import superjson from 'superjson';
import type { AppRouter } from '@camello/api/trpc';

export const trpc = createTRPCReact<AppRouter>();

export function makeTrpcClient(getToken: () => Promise<string | null>) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/trpc`,
        transformer: superjson,
        async headers() {
          const token = await getToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
