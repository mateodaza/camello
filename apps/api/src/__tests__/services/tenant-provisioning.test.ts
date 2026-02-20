import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports via vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  clerkGetOrg: vi.fn(),
  clerkUpdateMeta: vi.fn(),
  clearOrgCache: vi.fn(),
  tenantInsert: vi.fn(),
  memberInsert: vi.fn(),
  customerInsert: vi.fn(),
  customerSelect: vi.fn(),
}));

vi.mock('../../lib/clerk.js', () => ({
  clerk: {
    organizations: {
      getOrganization: mocks.clerkGetOrg,
      updateOrganizationMetadata: mocks.clerkUpdateMeta,
    },
  },
}));

vi.mock('../../trpc/context.js', () => ({
  clearOrgCache: mocks.clearOrgCache,
}));

// Mock createTenantDb to capture DB operations
vi.mock('@camello/db', () => {
  const mockTransaction = vi.fn(async (fn: any) => {
    const tx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: mocks.tenantInsert,
          }),
        }),
      }),
    };

    // Override insert to detect which table is being used
    tx.insert = vi.fn((table: any) => {
      const tableName = table?.toString?.() ?? '';
      if (tableName.includes?.('tenant_members') || table === 'tenant_members') {
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: mocks.memberInsert,
          }),
        };
      }
      if (tableName.includes?.('customers') || table === 'customers') {
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: mocks.customerInsert,
            }),
          }),
        };
      }
      // Default: tenants table
      return {
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: mocks.tenantInsert,
          }),
        }),
      };
    });

    return fn(tx);
  });

  const mockQuery = vi.fn(async (fn: any) => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: mocks.customerSelect,
          }),
        }),
      }),
    };
    return fn(db);
  });

  return {
    createTenantDb: vi.fn(() => ({
      transaction: mockTransaction,
      query: mockQuery,
      tenantId: 'mock-tenant-id',
    })),
    tenants: { id: 'tenants.id' },
    tenantMembers: {},
    customers: { id: 'customers.id', tenantId: 'customers.tenantId', channel: 'customers.channel', externalId: 'customers.externalId' },
  };
});

vi.mock('@camello/shared/constants', () => ({
  COST_BUDGET_DEFAULTS: { starter: 5.0, growth: 25.0, scale: 100.0 },
}));

