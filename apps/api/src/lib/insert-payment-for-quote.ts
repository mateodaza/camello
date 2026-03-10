import { eq } from 'drizzle-orm';
import { leads, payments } from '@camello/db';
import type { TenantDb } from '@camello/db';

export async function insertPaymentForQuote(
  tenantDb: TenantDb,
  params: {
    tenantId: string;
    artifactId: string;
    conversationId: string;
    quoteExecutionId: string;
    output: { total: string; currency: string; quote_id: string };
  },
): Promise<void> {
  const lead = await tenantDb.query(async (db) => {
    const rows = await db
      .select({ id: leads.id, customerId: leads.customerId })
      .from(leads)
      .where(eq(leads.conversationId, params.conversationId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!lead) {
    console.warn('[insertPaymentForQuote] No lead found for conversation', params.conversationId, '— payment not created');
    return;
  }

  await tenantDb.query(async (db) => {
    await db.insert(payments).values({
      tenantId: params.tenantId,
      artifactId: params.artifactId,
      leadId: lead.id,
      conversationId: params.conversationId,
      customerId: lead.customerId,
      quoteExecutionId: params.quoteExecutionId,
      amount: params.output.total,
      currency: params.output.currency,
      status: 'pending',
      description: `Quote ${params.output.quote_id}`,
    });
  });
}
