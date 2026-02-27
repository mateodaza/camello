-- Migration 0012: Add memory column to customers for cross-conversation context
-- Feature: #51 Customer Memory

ALTER TABLE customers ADD COLUMN memory jsonb NOT NULL DEFAULT '{}';
COMMENT ON COLUMN customers.memory IS 'Cross-conversation facts: {facts: [{key, value, conversationId, extractedAt}], updatedAt}';
