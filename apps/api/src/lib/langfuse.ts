import { Langfuse } from 'langfuse';
import type { TelemetrySettings } from 'ai';

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _langfuse: Langfuse | null = null;

function getLangfuse(): Langfuse | null {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) return null;
  if (!_langfuse) {
    _langfuse = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASEURL,
    });
  }
  return _langfuse;
}

/** Flush pending events. Call on server shutdown. */
export async function shutdownLangfuse(): Promise<void> {
  if (_langfuse) await _langfuse.shutdownAsync();
}

// ---------------------------------------------------------------------------
// Trace context
// ---------------------------------------------------------------------------

interface TraceInput {
  tenantId: string;
  artifactId: string;
  conversationId?: string;
  channel: string;
}

interface TraceOutput {
  modelUsed?: string;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
}

export interface TraceContext {
  traceId: string;
  metadata: Record<string, string>;
  setMetadata(values: Record<string, string | undefined>): void;
  span<T>(name: string, run: () => Promise<T>): Promise<T>;
  finalize(output: TraceOutput): void;
}

export function createTrace(input: TraceInput): TraceContext {
  const langfuse = getLangfuse();
  const traceId = crypto.randomUUID();
  const metadata: Record<string, string> = {
    tenantId: input.tenantId,
    artifactId: input.artifactId,
    channel: input.channel,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  };

  // When Langfuse is configured, create a real trace; otherwise noop.
  const lfTrace = langfuse?.trace({
    id: traceId,
    name: 'handle-message',
    metadata,
  });

  return {
    traceId,
    metadata,

    setMetadata(values: Record<string, string | undefined>) {
      for (const [key, value] of Object.entries(values)) {
        if (typeof value === 'string' && value.length > 0) {
          metadata[key] = value;
        }
      }
      lfTrace?.update({ metadata });
    },

    async span<T>(name: string, run: () => Promise<T>): Promise<T> {
      const lfSpan = lfTrace?.span({ name, metadata });
      const start = Date.now();
      try {
        const result = await run();
        lfSpan?.end({ metadata: { durationMs: Date.now() - start } });
        return result;
      } catch (err) {
        lfSpan?.end({
          level: 'ERROR',
          statusMessage: err instanceof Error ? err.message : 'Unknown error',
          metadata: { durationMs: Date.now() - start },
        });
        throw err;
      }
    },

    finalize(output: TraceOutput) {
      lfTrace?.update({
        metadata: { ...metadata, ...stringifyValues(output as Record<string, unknown>) },
        output,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// AI SDK telemetry helper
// ---------------------------------------------------------------------------

export function buildTelemetry(
  functionId: string,
  metadata: Record<string, string | number | boolean>,
): TelemetrySettings | undefined {
  if (!getLangfuse()) return undefined;
  return {
    isEnabled: true,
    functionId,
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function stringifyValues(obj: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v != null) result[k] = String(v);
  }
  return result;
}
