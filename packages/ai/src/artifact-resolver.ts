import type {
  ArtifactResolverInput,
  ArtifactResolverOutput,
  ArtifactResolver,
  Channel,
} from '@camello/shared/types';
import { NoArtifactAvailableError } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Dependency injection: DB lookup callbacks
// ---------------------------------------------------------------------------

interface ArtifactRow {
  artifactId: string;
  artifactName: string;
  artifactType: string;
}

export interface ResolverDeps {
  /**
   * Find the customer's active conversation with an active artifact assignment.
   * Query: conversations JOIN conversation_artifact_assignments
   * WHERE conversations.customer_id = ? AND conversations.status = 'active'
   *   AND assignments.is_active = true AND assignments.ended_at IS NULL
   */
  findActiveConversation: (customerId: string) => Promise<
    (ArtifactRow & { conversationId: string }) | null
  >;

  /**
   * Find the first matching routing rule for this channel + intent + confidence.
   * Query: artifact_routing_rules JOIN artifacts
   * WHERE is_active = true AND (channel IS NULL OR channel = ?)
   *   AND (intent IS NULL OR intent = ?) AND min_confidence <= ?
   *   AND artifacts.is_active = true
   * ORDER BY priority ASC LIMIT 1
   */
  findMatchingRule: (
    channel: Channel,
    intentType: string,
    confidence: number,
  ) => Promise<ArtifactRow | null>;

  /**
   * Get the tenant's default artifact, or first active artifact as ultimate fallback.
   * Query: tenants.default_artifact_id → artifacts WHERE is_active = true
   *   OR first active artifact by created_at ASC
   */
  getDefaultArtifact: () => Promise<ArtifactRow | null>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create an artifact resolver bound to tenant-scoped DB lookups.
 *
 * Priority order (from artifact-resolver.ts contract):
 * 1. EXISTING CONVERSATION — continuity > routing rules
 * 2. ROUTING RULES — tenant-configured channel+intent routing
 * 3. DEFAULT / FALLBACK — tenant's default artifact or first active
 *
 * The resolver NEVER creates artifacts — only selects from existing active ones.
 */
export function createArtifactResolver(deps: ResolverDeps): ArtifactResolver {
  return {
    async resolve(input: ArtifactResolverInput): Promise<ArtifactResolverOutput> {
      const { tenantId, channel, intent } = input;

      // 1. EXISTING CONVERSATION: if customer has an active conversation, continue with its artifact
      if (!input.existingConversationId) {
        const active = await deps.findActiveConversation(input.customerId);
        if (active) {
          return {
            artifactId: active.artifactId,
            artifactName: active.artifactName,
            artifactType: active.artifactType,
            source: 'existing_conversation',
            conversationId: active.conversationId,
            isNewConversation: false,
          };
        }
      } else {
        // Caller already knows the conversation — but we still look up the assigned artifact
        const active = await deps.findActiveConversation(input.customerId);
        if (active && active.conversationId === input.existingConversationId) {
          return {
            artifactId: active.artifactId,
            artifactName: active.artifactName,
            artifactType: active.artifactType,
            source: 'existing_conversation',
            conversationId: active.conversationId,
            isNewConversation: false,
          };
        }
      }

      // 2. ROUTING RULES: match channel + intent + confidence
      const rule = await deps.findMatchingRule(
        channel,
        intent.type,
        intent.confidence,
      );
      if (rule) {
        return {
          artifactId: rule.artifactId,
          artifactName: rule.artifactName,
          artifactType: rule.artifactType,
          source: 'route_rule',
          isNewConversation: true,
        };
      }

      // 3. DEFAULT / FALLBACK
      const fallback = await deps.getDefaultArtifact();
      if (fallback) {
        return {
          artifactId: fallback.artifactId,
          artifactName: fallback.artifactName,
          artifactType: fallback.artifactType,
          source: 'tenant_default_fallback',
          isNewConversation: true,
        };
      }

      // No artifact available — tenant setup is broken
      throw new NoArtifactAvailableError(tenantId, channel);
    },
  };
}
