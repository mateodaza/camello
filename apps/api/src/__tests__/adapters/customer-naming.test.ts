import { describe, it, expect } from 'vitest';
import type { TenantDb, TenantTransaction } from '@camello/db';
import { findOrCreateWhatsAppCustomer } from '../../adapters/whatsapp.js';
import { findOrCreateWebchatCustomer } from '../../webhooks/widget.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Builds a mock TenantDb for customer-naming tests.
 * - execute() resolves to {} (advisory lock no-op)
 * - insert().values().onConflictDoUpdate().returning() returns [{ id: 'test-id', xmax: '0' }]
 * - select().from().where() returns [{ count: '0' }] (0 existing display_names)
 * - update().set().where() resolves, captures set arg
 */
function makeMockTenantDb(): {
  tenantDb: TenantDb;
  getInsertValues: () => Any;
  getUpdateSet: () => Any;
} {
  let insertValues: Any = null;
  let updateSet: Any = null;

  const selectChain: Any = {
    from: () => selectChain,
    where: async () => [{ count: '0' }],
  };

  const updateChain: Any = {
    set: (s: Any) => {
      updateSet = s;
      return updateChain;
    },
    where: async () => {},
  };

  const insertChain: Any = {
    values: (v: Any) => {
      insertValues = v;
      return insertChain;
    },
    onConflictDoUpdate: () => insertChain,
    returning: async () => [{ id: 'test-id', xmax: '0' }],
  };

  const tx: Any = {
    execute: async () => ({}),
    insert: () => insertChain,
    select: () => selectChain,
    update: () => updateChain,
  };

  const tenantDb: TenantDb = {
    query: async (fn: Any) => fn(tx),
    transaction: async (fn: Any) => fn(tx as TenantTransaction),
    tenantId: TENANT_ID,
  } as Any;

  return {
    tenantDb,
    getInsertValues: () => insertValues,
    getUpdateSet: () => updateSet,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('customer naming', () => {
  it('1 — WhatsApp with profileName: name is profileName, no display_name update', async () => {
    const { tenantDb, getInsertValues, getUpdateSet } = makeMockTenantDb();

    await findOrCreateWhatsAppCustomer(tenantDb, TENANT_ID, '5491155001234', 'John Doe');

    expect(getInsertValues().name).toBe('John Doe');
    // nameValue is not null, so display_name assignment branch is skipped
    expect(getUpdateSet()).toBeNull();
  });

  it('2 — WhatsApp without profileName: name is null, Visitor 1 assigned', async () => {
    const { tenantDb, getInsertValues, getUpdateSet } = makeMockTenantDb();

    await findOrCreateWhatsAppCustomer(tenantDb, TENANT_ID, '5491155001234', undefined);

    expect(getInsertValues().name).toBeNull();
    // count=0 → seq+1=1
    expect(getUpdateSet()?.displayName).toBe('Visitor 1');
  });

  it('3 — existing customer (xmax != 0): no display_name reassignment', async () => {
    // Build a mock where insert returns xmax: '1' (ON CONFLICT hit = existing customer)
    let updateSet: Any = null;

    const insertChain: Any = {
      values: () => insertChain,
      onConflictDoUpdate: () => insertChain,
      returning: async () => [{ id: 'test-id', xmax: '1' }],
    };

    const tx: Any = {
      execute: async () => ({}),
      insert: () => insertChain,
      select: () => ({ from: () => ({ where: async () => [{ count: '0' }] }) }),
      update: () => ({
        set: (s: Any) => { updateSet = s; return { where: async () => {} }; },
      }),
    };

    const tenantDb: TenantDb = {
      query: async (fn: Any) => fn(tx),
      transaction: async (fn: Any) => fn(tx as TenantTransaction),
      tenantId: TENANT_ID,
    } as Any;

    await findOrCreateWebchatCustomer(tenantDb, TENANT_ID, 'visitor_returning');
    // xmax != '0' means existing customer — display_name should NOT be reassigned
    expect(updateSet).toBeNull();

    // Also verify WhatsApp path
    updateSet = null;
    await findOrCreateWhatsAppCustomer(tenantDb, TENANT_ID, '5491155001234', undefined);
    expect(updateSet).toBeNull();
  });

  it('4 — webchat anonymous: name is null, Visitor 1 assigned', async () => {
    const { tenantDb, getInsertValues, getUpdateSet } = makeMockTenantDb();

    await findOrCreateWebchatCustomer(tenantDb, TENANT_ID, 'visitor_abc123');

    expect(getInsertValues().name).toBeNull();
    // count=0 → seq+1=1
    expect(getUpdateSet()?.displayName).toBe('Visitor 1');
  });
});
