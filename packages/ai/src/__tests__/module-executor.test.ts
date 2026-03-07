import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerModule,
  getModule,
  getAllModules,
  getRegisteredSlugs,
  _clearRegistry,
  type ModuleDefinition,
} from '../module-registry.js';
import { buildToolsFromBindings, type ToolAdapterDeps } from '../tool-adapter.js';
import type { ArtifactModuleBinding, ModuleDbCallbacks, ModuleExecutionContext } from '@camello/shared/types';

// Side-effect import: registers qualify_lead, book_meeting, send_followup.
// Must happen before any _clearRegistry() calls.
import '../modules/index.js';

// Capture references to real module definitions before any registry clears.
const qualifyLeadDef = getModule('qualify_lead')!;
const bookMeetingDef = getModule('book_meeting')!;
const sendFollowupDef = getModule('send_followup')!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockDbCallbacks(): ModuleDbCallbacks {
  return {
    insertLead: vi.fn().mockResolvedValue('lead-001'),
    insertModuleExecution: vi.fn().mockResolvedValue('exec-001'),
    updateModuleExecution: vi.fn().mockResolvedValue(undefined),
    updateConversationStatus: vi.fn().mockResolvedValue(undefined),
    getLeadByConversation: vi.fn().mockResolvedValue(null),
    checkModuleExecutionExists: vi.fn().mockResolvedValue(false),
    checkQueuedFollowupExists: vi.fn().mockResolvedValue(false),
  };
}

