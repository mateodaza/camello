import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

export async function createContext(opts: FetchCreateContextFnOptions) {
  // TODO: Extract tenant context from Clerk session
  // TODO: Set up tenant-scoped DB client
  return {
    req: opts.req,
    tenantId: null as string | null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
