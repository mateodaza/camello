import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @camello/db — must use vi.hoisted for mock refs used in vi.mock factory
// ---------------------------------------------------------------------------

const dbMocks = vi.hoisted(() => ({
  modules: { id: 'modules', slug: 'slug' },
  artifactModules: { id: 'artifactModules' },
}));

vi.mock('@camello/db', () => ({
  modules: dbMocks.modules,
  artifactModules: dbMocks.artifactModules,
}));

// ---------------------------------------------------------------------------
// Mock drizzle-orm (inArray)
// ---------------------------------------------------------------------------
vi.mock('drizzle-orm', () => ({
  inArray: vi.fn((_col: unknown, vals: string[]) => ({ _type: 'inArray', vals })),
}));

import { applyArchetypeDefaults } from '../lib/apply-archetype-defaults.js';
import { ARCHETYPE_MODULE_SLUGS } from '@camello/ai';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';

function makeMockTx() {
  const insertValuesFn = vi.fn().mockReturnThis();
  const selectFromWhereFn = vi.fn().mockResolvedValue([]);
  const fromFn = vi.fn().mockReturnValue({ where: selectFromWhereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  const insertFn = vi.fn().mockReturnValue({ values: insertValuesFn });

  const tx = {
    select: selectFn,
    insert: insertFn,
  } as Any;

  return { tx, selectFn, fromFn, selectFromWhereFn, insertFn, insertValuesFn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyArchetypeDefaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing for custom type (no module slugs)', async () => {
    const { tx, selectFn, insertFn } = makeMockTx();
    await applyArchetypeDefaults(tx, ARTIFACT_ID, TENANT_ID, 'custom');
    expect(selectFn).not.toHaveBeenCalled();
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('queries and inserts modules for support type', async () => {
    const { tx, selectFromWhereFn, insertFn, insertValuesFn } = makeMockTx();
    const fakeModuleRows = [
      { id: 'mod-t1', slug: 'create_ticket' },
      { id: 'mod-t2', slug: 'escalate_to_human' },
    ];
    selectFromWhereFn.mockResolvedValue(fakeModuleRows);

    await applyArchetypeDefaults(tx, ARTIFACT_ID, TENANT_ID, 'support');

    expect(ARCHETYPE_MODULE_SLUGS.support).toEqual(['create_ticket', 'escalate_to_human']);
    expect(insertFn).toHaveBeenCalled();
    // create_ticket = low risk → fully_autonomous, escalate_to_human = medium → fully_autonomous
    expect(insertValuesFn).toHaveBeenCalledWith([
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-t1',
        tenantId: TENANT_ID,
        autonomyLevel: 'fully_autonomous',
        autonomySource: 'default',
      },
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-t2',
        tenantId: TENANT_ID,
        autonomyLevel: 'fully_autonomous',
        autonomySource: 'default',
      },
    ]);
  });

  it('queries and inserts modules for sales type', async () => {
    const { tx, selectFromWhereFn, insertFn, insertValuesFn } = makeMockTx();
    const fakeModuleRows = [
      { id: 'mod-1', slug: 'qualify_lead' },
      { id: 'mod-2', slug: 'book_meeting' },
      { id: 'mod-3', slug: 'collect_payment' },
      { id: 'mod-4', slug: 'send_quote' },
    ];
    selectFromWhereFn.mockResolvedValue(fakeModuleRows);

    await applyArchetypeDefaults(tx, ARTIFACT_ID, TENANT_ID, 'sales');

    expect(ARCHETYPE_MODULE_SLUGS.sales).toEqual(['qualify_lead', 'book_meeting', 'collect_payment', 'send_quote']);

    // qualify_lead = low → fully_autonomous, book_meeting = medium → fully_autonomous,
    // collect_payment = high → draft_and_approve, send_quote = high → draft_and_approve
    expect(insertFn).toHaveBeenCalled();
    expect(insertValuesFn).toHaveBeenCalledWith([
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-1',
        tenantId: TENANT_ID,
        autonomyLevel: 'fully_autonomous',
        autonomySource: 'default',
      },
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-2',
        tenantId: TENANT_ID,
        autonomyLevel: 'fully_autonomous',
        autonomySource: 'default',
      },
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-3',
        tenantId: TENANT_ID,
        autonomyLevel: 'draft_and_approve',
        autonomySource: 'default',
      },
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-4',
        tenantId: TENANT_ID,
        autonomyLevel: 'draft_and_approve',
        autonomySource: 'default',
      },
    ]);
  });

  it('queries and inserts modules for marketing type', async () => {
    const { tx, selectFromWhereFn, insertFn, insertValuesFn } = makeMockTx();
    const fakeModuleRows = [
      { id: 'mod-5', slug: 'send_followup' },
      { id: 'mod-6', slug: 'capture_interest' },
      { id: 'mod-7', slug: 'draft_content' },
    ];
    selectFromWhereFn.mockResolvedValue(fakeModuleRows);

    await applyArchetypeDefaults(tx, ARTIFACT_ID, TENANT_ID, 'marketing');

    expect(ARCHETYPE_MODULE_SLUGS.marketing).toEqual(['send_followup', 'capture_interest', 'draft_content']);
    // send_followup = medium → fully_autonomous, capture_interest = low → fully_autonomous,
    // draft_content = high → draft_and_approve
    expect(insertFn).toHaveBeenCalled();
    expect(insertValuesFn).toHaveBeenCalledWith([
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-5',
        tenantId: TENANT_ID,
        autonomyLevel: 'fully_autonomous',
        autonomySource: 'default',
      },
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-6',
        tenantId: TENANT_ID,
        autonomyLevel: 'fully_autonomous',
        autonomySource: 'default',
      },
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-7',
        tenantId: TENANT_ID,
        autonomyLevel: 'draft_and_approve',
        autonomySource: 'default',
      },
    ]);
  });

  it('throws when module slugs are missing from DB', async () => {
    const { tx, selectFromWhereFn } = makeMockTx();
    // Return only 2 of the 4 expected sales slugs
    selectFromWhereFn.mockResolvedValue([
      { id: 'mod-1', slug: 'qualify_lead' },
      { id: 'mod-2', slug: 'book_meeting' },
    ]);

    await expect(
      applyArchetypeDefaults(tx, ARTIFACT_ID, TENANT_ID, 'sales'),
    ).rejects.toThrow('missing module slugs in DB: collect_payment, send_quote');
  });
});
