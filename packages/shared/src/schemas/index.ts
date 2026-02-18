import { z } from 'zod';

// === Intent Classification Schema ===
// Used by LLM-based intent classifier (pass 2)

export const intentSchema = z.object({
  type: z.enum([
    'greeting', 'pricing', 'availability', 'product_question',
    'complaint', 'booking_request', 'followup', 'negotiation',
    'technical_support', 'general_inquiry', 'escalation_request',
    'simple_question', 'farewell', 'thanks',
  ]),
  confidence: z.number().min(0).max(1),
  complexity: z.enum(['simple', 'medium', 'complex']),
  requires_knowledge_base: z.boolean(),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
});

// === Autonomy & Plan Schemas ===

export const autonomyLevelSchema = z.enum([
  'suggest_only',
  'draft_and_approve',
  'fully_autonomous',
]);

export const planTierSchema = z.enum(['starter', 'growth', 'scale']);

export const channelSchema = z.enum([
  'whatsapp', 'webchat', 'instagram', 'email', 'voice',
]);

// === Module Schemas ===

export const qualifyLeadInputSchema = z.object({
  budget: z.string().optional().describe('Customer budget range or "unknown"'),
  timeline: z.enum(['immediate', '1-3months', '3-6months', 'exploring']).optional(),
  needs: z.array(z.string()).optional().describe('Identified customer needs'),
  conversation_summary: z.string().describe('Brief summary of conversation so far'),
});

export const qualifyLeadOutputSchema = z.object({
  score: z.enum(['hot', 'warm', 'cold']),
  tags: z.array(z.string()),
  next_action: z.string(),
});

export const bookMeetingInputSchema = z.object({
  preferred_date: z.string().describe('ISO date string for preferred meeting date'),
  preferred_time: z.string().optional().describe('Preferred time or "any"'),
  duration_minutes: z.number().default(30),
  topic: z.string().describe('Meeting topic/purpose'),
});

export const bookMeetingOutputSchema = z.object({
  booked: z.boolean(),
  datetime: z.string().optional(),
  calendar_link: z.string().optional(),
  alternative_slots: z.array(z.string()).optional(),
});

export const sendFollowupInputSchema = z.object({
  message_template: z.enum(['gentle_reminder', 'value_add', 'last_chance']),
  custom_note: z.string().optional(),
});

export const sendFollowupOutputSchema = z.object({
  sent: z.boolean(),
  channel: z.string(),
  followup_number: z.number(),
});
