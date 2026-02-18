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

// === Artifact Resolver ===

export type { ArtifactResolverInput, ArtifactResolverOutput, ArtifactResolverSource, ArtifactResolver } from './artifact-resolver.js';
export { NoArtifactAvailableError } from './artifact-resolver.js';
