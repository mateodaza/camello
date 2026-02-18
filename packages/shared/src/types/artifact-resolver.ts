import type { Channel, Intent } from './index.js';

// === ARTIFACT RESOLVER CONTRACT ===
// Determines which artifact handles an inbound message.
// Called by the orchestration layer after intent classification.

/**
 * Input to the artifact resolver. Built from the inbound message
 * + intent classification + customer context.
 */
export interface ArtifactResolverInput {
  tenantId: string;
  channel: Channel;
  customerId: string;
  intent: Intent;

  // If this is a continuation, the existing conversation
  existingConversationId?: string;

  // Customer context for smarter routing
  customerTags?: string[];
  isReturningCustomer: boolean;
}

/**
 * Output of the artifact resolver. Tells the orchestration layer
 * exactly which artifact to use and why.
 */
export interface ArtifactResolverOutput {
  artifactId: string;
  artifactName: string;
  artifactType: string;
  source: ArtifactResolverSource;

  // If reusing existing conversation
  conversationId?: string;
  isNewConversation: boolean;
}

/**
 * How the artifact was selected — maps to `assignment_reason` in
 * `conversation_artifact_assignments` when a new assignment is created.
 *
 * 'existing_conversation' is resolver-only (no new assignment row created),
 * the other values are persisted as `assignment_reason` in the DB.
 */
export type ArtifactResolverSource =
  | 'existing_conversation'     // Customer has an active assignment → continue (no new row)
  | 'route_rule'                // Matched an artifact_routing_rules row
  | 'tenant_default_fallback'   // No rule matched → tenants.default_artifact_id or first active artifact
  | 'manual_override'           // Human agent reassigned
  | 'handoff';                  // Artifact-to-artifact handoff

/**
 * The resolver follows this priority order:
 *
 * 1. EXISTING CONVERSATION — If the customer has an active conversation
 *    with an active assignment (is_active = true), continue with that artifact.
 *    Rationale: continuity > routing rules. Don't bounce customers.
 *
 * 2. ROUTING RULES — Match against artifact_routing_rules table, ordered by priority ASC.
 *    First active rule matching (channel, intent, min_confidence) wins.
 *    Rationale: tenant-configured routing for specific use cases.
 *
 * 3. DEFAULT / FALLBACK — Tenant's default_artifact_id from tenants table.
 *    If default isn't set, first active artifact by created_at ASC (fail-open).
 *    Both resolve as 'tenant_default_fallback'.
 *    Rationale: every tenant has at least one artifact; this is the catch-all.
 *
 * The resolver NEVER creates artifacts. It only selects from existing active ones.
 * If no active artifact exists for the tenant, it returns an error
 * and the channel adapter should respond with a "temporarily unavailable" message.
 */
export interface ArtifactResolver {
  resolve(input: ArtifactResolverInput): Promise<ArtifactResolverOutput>;
}

/**
 * Error thrown when no artifact can be resolved for a tenant.
 * This should trigger an alert — it means the tenant's setup is broken.
 */
export class NoArtifactAvailableError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly channel: Channel,
  ) {
    super(`No active artifact available for tenant ${tenantId} on channel ${channel}`);
    this.name = 'NoArtifactAvailableError';
  }
}
