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
  asked_pricing: z.boolean().optional().describe('Customer asked about pricing'),
  is_returning: z.boolean().optional().describe('Customer is a returning contact'),
  need_count: z.number().int().min(0).optional().describe('Explicit count of identified needs'),
});

export const leadStageSchema = z.enum([
  'new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost',
]);

export const qualifyLeadOutputSchema = z.object({
  score: z.enum(['hot', 'warm', 'cold']),
  tags: z.array(z.string()),
  next_action: z.string(),
  stage: leadStageSchema,
  estimated_value: z.number().nullable(),
  numeric_score: z.number().int(),
});

export const bookMeetingInputSchema = z.object({
  preferred_date: z.string().describe('ISO date string for preferred meeting date'),
  preferred_time: z.string().optional().describe('Preferred time or "any"'),
  duration_minutes: z.number().default(30),
  topic: z.string().describe('Meeting topic/purpose'),
});

export const bookMeetingConfigSchema = z.object({
  calendarUrl: z.string().optional(),
  businessHours: z.string().optional(),
});

export const bookMeetingOutputSchema = z.object({
  booked: z.boolean(),
  datetime: z.string().optional(),
  calendar_link: z.string().optional(),
  alternative_slots: z.array(z.string()).optional(),
  outsideHours: z.boolean().optional(),
});

export const sendFollowupInputSchema = z.object({
  message_template: z.enum(['gentle_reminder', 'value_add', 'last_chance']),
  custom_note: z.string().optional(),
});

export const sendFollowupOutputSchema = z.object({
  followup_status: z.enum(['queued', 'processed', 'sent', 'failed']),
  scheduled_at: z.string().describe('ISO date for when to send the follow-up'),
  channel: z.string(),
  followup_number: z.number(),
});

// === Collect Payment ===

export const collectPaymentInputSchema = z.object({
  amount: z.string().describe('Payment amount (e.g. "99.99")'),
  description: z.string().describe('What the payment is for'),
  currency: z.string().default('USD').describe('ISO 4217 currency code'),
});

export const collectPaymentOutputSchema = z.object({
  payment_url: z.string().nullable(),
  amount: z.string(),
  description: z.string(),
  currency: z.string(),
  status: z.enum(['link_provided', 'manual_required']),
});

// === Send Quote ===

export const sendQuoteLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().min(1),
  unit_price: z.number().min(0),
});

export const SUPPORTED_CURRENCIES = ['USD', 'COP', 'MXN', 'BRL'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const supportedCurrencySchema = z.enum(SUPPORTED_CURRENCIES);

export const paymentStatusSchema = z.enum(['pending', 'sent', 'viewed', 'paid', 'overdue', 'cancelled']);

export const sendQuoteInputSchema = z.object({
  items: z.array(sendQuoteLineItemSchema).min(1).describe('Quote line items'),
  currency: supportedCurrencySchema.default('USD'),
  valid_days: z.number().default(30).describe('Days until quote expires'),
  recipient_email: z.string().email().optional().describe('Customer email address to send the quote to'),
  recipient_name: z.string().optional().describe('Customer name for the email greeting'),
});

export const sendQuoteOutputSchema = z.object({
  quote_id: z.string(),
  items: z.array(sendQuoteLineItemSchema),
  total: z.string(),
  currency: z.string(),
  valid_until: z.string(),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']),
});

// === Create Ticket ===

export const ticketPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

export const createTicketInputSchema = z.object({
  subject: z.string().describe('Short ticket subject'),
  description: z.string().describe('Detailed description of the issue'),
  priority: ticketPrioritySchema.default('medium'),
  category: z.string().optional().describe('Issue category (e.g. billing, technical, general)'),
});

export const createTicketOutputSchema = z.object({
  ticket_id: z.string(),
  subject: z.string(),
  priority: ticketPrioritySchema,
  category: z.string().nullable(),
  status: z.enum(['open', 'in_progress', 'waiting', 'closed']),
});

// === Escalate to Human ===

export const escalateToHumanInputSchema = z.object({
  reason: z.string().describe('Why the conversation needs human attention'),
  urgency: z.enum(['low', 'medium', 'high']).default('medium'),
  summary: z.string().describe('Brief summary of the conversation and issue'),
});

export const escalateToHumanOutputSchema = z.object({
  escalated: z.boolean(),
  conversation_status: z.enum(['active', 'resolved', 'escalated']),
  reason: z.string(),
  urgency: z.string(),
});

// === Capture Interest ===

export const interestLevelSchema = z.enum(['browsing', 'considering', 'ready_to_buy']);

export const captureInterestInputSchema = z.object({
  product_or_topic: z.string().describe('Product or topic the customer is interested in'),
  interest_level: interestLevelSchema,
  contact_info: z.string().optional().describe('Email or phone if volunteered'),
});

export const captureInterestOutputSchema = z.object({
  logged: z.boolean(),
  product_or_topic: z.string(),
  interest_level: interestLevelSchema,
  follow_up_recommended: z.boolean(),
});

// === Draft Content ===

export const contentTypeSchema = z.enum(['social_post', 'email', 'announcement']);

export const draftContentInputSchema = z.object({
  content_type: contentTypeSchema,
  topic: z.string().describe('Topic or subject of the content'),
  key_points: z.array(z.string()).optional().describe('Key points to cover'),
});

export const draftContentOutputSchema = z.object({
  draft_text: z.string(),
  content_type: contentTypeSchema,
  topic: z.string(),
  status: z.enum(['draft', 'approved', 'published']),
});
