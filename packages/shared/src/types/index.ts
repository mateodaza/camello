// === Canonical Message Format ===
// Every channel adapter normalizes inbound messages to this format.

export interface CanonicalMessage {
  id: string;
  channel: Channel;
  direction: 'inbound' | 'outbound';
  tenant_id: string;
  customer_id: string;
  channel_customer_id: string;
  content: MessageContent;
  metadata: MessageMetadata;
  created_at: Date;
}

export interface MessageContent {
  type: 'text' | 'image' | 'audio' | 'document' | 'location' | 'interactive';
  text?: string;
  media_url?: string;
  mime_type?: string;
  caption?: string;
  buttons?: Array<{ id: string; title: string }>;
  location?: { lat: number; lng: number };
}

export interface MessageMetadata {
  channel_message_id: string;
  channel_timestamp: Date;
  reply_to?: string;
  raw_payload?: Record<string, unknown>;
}

// === Enums & Literals ===

export type Channel = 'whatsapp' | 'webchat' | 'instagram' | 'email' | 'voice';

export type AutonomyLevel = 'suggest_only' | 'draft_and_approve' | 'fully_autonomous';

export type ArtifactType = 'sales' | 'support' | 'marketing' | 'custom';

export type ModuleCategory = 'sales' | 'support' | 'marketing' | 'operations' | 'custom';

export type PlanTier = 'starter' | 'growth' | 'scale';

export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'paused' | 'trialing';

export type ConversationStatus = 'active' | 'resolved' | 'escalated';

export type MessageRole = 'customer' | 'artifact' | 'human' | 'system';

export type LeadScore = 'hot' | 'warm' | 'cold';

export type ModuleExecutionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export type ModelTier = 'fast' | 'balanced' | 'powerful';

// === Intent Classification ===

export interface Intent {
  type: IntentType;
  confidence: number;
  complexity: 'simple' | 'medium' | 'complex';
  requires_knowledge_base: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
  source: 'regex' | 'llm';
}

export type IntentType =
  | 'greeting'
  | 'pricing'
  | 'availability'
  | 'product_question'
  | 'complaint'
  | 'booking_request'
  | 'followup'
  | 'negotiation'
  | 'technical_support'
  | 'general_inquiry'
  | 'escalation_request'
  | 'simple_question'
  | 'farewell'
  | 'thanks';

// === Module System ===

export interface ModuleContext {
  tenant: { id: string; settings: Record<string, unknown> };
  artifact: { id: string; config: Record<string, unknown> };
  customer: { id: string; metadata: Record<string, unknown> };
  conversation: { id: string; messages: Array<{ role: string; content: string }> };
}

/** Context passed to module execute(). DB access via DI callbacks. */
export interface ModuleExecutionContext {
  tenantId: string;
  artifactId: string;
  conversationId: string;
  customerId: string;
  autonomyLevel: AutonomyLevel;
  configOverrides: Record<string, unknown>;
  db: ModuleDbCallbacks;
}

/** DI callbacks injected by apps/api — keeps @camello/ai free of @camello/db. */
export interface ModuleDbCallbacks {
  insertLead: (data: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    score: LeadScore;
    tags: string[];
    budget?: string;
    timeline?: string;
    summary?: string;
    stage?: string;
    estimatedValue?: number | null;
  }) => Promise<string>;
  insertModuleExecution: (data: {
    moduleId: string;
    moduleSlug: string;
    artifactId: string;
    tenantId: string;
    conversationId: string;
    input: unknown;
    output: unknown;
    status: ModuleExecutionStatus;
    durationMs: number;
  }) => Promise<string>;
  updateModuleExecution: (id: string, data: {
    status: ModuleExecutionStatus;
    output?: unknown;
    executedAt?: Date;
    durationMs?: number;
  }) => Promise<void>;
  updateConversationStatus: (conversationId: string, status: ConversationStatus) => Promise<void>;
  /** Optional — wired when payment creation needs to be triggered from a module. */
  insertPayment?: (data: {
    artifactId: string;
    tenantId: string;
    amount: string;
    currency: string;
    description: string;
    leadId?: string;
    conversationId?: string;
    customerId?: string;
    quoteExecutionId?: string;
  }) => Promise<string>;
}

/** Artifact module binding: the JOIN row from artifact_modules + modules. */
export interface ArtifactModuleBinding {
  moduleSlug: string;
  moduleId: string;
  moduleName: string;
  moduleDescription: string;
  autonomyLevel: AutonomyLevel;
  configOverrides: Record<string, unknown>;
  inputSchema: unknown;
}

// === RAG Types ===

export interface MatchKnowledgeRow {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
  similarity: number;
  fts_rank: number;
  rrf_score: number;
}

/** A single RAG chunk annotated with its role relative to the current intent. */
export interface RagChunk {
  content: string;
  role: 'lead' | 'support';
  docType: string | null;
}

export interface RagResult {
  directContext: RagChunk[];
  proactiveContext: RagChunk[];
  totalTokensUsed: number;
  docsRetrieved: number;
  searchSkipped: boolean;
}

// === Customer Memory ===

export type FactKey = 'name' | 'email' | 'phone' | 'preference' | 'past_topic';

export interface CustomerFact {
  key: FactKey;
  value: string;
  extractedAt: string;
  conversationId: string;
}

export type RejectionReason =
  | 'false_positive'
  | 'wrong_target'
  | 'bad_timing'
  | 'incorrect_data'
  | 'policy_violation';

export interface KnowledgeChunk {
  content: string;
  title?: string;
  sourceType: string;
  chunkIndex: number;
  metadata: Record<string, unknown>;
  embedding: number[];
}

// === Artifact Resolver ===

export type { ArtifactResolverInput, ArtifactResolverOutput, ArtifactResolverSource, ArtifactResolver } from './artifact-resolver.js';
export { NoArtifactAvailableError } from './artifact-resolver.js';