import { orgIdToTenantId, deriveSlug, provisionTenant } from '../../services/tenant-provisioning.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tenant-provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: org has no existing metadata
    mocks.clerkGetOrg.mockResolvedValue({ publicMetadata: {} });
    mocks.clerkUpdateMeta.mockResolvedValue({});
    // Default: tenant insert succeeds (newly created)
    mocks.tenantInsert.mockResolvedValue([{ id: 'some-uuid' }]);
    mocks.memberInsert.mockResolvedValue(undefined);
    mocks.customerInsert.mockResolvedValue([{ id: 'preview-customer-id' }]);
    mocks.customerSelect.mockResolvedValue([]);
  });

  describe('orgIdToTenantId', () => {
    it('returns deterministic UUID for same orgId', () => {
      const a = orgIdToTenantId('org_abc123');
      const b = orgIdToTenantId('org_abc123');
      expect(a).toBe(b);
      // Should be a valid UUID format
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('returns different UUIDs for different orgIds', () => {
      const a = orgIdToTenantId('org_abc123');
      const b = orgIdToTenantId('org_xyz789');
      expect(a).not.toBe(b);
    });
  });

  describe('deriveSlug', () => {
    it('handles normal names', () => {
      const slug = deriveSlug('Acme Corp');
      expect(slug).toMatch(/^acme-corp-[a-z0-9]{4}$/);
    });

    it('handles special characters', () => {
      const slug = deriveSlug('My Company!!! @#$');
      expect(slug).toMatch(/^my-company-[a-z0-9]{4}$/);
    });

    it('truncates long names to 40 chars base', () => {
      const longName = 'A'.repeat(100);
      const slug = deriveSlug(longName);
      // base (max 40) + '-' + suffix (4) = max 45
      expect(slug.length).toBeLessThanOrEqual(45);
    });

    it('handles empty-ish names gracefully', () => {
      const slug = deriveSlug('!!!');
      expect(slug).toMatch(/^tenant-[a-z0-9]{4}$/);
    });

    it('always includes a random suffix', () => {
      const slugs = new Set(Array.from({ length: 10 }, () => deriveSlug('test')));
      // With random suffixes, should get multiple different slugs
      expect(slugs.size).toBeGreaterThan(1);
    });
  });

  describe('provisionTenant', () => {
    it('creates tenant and updates Clerk metadata when org is unprovisioned', async () => {
      const result = await provisionTenant({
        orgId: 'org_new',
        orgName: 'New Corp',
        creatorUserId: 'user_123',
      });

      expect(result.tenantId).toBe(orgIdToTenantId('org_new'));
      expect(result.alreadyExisted).toBe(false);
      expect(mocks.clerkUpdateMeta).toHaveBeenCalledWith(
        'org_new',
        { publicMetadata: { camello_tenant_id: result.tenantId } },
      );
      expect(mocks.clearOrgCache).toHaveBeenCalledWith('org_new');
    });

    it('returns alreadyExisted: true when tenant row already exists', async () => {
      // ON CONFLICT DO NOTHING → RETURNING returns empty array
      mocks.tenantInsert.mockResolvedValue([]);

      const result = await provisionTenant({
        orgId: 'org_existing',
        orgName: 'Existing Corp',
        creatorUserId: 'user_123',
      });

      expect(result.alreadyExisted).toBe(true);
    });

    it('works with null creatorUserId (no preview customer)', async () => {
      const result = await provisionTenant({
        orgId: 'org_webhook',
        orgName: 'Webhook Corp',
        creatorUserId: null,
      });

      expect(result.tenantId).toBeTruthy();
      expect(result.previewCustomerId).toBeNull();
    });

    it('throws on malformed (non-UUID) camello_tenant_id in metadata', async () => {
      mocks.clerkGetOrg.mockResolvedValue({
        publicMetadata: { camello_tenant_id: 'not-a-uuid' },
      });

      await expect(
        provisionTenant({ orgId: 'org_bad', orgName: 'Corp', creatorUserId: null }),
      ).rejects.toThrow(/malformed camello_tenant_id/);
    });

    it('throws when metadata points to non-existent tenant (data corruption)', async () => {
      mocks.clerkGetOrg.mockResolvedValue({
        publicMetadata: { camello_tenant_id: 'b0b0b0b0-0000-0000-0000-000000000099' },
      });
      // Legacy DB query returns empty — tenant doesn't exist
      mocks.customerSelect.mockResolvedValue([]);

      await expect(
        provisionTenant({ orgId: 'org_corrupted', orgName: 'Corp', creatorUserId: null }),
      ).rejects.toThrow(/that tenant does not exist/);
    });

    it('adopts zero-member legacy tenant with null creator (webhook path)', async () => {
      const legacyTenantId = 'a0a0a0a0-0000-0000-0000-000000000001';
      let queryCallCount = 0;
      mocks.clerkGetOrg.mockResolvedValue({
        publicMetadata: { camello_tenant_id: legacyTenantId },
      });
      // Query calls: 1st = tenant row check, 2nd = member list (empty)
      mocks.customerSelect.mockImplementation(() => {
        queryCallCount++;
        if (queryCallCount === 1) return [{ id: legacyTenantId }]; // tenant exists
        return []; // no members — fresh seed
      });
      mocks.tenantInsert.mockResolvedValue([]);

      const result = await provisionTenant({
        orgId: 'org_legacy',
        orgName: 'Legacy Corp',
        creatorUserId: null,
      });

      expect(result.tenantId).toBe(legacyTenantId);
      expect(result.alreadyExisted).toBe(true);
    });

    it('blocks null-creator adoption of occupied legacy tenant', async () => {
      const legacyTenantId = 'a0a0a0a0-0000-0000-0000-000000000001';
      let queryCallCount = 0;
      mocks.clerkGetOrg.mockResolvedValue({
        publicMetadata: { camello_tenant_id: legacyTenantId },
      });
      // Query calls: 1st = tenant exists, 2nd = member list (has members)
      mocks.customerSelect.mockImplementation(() => {
        queryCallCount++;
        if (queryCallCount === 1) return [{ id: legacyTenantId }]; // tenant exists
        return [{ id: 'member-id', userId: 'user_owner' }]; // occupied
      });

      await expect(
        provisionTenant({ orgId: 'org_webhook_hijack', orgName: 'Corp', creatorUserId: null }),
      ).rejects.toThrow(/caller is not an existing member/);
    });

    it('adopts legacy tenant when caller is already a member', async () => {
      const legacyTenantId = 'a0a0a0a0-0000-0000-0000-000000000001';
      let queryCallCount = 0;
      mocks.clerkGetOrg.mockResolvedValue({
        publicMetadata: { camello_tenant_id: legacyTenantId },
      });
      // Query calls: 1st = tenant row check, 2nd = hasAnyMembers (occupied),
      // 3rd = callerMembership (found)
      mocks.customerSelect.mockImplementation(() => {
        queryCallCount++;
        if (queryCallCount === 1) return [{ id: legacyTenantId }]; // tenant exists
        if (queryCallCount === 2) return [{ id: 'member-id' }]; // has members
        return [{ id: 'member-id' }]; // caller is a member
      });
      mocks.tenantInsert.mockResolvedValue([]);

      const result = await provisionTenant({
        orgId: 'org_legacy_member',
        orgName: 'Legacy Corp',
        creatorUserId: 'user_existing',
      });

      expect(result.tenantId).toBe(legacyTenantId);
    });

    it('blocks adoption when caller is not a member of existing tenant', async () => {
      const legacyTenantId = 'a0a0a0a0-0000-0000-0000-000000000001';
      let queryCallCount = 0;
      mocks.clerkGetOrg.mockResolvedValue({
        publicMetadata: { camello_tenant_id: legacyTenantId },
      });
      // Query calls: 1st = tenant row check, 2nd = hasAnyMembers (occupied),
      // 3rd = callerMembership (not found — different user)
      mocks.customerSelect.mockImplementation(() => {
        queryCallCount++;
        if (queryCallCount === 1) return [{ id: legacyTenantId }]; // tenant exists
        if (queryCallCount === 2) return [{ id: 'member-id' }]; // has members
        return []; // caller not found
      });

      await expect(
        provisionTenant({ orgId: 'org_hijack', orgName: 'Corp', creatorUserId: 'user_attacker' }),
      ).rejects.toThrow(/caller is not an existing member/);
    });

    it('allows adoption of zero-member tenant (fresh seed with creator)', async () => {
      const legacyTenantId = 'a0a0a0a0-0000-0000-0000-000000000001';
      let queryCallCount = 0;
      mocks.clerkGetOrg.mockResolvedValue({
        publicMetadata: { camello_tenant_id: legacyTenantId },
      });
      // Query calls: 1st = tenant exists, 2nd = member list (empty)
      mocks.customerSelect.mockImplementation(() => {
        queryCallCount++;
        if (queryCallCount === 1) return [{ id: legacyTenantId }]; // tenant exists
        return []; // no members — fresh seed
      });
      mocks.tenantInsert.mockResolvedValue([]);

      const result = await provisionTenant({
        orgId: 'org_fresh_seed',
        orgName: 'Corp',
        creatorUserId: 'user_first',
      });

      expect(result.tenantId).toBe(legacyTenantId);
    });

    it('skips metadata write when already correct', async () => {
      const tenantId = orgIdToTenantId('org_correct');
      mocks.clerkGetOrg.mockResolvedValue({
        publicMetadata: { camello_tenant_id: tenantId },
      });

      await provisionTenant({ orgId: 'org_correct', orgName: 'Corp', creatorUserId: null });

      expect(mocks.clerkUpdateMeta).not.toHaveBeenCalled();
    });

    it('retries on slug unique violation (23505)', async () => {
      // First attempt: slug collision
      let callCount = 0;
      mocks.tenantInsert.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('unique violation') as any;
          err.code = '23505';
          throw err;
        }
        return [{ id: 'tenant-id' }];
      });

      const result = await provisionTenant({
        orgId: 'org_slug_conflict',
        orgName: 'Duplicate Name',
        creatorUserId: null,
      });

      expect(result.tenantId).toBeTruthy();
      expect(callCount).toBe(2); // retried once
    });
  });
});
