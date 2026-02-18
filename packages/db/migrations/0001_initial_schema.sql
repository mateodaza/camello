-- ============================================================
-- Camello Initial Schema Migration
-- Generated from TECHNICAL_SPEC_v1.md + v1.4 routing/metrics additions
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Types
CREATE TYPE autonomy_level AS ENUM ('suggest_only', 'draft_and_approve', 'fully_autonomous');

-- ============================================================
-- 1. TENANT LAYER
-- ============================================================

CREATE TABLE tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  business_model text,
  industry      text,
  plan_tier     text NOT NULL DEFAULT 'starter' CHECK (plan_tier IN ('starter', 'growth', 'scale')),
  default_artifact_id uuid,  -- FK added after artifacts table (circular dep)
  settings      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       text NOT NULL,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_hash      text NOT NULL UNIQUE,
  label         text NOT NULL DEFAULT 'default',
  scopes        text[] NOT NULL DEFAULT '{}',
  last_used_at  timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. MODULE CATALOG (global, no tenant_id, no RLS)
-- ============================================================

CREATE TABLE modules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  slug          text NOT NULL UNIQUE,
  description   text NOT NULL,
  input_schema  jsonb NOT NULL,
  output_schema jsonb NOT NULL,
  category      text NOT NULL CHECK (category IN ('sales', 'support', 'marketing', 'operations', 'custom')),
  is_system     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. ARTIFACT LAYER
-- ============================================================

CREATE TABLE artifacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('sales', 'support', 'marketing', 'custom')),
  name          text NOT NULL,
  personality   jsonb NOT NULL DEFAULT '{}',
  constraints   jsonb NOT NULL DEFAULT '{}',
  config        jsonb NOT NULL DEFAULT '{}',
  escalation    jsonb NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Circular FK: tenants.default_artifact_id → artifacts.id
ALTER TABLE tenants
  ADD CONSTRAINT tenants_default_artifact_fk
  FOREIGN KEY (default_artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL;

CREATE TABLE artifact_modules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id      uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  module_id        uuid NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  autonomy_level   autonomy_level NOT NULL DEFAULT 'draft_and_approve',
  config_overrides jsonb NOT NULL DEFAULT '{}',
  UNIQUE (artifact_id, module_id)
);

-- ============================================================
-- 4. CUSTOMER + CONVERSATION LAYER
-- ============================================================

CREATE TABLE customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_id   text NOT NULL,
  channel       text NOT NULL,
  name          text,
  email         text,
  phone         text,
  metadata      jsonb NOT NULL DEFAULT '{}',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, channel, external_id)
);

CREATE TABLE conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id   uuid NOT NULL REFERENCES artifacts(id),
  customer_id   uuid NOT NULL REFERENCES customers(id),
  channel       text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'escalated')),
  metadata      jsonb NOT NULL DEFAULT '{}',
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id     uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role                text NOT NULL CHECK (role IN ('customer', 'artifact', 'human', 'system')),
  content             text NOT NULL,
  channel_message_id  text,
  tokens_used         integer,
  model_used          text,
  cost_usd            numeric(10, 6),
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. MODULE EXECUTIONS
-- ============================================================

CREATE TABLE module_executions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     uuid NOT NULL REFERENCES modules(id),
  artifact_id   uuid NOT NULL REFERENCES artifacts(id),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  input         jsonb NOT NULL,
  output        jsonb,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  approved_by   text,
  executed_at   timestamptz,
  duration_ms   integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. LEADS LAYER
-- ============================================================

CREATE TABLE leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES customers(id),
  conversation_id uuid REFERENCES conversations(id),
  score           text NOT NULL CHECK (score IN ('hot', 'warm', 'cold')),
  tags            text[] NOT NULL DEFAULT '{}',
  budget          text,
  timeline        text,
  summary         text,
  qualified_at    timestamptz NOT NULL DEFAULT now(),
  converted_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. KNOWLEDGE LAYER
-- ============================================================

CREATE TABLE knowledge_docs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         text,
  content       text NOT NULL,
  source_type   text NOT NULL DEFAULT 'upload',
  chunk_index   integer NOT NULL DEFAULT 0,
  metadata      jsonb NOT NULL DEFAULT '{}',
  embedding     vector(1536),
  fts           tsvector GENERATED ALWAYS AS (
                  to_tsvector('english', coalesce(title, '') || ' ' || content)
                ) STORED,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_syncs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_url    text NOT NULL,
  source_type   text NOT NULL DEFAULT 'website',
  last_synced   timestamptz,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 8. LEARNING LAYER
