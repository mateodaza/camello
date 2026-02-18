import { tool, type CoreTool } from 'ai';
import type { ArtifactModuleBinding, ModuleDbCallbacks, ModuleExecutionContext } from '@camello/shared/types';
import { MODULE_TIMEOUT_MS } from '@camello/shared/constants';
import { getModule, type ModuleDefinition } from './module-registry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolAdapterDeps {
  tenantId: string;
  artifactId: string;
  conversationId: string;
  customerId: string;
  /** Customer message ID that triggered this pipeline run — used for idempotency. */
  triggerMessageId: string;
  db: ModuleDbCallbacks;
  /** Broadcast approval notification. Must be non-blocking (errors swallowed). */
  onApprovalNeeded?: (executionId: string, moduleSlug: string, input: unknown) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build Vercel AI SDK tool definitions from an artifact's bound modules.
 *
 * Guardrails applied:
 * - Idempotency: (conversationId + triggerMessageId + moduleSlug) dedup within a pipeline run
 * - Autonomy gating: suggest_only / draft_and_approve / fully_autonomous
 * - Timeout: MODULE_TIMEOUT_MS per execution
 * - Non-blocking broadcast: onApprovalNeeded errors are swallowed
 */
export function buildToolsFromBindings(
  bindings: ArtifactModuleBinding[],
  deps: ToolAdapterDeps,
): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};

  // Per-pipeline-run idempotency: cache results keyed by moduleSlug
  // Prevents duplicate executions when maxSteps causes tool re-invocations
  const executionCache = new Map<string, string>();

  for (const binding of bindings) {
    const moduleDef = getModule(binding.moduleSlug);
    if (!moduleDef) continue;

    tools[binding.moduleSlug] = tool({
      description: moduleDef.description,
      parameters: moduleDef.inputSchema,
      execute: async (input: unknown) => {
        // Idempotency check: same module already called in this pipeline run
        const idempotencyKey = binding.moduleSlug;
        const cached = executionCache.get(idempotencyKey);
        if (cached) return cached;

        const result = await executeModuleTool(moduleDef, binding, input, deps);
        executionCache.set(idempotencyKey, result);
        return result;
      },
    });
  }

  return tools;
}

// ---------------------------------------------------------------------------
// Core execution logic
// ---------------------------------------------------------------------------

async function executeModuleTool(
  moduleDef: ModuleDefinition,
  binding: ArtifactModuleBinding,
  input: unknown,
  deps: ToolAdapterDeps,
): Promise<string> {
  const startTime = Date.now();

  // --- suggest_only: log but don't execute ---
  if (binding.autonomyLevel === 'suggest_only') {
    const executionId = await deps.db.insertModuleExecution({
      moduleId: binding.moduleId,
      artifactId: deps.artifactId,
      tenantId: deps.tenantId,
      conversationId: deps.conversationId,
      input,
      output: null,
      status: 'pending',
      durationMs: 0,
    });
    safeBroadcast(deps, executionId, binding.moduleSlug, input);
    return `[Action suggested: ${moduleDef.name}. Awaiting human review. Do NOT tell the customer it has been done — say the team will follow up.]`;
  }

  // --- draft_and_approve: queue for approval ---
  if (binding.autonomyLevel === 'draft_and_approve') {
    const executionId = await deps.db.insertModuleExecution({
      moduleId: binding.moduleId,
      artifactId: deps.artifactId,
      tenantId: deps.tenantId,
      conversationId: deps.conversationId,
      input,
      output: null,
      status: 'pending',
      durationMs: 0,
    });
    safeBroadcast(deps, executionId, binding.moduleSlug, input);
    return `[Action "${moduleDef.name}" queued for approval. Tell the customer their request has been noted and someone will confirm shortly.]`;
  }

  // --- fully_autonomous: execute immediately ---
  const ctx: ModuleExecutionContext = {
    tenantId: deps.tenantId,
    artifactId: deps.artifactId,
    conversationId: deps.conversationId,
    customerId: deps.customerId,
    autonomyLevel: binding.autonomyLevel,
    configOverrides: binding.configOverrides,
    db: deps.db,
  };

  try {
    const output = await Promise.race([
      moduleDef.execute(input, ctx),
      rejectAfterTimeout(MODULE_TIMEOUT_MS),
    ]);

    const durationMs = Date.now() - startTime;

    await deps.db.insertModuleExecution({
      moduleId: binding.moduleId,
      artifactId: deps.artifactId,
      tenantId: deps.tenantId,
      conversationId: deps.conversationId,
      input,
      output,
      status: 'executed',
      durationMs,
    });

    return moduleDef.formatForLLM(output);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await deps.db.insertModuleExecution({
      moduleId: binding.moduleId,
      artifactId: deps.artifactId,
      tenantId: deps.tenantId,
      conversationId: deps.conversationId,
      input,
      output: { error: errorMessage },
      status: 'failed',
      durationMs,
    });

    return `[Action "${moduleDef.name}" failed: ${errorMessage}. Apologize and offer to connect them with the team.]`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rejectAfterTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Module timed out after ${ms}ms`)), ms),
  );
}

/** Guardrail #4: broadcast must never fail the execution path. */
function safeBroadcast(
  deps: ToolAdapterDeps,
  executionId: string,
  moduleSlug: string,
  input: unknown,
): void {
  if (!deps.onApprovalNeeded) return;
  deps.onApprovalNeeded(executionId, moduleSlug, input).catch(() => {
    // Swallow — failed broadcast must not block the mutation/tool path.
  });
}
