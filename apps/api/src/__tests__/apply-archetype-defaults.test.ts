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

  it('does nothing for support type (empty module slugs)', async () => {
    const { tx, selectFn, insertFn } = makeMockTx();
    await applyArchetypeDefaults(tx, ARTIFACT_ID, TENANT_ID, 'support');
    expect(selectFn).not.toHaveBeenCalled();
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('queries and inserts modules for sales type', async () => {
    const { tx, selectFromWhereFn, insertFn, insertValuesFn } = makeMockTx();
    const fakeModuleRows = [
      { id: 'mod-1' },
      { id: 'mod-2' },
    ];
    selectFromWhereFn.mockResolvedValue(fakeModuleRows);

    await applyArchetypeDefaults(tx, ARTIFACT_ID, TENANT_ID, 'sales');

    // Should query for qualify_lead + book_meeting
    expect(ARCHETYPE_MODULE_SLUGS.sales).toEqual(['qualify_lead', 'book_meeting']);

    // Should insert artifact_modules
    expect(insertFn).toHaveBeenCalled();
    expect(insertValuesFn).toHaveBeenCalledWith([
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-1',
        tenantId: TENANT_ID,
        autonomyLevel: 'draft_and_approve',
      },
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-2',
        tenantId: TENANT_ID,
        autonomyLevel: 'draft_and_approve',
      },
    ]);
  });

  it('queries and inserts modules for marketing type', async () => {
    const { tx, selectFromWhereFn, insertFn, insertValuesFn } = makeMockTx();
    const fakeModuleRows = [{ id: 'mod-3' }];
    selectFromWhereFn.mockResolvedValue(fakeModuleRows);

    await applyArchetypeDefaults(tx, ARTIFACT_ID, TENANT_ID, 'marketing');

    expect(ARCHETYPE_MODULE_SLUGS.marketing).toEqual(['send_followup']);
    expect(insertFn).toHaveBeenCalled();
    expect(insertValuesFn).toHaveBeenCalledWith([
      {
        artifactId: ARTIFACT_ID,
        moduleId: 'mod-3',
        tenantId: TENANT_ID,
        autonomyLevel: 'draft_and_approve',
      },
    ]);
  });

  it('does not insert if no module rows found in DB', async () => {
    const { tx, selectFromWhereFn, insertFn } = makeMockTx();
    selectFromWhereFn.mockResolvedValue([]);

    await applyArchetypeDefaults(tx, ARTIFACT_ID, TENANT_ID, 'sales');

    expect(insertFn).not.toHaveBeenCalled();
  });
});
