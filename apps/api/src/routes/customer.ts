import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc/init.js';
import { customers } from '@camello/db';

export const customerRouter = router({
  byId: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .select({
            id: customers.id,
            externalId: customers.externalId,
            channel: customers.channel,
            name: customers.name,
            email: customers.email,
            phone: customers.phone,
            metadata: customers.metadata,
            memory: customers.memory,
            firstSeenAt: customers.firstSeenAt,
            lastSeenAt: customers.lastSeenAt,
          })
          .from(customers)
          .where(and(eq(customers.id, input.id), eq(customers.tenantId, ctx.tenantId)))
          .limit(1);
        return rows[0] ?? null;
      });
    }),
});
