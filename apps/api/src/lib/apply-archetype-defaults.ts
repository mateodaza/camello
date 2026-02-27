import { inArray } from 'drizzle-orm';
import { modules, artifactModules } from '@camello/db';
import type { TenantTransaction } from '@camello/db';
import type { ArtifactType, AutonomyLevel } from '@camello/shared/types';
import { getArchetype, type ArchetypeDefinition } from '@camello/ai';
import { getModule, type RiskTier } from '@camello/ai';

/** Map risk tier → default autonomy level for new bindings. */
function autonomyFromRisk(tier: RiskTier): AutonomyLevel {
  return tier === 'high' ? 'draft_and_approve' : 'fully_autonomous';
}

/**
 * Auto-bind archetype-specific modules to a newly created artifact.
 * Autonomy defaults are derived from each module's riskTier.
 * Used by both `artifact.create` and `onboarding.setupArtifact`.
 */
export async function applyArchetypeDefaults(
  tx: TenantTransaction,
  artifactId: string,
  tenantId: string,
  type: ArtifactType,
): Promise<void> {
  const archetype: ArchetypeDefinition | undefined = getArchetype(type);
  const slugs = archetype?.moduleSlugs ?? [];
  if (slugs.length === 0) return;

  // modules table is global (no RLS) — query by slug
  const moduleRows = await tx
    .select({ id: modules.id, slug: modules.slug })
    .from(modules)
    .where(inArray(modules.slug, slugs));

  const foundSlugs = new Set(moduleRows.map((m) => m.slug));
  const missing = slugs.filter((s) => !foundSlugs.has(s));
  if (missing.length > 0) {
    throw new Error(`applyArchetypeDefaults: missing module slugs in DB: ${missing.join(', ')}. Run module seed migration first.`);
  }

  if (moduleRows.length > 0) {
    await tx.insert(artifactModules).values(
      moduleRows.map((m) => {
        const def = getModule(m.slug);
        const autonomy = def ? autonomyFromRisk(def.riskTier) : 'draft_and_approve' as const;
        return {
          artifactId,
          moduleId: m.id,
          tenantId,
          autonomyLevel: autonomy,
          autonomySource: 'default' as const,
        };
      }),
    );
  }
}
