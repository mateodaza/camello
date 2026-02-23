import { inArray } from 'drizzle-orm';
import { modules, artifactModules } from '@camello/db';
import type { TenantTransaction } from '@camello/db';
import type { ArtifactType } from '@camello/shared/types';
import { ARCHETYPE_MODULE_SLUGS } from '@camello/ai';

/**
 * Auto-bind archetype-specific modules to a newly created artifact.
 * Used by both `artifact.create` and `onboarding.setupArtifact`.
 */
export async function applyArchetypeDefaults(
  tx: TenantTransaction,
  artifactId: string,
  tenantId: string,
  type: ArtifactType,
): Promise<void> {
  const slugs = ARCHETYPE_MODULE_SLUGS[type];
  if (slugs.length === 0) return;

  // modules table is global (no RLS) — query by slug
  const moduleRows = await tx
    .select({ id: modules.id })
    .from(modules)
    .where(inArray(modules.slug, slugs));

  if (moduleRows.length > 0) {
    await tx.insert(artifactModules).values(
      moduleRows.map((m) => ({
        artifactId,
        moduleId: m.id,
        tenantId,
        autonomyLevel: 'draft_and_approve' as const,
      })),
    );
  }
}
