import { describe, it, expect, vi } from 'vitest';
import qualifyLeadModule from '../modules/qualify-lead.js';
import type { ModuleExecutionContext } from '@camello/shared/types';

function makeCtx(overrides?: Partial<ModuleExecutionContext>): ModuleExecutionContext {
  return {
    tenantId: 'tenant-001',
    artifactId: 'artifact-001',
    conversationId: 'conv-001',
    customerId: 'cust-001',
    autonomyLevel: 'fully_autonomous',
    configOverrides: {},
    db: {
      insertLead: vi.fn().mockResolvedValue('lead-001'),
      insertModuleExecution: vi.fn().mockResolvedValue('exec-001'),
      updateModuleExecution: vi.fn().mockResolvedValue(undefined),
      updateConversationStatus: vi.fn().mockResolvedValue(undefined),
      getLeadByConversation: vi.fn().mockResolvedValue(null),
      checkModuleExecutionExists: vi.fn().mockResolvedValue(false),
      checkQueuedFollowupExists: vi.fn().mockResolvedValue(false),
    },
    ...overrides,
  };
}

const BASE = { conversation_summary: 'test', budget: '$5k' };

describe('qualify-lead source attribution', () => {
  it('passes ctx.channel as sourceChannel to insertLead', async () => {
    const ctx = makeCtx({ channel: 'webchat' });
    await qualifyLeadModule.execute(BASE, ctx);
    expect(ctx.db.insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ sourceChannel: 'webchat' }),
    );
  });

  it('passes ctx.metadata.sourcePage as sourcePage to insertLead', async () => {
    const ctx = makeCtx({ metadata: { sourcePage: '/pricing' } });
    await qualifyLeadModule.execute(BASE, ctx);
    expect(ctx.db.insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePage: '/pricing' }),
    );
  });

  it('passes undefined sourceChannel and sourcePage when ctx has no channel or metadata', async () => {
    const ctx = makeCtx();
    await qualifyLeadModule.execute(BASE, ctx);
    expect(ctx.db.insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ sourceChannel: undefined, sourcePage: undefined }),
    );
  });
});