-- ============================================================

CREATE TABLE learnings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id             uuid REFERENCES artifacts(id),
  type                    text NOT NULL CHECK (type IN ('preference', 'correction', 'pattern', 'objection')),
  content                 text NOT NULL,
  embedding               vector(1536),
  confidence              numeric(3, 2) NOT NULL DEFAULT 0.5,
  source_conversation_id  uuid REFERENCES conversations(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE interaction_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id       uuid NOT NULL REFERENCES artifacts(id),
  conversation_id   uuid NOT NULL REFERENCES conversations(id),
  intent            text NOT NULL,
  model_used        text NOT NULL,
  tokens_in         integer NOT NULL,
  tokens_out        integer NOT NULL,
  cost_usd          numeric(10, 6) NOT NULL,
  latency_ms        integer NOT NULL,
  resolution_type   text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. CHANNEL LAYER
-- ============================================================

CREATE TABLE channel_configs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_type  text NOT NULL,
  credentials   jsonb NOT NULL DEFAULT '{}',
  webhook_url   text,
  phone_number  text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, channel_type)
);

CREATE TABLE webhook_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_type  text NOT NULL,
  external_id   text NOT NULL,
  payload       jsonb NOT NULL,
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, channel_type, external_id)
);

-- ============================================================
-- 10. BILLING LAYER
-- ============================================================

CREATE TABLE usage_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  resolutions_count integer NOT NULL DEFAULT 0,
  llm_cost_usd      numeric(10, 4) NOT NULL DEFAULT 0,
  overage_cost_usd   numeric(10, 4) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_start)
);

CREATE TABLE billing_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type            text NOT NULL,
  amount_usd      numeric(10, 4),
  stripe_event_id text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 11. ROUTING / ASSIGNMENT / METRICS (v1.4 additions)
-- ============================================================

-- Tenant-level deterministic routing rules.
-- Resolver evaluates active rules ordered by priority ASC (lower number = higher priority).
-- If no rule matches, fallback is tenants.default_artifact_id.
CREATE TABLE artifact_routing_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id     uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  channel         text,                           -- NULL = any channel
  intent          text,                           -- NULL = any intent
  min_confidence  numeric(3, 2) NOT NULL DEFAULT 0.00 CHECK (min_confidence >= 0 AND min_confidence <= 1),
  priority        integer NOT NULL DEFAULT 100,   -- lower value = higher priority
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Artifact ownership timeline per conversation.
-- This is the source of truth for routing/handoffs over time.
CREATE TABLE conversation_artifact_assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id    uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  artifact_id        uuid NOT NULL REFERENCES artifacts(id),
  assignment_reason  text NOT NULL CHECK (assignment_reason IN ('route_rule', 'tenant_default_fallback', 'manual_override', 'handoff')),
  trigger_intent     text,
  trigger_confidence numeric(3, 2) CHECK (trigger_confidence IS NULL OR (trigger_confidence >= 0 AND trigger_confidence <= 1)),
  is_active          boolean NOT NULL DEFAULT true,
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}',
  CHECK (
    (is_active = true AND ended_at IS NULL) OR
    (is_active = false AND ended_at IS NOT NULL)
  )
);

-- HARD INVARIANT: only one active artifact per conversation at any moment
CREATE UNIQUE INDEX idx_assignments_single_active_per_conversation
  ON conversation_artifact_assignments (conversation_id)
  WHERE is_active = true AND ended_at IS NULL;

-- Rollup table for dashboard agent-performance cards (MVP analytics granularity: daily).
CREATE TABLE artifact_metrics_daily (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id          uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  metric_date          date NOT NULL,
  handoffs_in          integer NOT NULL DEFAULT 0,
  handoffs_out         integer NOT NULL DEFAULT 0,
  resolutions_count    integer NOT NULL DEFAULT 0,
  avg_latency_ms       numeric(10, 2) NOT NULL DEFAULT 0,
  llm_cost_usd         numeric(10, 4) NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, artifact_id, metric_date)
);

-- ============================================================
-- 12. INDEXES
-- ============================================================