function makeDeps(overrides?: Partial<ToolAdapterDeps>): ToolAdapterDeps {
  return {
    tenantId: 'tenant-001',
    artifactId: 'artifact-001',
    conversationId: 'conv-001',
    customerId: 'cust-001',
    triggerMessageId: 'msg-001',
    db: mockDbCallbacks(),
    onApprovalNeeded: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Minimal Zod-like schema for testing (passes through any value)
const anySchema = {
  parse: (v: unknown) => v,
  _def: {},
  _output: {} as any,
  _input: {} as any,
} as any;

function makeTestModule(slug: string, overrides?: Partial<ModuleDefinition>): ModuleDefinition {
  return {
    slug,
    name: slug.replace(/_/g, ' '),
    description: `Test module: ${slug}`,
    category: 'sales',
    riskTier: 'low',
    inputSchema: anySchema,
    outputSchema: anySchema,
    execute: vi.fn().mockResolvedValue({ result: 'ok' }),
    formatForLLM: (output: any) => `Result: ${JSON.stringify(output)}`,
    ...overrides,
  };
}

function makeBinding(
  moduleSlug: string,
  autonomyLevel: ArtifactModuleBinding['autonomyLevel'] = 'fully_autonomous',
): ArtifactModuleBinding {
  return {
    moduleSlug,
    moduleId: `module-${moduleSlug}`,
    moduleName: moduleSlug.replace(/_/g, ' '),
    moduleDescription: `Test: ${moduleSlug}`,
    autonomyLevel,
    configOverrides: {},
    inputSchema: {},
  };
}

function makeCtx(dbOverrides?: Partial<ModuleDbCallbacks>): ModuleExecutionContext {
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
      ...dbOverrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Registry Tests
// ---------------------------------------------------------------------------

describe('Module Registry', () => {
  beforeEach(() => {
    _clearRegistry();
  });

  it('registers and retrieves a module', () => {
    const mod = makeTestModule('test_module');
    registerModule(mod);
    expect(getModule('test_module')).toBe(mod);
  });

  it('returns undefined for unregistered module', () => {
    expect(getModule('nonexistent')).toBeUndefined();
  });

  it('throws on duplicate registration', () => {
    const mod = makeTestModule('dup_module');
    registerModule(mod);
    expect(() => registerModule(mod)).toThrow('Module "dup_module" already registered');
  });

  it('lists all registered modules', () => {
    registerModule(makeTestModule('mod_a'));
    registerModule(makeTestModule('mod_b'));
    registerModule(makeTestModule('mod_c'));

    const all = getAllModules();
    expect(all).toHaveLength(3);
    expect(all.map((m) => m.slug).sort()).toEqual(['mod_a', 'mod_b', 'mod_c']);
  });

  it('lists registered slugs', () => {
    registerModule(makeTestModule('alpha'));
    registerModule(makeTestModule('beta'));
    expect(getRegisteredSlugs().sort()).toEqual(['alpha', 'beta']);
  });

  it('clears registry', () => {
    registerModule(makeTestModule('temp'));
    _clearRegistry();
    expect(getAllModules()).toHaveLength(0);
    expect(getModule('temp')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// qualify_lead scoring tests (uses captured module definition directly)
// ---------------------------------------------------------------------------

describe('qualify_lead scoring', () => {
  it('scores HOT when budget + immediate timeline', async () => {
    const ctx = makeCtx();
    const result = await qualifyLeadDef.execute(
      { budget: '$10k', timeline: 'immediate', needs: ['crm'], conversation_summary: 'test' },
      ctx,
    );
    expect(result).toEqual({ score: 'hot', tags: ['crm'], next_action: 'offer_meeting', stage: 'proposal', estimated_value: 10000, numeric_score: 65 });
  });

  it('scores WARM when budget but no immediate timeline', async () => {
    const ctx = makeCtx();
    const result = await qualifyLeadDef.execute(
      { budget: '$5k', timeline: '1-3months', needs: [], conversation_summary: 'test' },
      ctx,
    );
    expect(result).toEqual({ score: 'warm', tags: [], next_action: 'continue_qualifying', stage: 'qualifying', estimated_value: 5000, numeric_score: 45 });
  });

  it('scores WARM when timeline but no budget', async () => {
    const ctx = makeCtx();
    const result = await qualifyLeadDef.execute(
      { timeline: 'immediate', needs: ['support'], conversation_summary: 'test' },
      ctx,
    );
    expect(result).toEqual({ score: 'warm', tags: ['support'], next_action: 'continue_qualifying', stage: 'qualifying', estimated_value: null, numeric_score: 35 });
  });

  it('scores COLD when neither budget nor timeline', async () => {
    const ctx = makeCtx();
    const result = await qualifyLeadDef.execute(
      { needs: [], conversation_summary: 'just browsing' },
      ctx,
    );
    expect(result).toEqual({ score: 'cold', tags: [], next_action: 'continue_conversation', stage: 'new', estimated_value: null, numeric_score: 0 });
  });

  it('calls insertLead callback', async () => {
    const insertLead = vi.fn().mockResolvedValue('lead-001');
    const ctx = makeCtx({ insertLead });

    await qualifyLeadDef.execute(
      { budget: '$10k', timeline: 'immediate', needs: ['crm'], conversation_summary: 'hot lead' },
      ctx,
    );

    expect(insertLead).toHaveBeenCalledWith({
      tenantId: 'tenant-001',
      customerId: 'cust-001',
      conversationId: 'conv-001',
      score: 'hot',
      tags: ['crm'],
      budget: '$10k',
      timeline: 'immediate',
      summary: 'hot lead',
      stage: 'proposal',
      estimatedValue: 10000,
    });
  });
});

// ---------------------------------------------------------------------------
// book_meeting stub tests
// ---------------------------------------------------------------------------

describe('book_meeting', () => {
  it('returns booked=false when no calendarUrl configured', async () => {
    const ctx = makeCtx();
    const result = await bookMeetingDef.execute(
      { preferred_date: '2026-03-01', topic: 'demo', duration_minutes: 30 },
      ctx,
    ) as { booked: boolean; datetime: string };
    expect(result.booked).toBe(false);
    expect(result.datetime).toBe('2026-03-01');
  });

  it('returns booked=true with calendar link when calendarUrl configured', async () => {
    const ctx = makeCtx();
    ctx.configOverrides = { calendarUrl: 'https://calendly.com/test' };
    const result = await bookMeetingDef.execute(
      { preferred_date: '2026-03-01', topic: 'demo', duration_minutes: 30 },
      ctx,
    ) as { booked: boolean; calendar_link: string };
    expect(result.booked).toBe(true);
    expect(result.calendar_link).toBe('https://calendly.com/test');
  });
});

// ---------------------------------------------------------------------------
// send_followup stub tests
// ---------------------------------------------------------------------------

describe('send_followup', () => {
  it('queues follow-up with scheduled_at 24h from now', async () => {
    const ctx = makeCtx();
    const result = await sendFollowupDef.execute(
      { message_template: 'gentle_reminder' },
      ctx,
    ) as { followup_status: string; followup_number: number; scheduled_at: string };
    expect(result.followup_status).toBe('queued');
    expect(result.followup_number).toBe(1);
    expect(new Date(result.scheduled_at).getTime()).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// Tool Adapter Tests
// ---------------------------------------------------------------------------

describe('Tool Adapter — buildToolsFromBindings', () => {
  beforeEach(() => {
    _clearRegistry();
  });

  it('returns empty object when no bindings', () => {
    const tools = buildToolsFromBindings([], makeDeps());
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it('skips bindings with unregistered modules', () => {
    const tools = buildToolsFromBindings([makeBinding('nonexistent')], makeDeps());
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it('creates tool entries for registered modules', () => {
    registerModule(makeTestModule('test_action'));
    const tools = buildToolsFromBindings([makeBinding('test_action')], makeDeps());
    expect(Object.keys(tools)).toEqual(['test_action']);
  });

  describe('autonomy gating', () => {
    it('suggest_only: logs pending execution and returns suggestion text', async () => {
      const executeFn = vi.fn().mockResolvedValue({ done: true });
      registerModule(makeTestModule('suggest_mod', { execute: executeFn }));

      const db = mockDbCallbacks();
      const onApprovalNeeded = vi.fn().mockResolvedValue(undefined);
      const tools = buildToolsFromBindings(
        [makeBinding('suggest_mod', 'suggest_only')],
        makeDeps({ db, onApprovalNeeded }),
      );

      const result = await (tools['suggest_mod'] as any).execute({});

      expect(executeFn).not.toHaveBeenCalled();
      expect(db.insertModuleExecution).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
      expect(result).toContain('Action suggested');
    });

    it('draft_and_approve: queues for approval and broadcasts', async () => {
      const executeFn = vi.fn().mockResolvedValue({ done: true });
      registerModule(makeTestModule('approve_mod', { execute: executeFn }));

      const db = mockDbCallbacks();
      const onApprovalNeeded = vi.fn().mockResolvedValue(undefined);
      const tools = buildToolsFromBindings(
        [makeBinding('approve_mod', 'draft_and_approve')],
        makeDeps({ db, onApprovalNeeded }),
      );

      const result = await (tools['approve_mod'] as any).execute({ input: 'test' });

      expect(executeFn).not.toHaveBeenCalled();
      expect(db.insertModuleExecution).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
      await new Promise((r) => setTimeout(r, 10));
      expect(onApprovalNeeded).toHaveBeenCalled();
      expect(result).toContain('queued for approval');
    });

    it('fully_autonomous: executes immediately and logs result', async () => {
      const executeFn = vi.fn().mockResolvedValue({ score: 'hot', tags: ['crm'], next_action: 'offer_meeting' });
      const formatFn = (output: any) => `Lead: ${output.score}`;
      registerModule(makeTestModule('auto_mod', { execute: executeFn, formatForLLM: formatFn }));

      const db = mockDbCallbacks();
      const tools = buildToolsFromBindings(
        [makeBinding('auto_mod', 'fully_autonomous')],
        makeDeps({ db }),
      );

      const result = await (tools['auto_mod'] as any).execute({ budget: '$10k' });

      expect(executeFn).toHaveBeenCalled();
      expect(db.insertModuleExecution).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'executed' }),
      );
      expect(result).toBe('Lead: hot');
    });
  });

  describe('idempotency (guardrail #2)', () => {
    it('returns cached result on second call within same pipeline', async () => {
      const executeFn = vi.fn().mockResolvedValue({ result: 'ok' });
      registerModule(makeTestModule('idempotent_mod', { execute: executeFn }));

      const tools = buildToolsFromBindings([makeBinding('idempotent_mod')], makeDeps());
      const toolDef = tools['idempotent_mod'] as any;

      const result1 = await toolDef.execute({ input: 'first' });
      const result2 = await toolDef.execute({ input: 'second' });

      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
    });
  });

  describe('timeout handling', () => {
    it('returns failure message on timeout', async () => {
      const slowExecute = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ done: true }), 60_000)),
      );
      registerModule(makeTestModule('slow_mod', { execute: slowExecute }));

      const db = mockDbCallbacks();
      const tools = buildToolsFromBindings([makeBinding('slow_mod')], makeDeps({ db }));
      const result = await (tools['slow_mod'] as any).execute({});

      expect(result).toContain('failed');
      expect(result).toContain('timed out');
      expect(db.insertModuleExecution).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    }, 20_000);

    it('returns failure message on execution error', async () => {
      const failingExecute = vi.fn().mockRejectedValue(new Error('DB connection lost'));
      registerModule(makeTestModule('fail_mod', { execute: failingExecute }));

      const db = mockDbCallbacks();
      const tools = buildToolsFromBindings([makeBinding('fail_mod')], makeDeps({ db }));
      const result = await (tools['fail_mod'] as any).execute({});

      expect(result).toContain('failed');
      expect(result).toContain('DB connection lost');
      expect(db.insertModuleExecution).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });

  describe('non-blocking broadcast (guardrail #4)', () => {
    it('does not fail if onApprovalNeeded throws', async () => {
      registerModule(makeTestModule('broadcast_mod'));

      const onApprovalNeeded = vi.fn().mockRejectedValue(new Error('Supabase down'));
      const tools = buildToolsFromBindings(
        [makeBinding('broadcast_mod', 'draft_and_approve')],
        makeDeps({ onApprovalNeeded }),
      );

      const result = await (tools['broadcast_mod'] as any).execute({});
      expect(result).toContain('queued for approval');
    });
  });
});

// ---------------------------------------------------------------------------
// formatForLLM tests (uses captured module definitions directly)
// ---------------------------------------------------------------------------

describe('formatForLLM', () => {
  it('qualify_lead: formats hot lead correctly', () => {
    const formatted = qualifyLeadDef.formatForLLM({ score: 'hot', tags: ['crm', 'enterprise'], next_action: 'offer_meeting' });
    expect(formatted).toContain('hot');
    expect(formatted).toContain('crm');
    expect(formatted).toContain('offer_meeting');
  });

  it('book_meeting: formats unbooked meeting', () => {
    const formatted = bookMeetingDef.formatForLLM({ booked: false, datetime: '2026-03-01', alternative_slots: ['Team will confirm'] });
    expect(formatted).toContain('2026-03-01');
    expect(formatted).toContain('Team will confirm');
  });

  it('send_followup: formats queued followup', () => {
    const formatted = sendFollowupDef.formatForLLM({ sent: false, channel: 'pending', followup_number: 1 });
    expect(formatted).toContain('queued');
    expect(formatted).toContain('#1');
  });
});