CREATE INDEX idx_messages_tenant_conv ON messages(tenant_id, conversation_id, created_at DESC);
CREATE INDEX idx_conversations_tenant_status ON conversations(tenant_id, status, updated_at DESC);
CREATE INDEX idx_customers_tenant_channel ON customers(tenant_id, channel, external_id);
CREATE INDEX idx_leads_tenant_score ON leads(tenant_id, score, created_at DESC);
CREATE INDEX idx_knowledge_docs_embedding ON knowledge_docs
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_learnings_embedding ON learnings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_interaction_logs_tenant_date ON interaction_logs(tenant_id, created_at DESC);
CREATE INDEX idx_webhook_events_unprocessed ON webhook_events(tenant_id, channel_type)
  WHERE processed_at IS NULL;
CREATE INDEX idx_module_executions_pending ON module_executions(tenant_id, status)
  WHERE status = 'pending';
CREATE INDEX idx_knowledge_docs_fts ON knowledge_docs USING gin(fts);
CREATE INDEX idx_artifact_routing_lookup
  ON artifact_routing_rules(tenant_id, is_active, channel, intent, priority);
CREATE INDEX idx_assignments_tenant_artifact_started
  ON conversation_artifact_assignments(tenant_id, artifact_id, started_at DESC);
CREATE INDEX idx_artifact_metrics_daily_tenant_artifact_date
  ON artifact_metrics_daily(tenant_id, artifact_id, metric_date DESC);

-- ============================================================
-- 13. RLS POLICIES
-- ============================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_self" ON tenants
  FOR ALL USING (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'tenant_members', 'api_keys', 'artifacts', 'artifact_modules',
      'module_executions', 'customers', 'conversations', 'messages',
      'leads', 'knowledge_docs', 'knowledge_syncs', 'learnings',
      'interaction_logs', 'channel_configs', 'webhook_events',
      'usage_records', 'billing_events',
      'artifact_routing_rules', 'conversation_artifact_assignments', 'artifact_metrics_daily'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation" ON %I
        FOR ALL
        USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)
        WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      tbl
    );
  END LOOP;
END;
$$;

-- ============================================================
-- 14. APP USER ROLE (runtime, cannot bypass RLS)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOINHERIT;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- ============================================================
-- 15. HYBRID SEARCH FUNCTION (RAG)
-- ============================================================

CREATE FUNCTION match_knowledge(
  query_embedding vector(1536),
  query_text text,
  p_tenant_id uuid,
  p_doc_types text[] DEFAULT NULL,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 12
) RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  embedding vector(1536),
  similarity float,
  fts_rank float,
  rrf_score float
) AS $$
  WITH vector_results AS (
    SELECT kd.id, kd.content, kd.metadata, kd.embedding,
           1 - (kd.embedding <=> query_embedding) AS similarity,
           ROW_NUMBER() OVER (ORDER BY kd.embedding <=> query_embedding) AS vrank
    FROM knowledge_docs kd
    WHERE kd.tenant_id = p_tenant_id
      AND (p_doc_types IS NULL OR kd.metadata->>'type' = ANY(p_doc_types))
      AND 1 - (kd.embedding <=> query_embedding) > match_threshold
    LIMIT match_count * 2
  ),
  fts_results AS (
    SELECT kd.id, kd.content, kd.metadata, kd.embedding,
           ts_rank(kd.fts, websearch_to_tsquery('english', query_text)) AS fts_rank,
           ROW_NUMBER() OVER (ORDER BY ts_rank(kd.fts, websearch_to_tsquery('english', query_text)) DESC) AS frank
    FROM knowledge_docs kd
    WHERE kd.tenant_id = p_tenant_id
      AND (p_doc_types IS NULL OR kd.metadata->>'type' = ANY(p_doc_types))
      AND kd.fts @@ websearch_to_tsquery('english', query_text)
    LIMIT match_count * 2
  )
  SELECT
    COALESCE(v.id, f.id) AS id,
    COALESCE(v.content, f.content) AS content,
    COALESCE(v.metadata, f.metadata) AS metadata,
    COALESCE(v.embedding, f.embedding) AS embedding,
    COALESCE(v.similarity, 0) AS similarity,
    COALESCE(f.fts_rank, 0) AS fts_rank,
    COALESCE(1.0 / (60 + v.vrank), 0) + COALESCE(1.0 / (60 + f.frank), 0) AS rrf_score
  FROM vector_results v
  FULL OUTER JOIN fts_results f ON v.id = f.id
  ORDER BY rrf_score DESC
  LIMIT match_count;
$$ LANGUAGE sql;
