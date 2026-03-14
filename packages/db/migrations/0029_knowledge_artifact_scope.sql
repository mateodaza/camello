-- 0029_knowledge_artifact_scope.sql
-- Add optional artifact_id to knowledge_docs.
-- NULL = global (visible to all agents).
-- Non-null = private to that specific artifact (used only in its RAG context).

ALTER TABLE knowledge_docs
  ADD COLUMN artifact_id uuid REFERENCES artifacts(id) ON DELETE CASCADE;

-- Index for fast per-agent RAG queries.
-- CONCURRENTLY omitted — apply_migration wraps in a transaction.
CREATE INDEX idx_knowledge_docs_artifact_id
  ON knowledge_docs (tenant_id, artifact_id);

-- Replace match_knowledge to honour artifact_id scoping.
-- When p_artifact_id IS NULL (default): returns global docs + all agent docs (backward compat).
-- When p_artifact_id is set: returns global docs (artifact_id IS NULL) + that agent's docs.
DROP FUNCTION IF EXISTS match_knowledge(vector, text, uuid, text[], float, int);

CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding vector(1536),
  query_text      text,
  p_tenant_id     uuid,
  p_doc_types     text[]  DEFAULT NULL,
  match_threshold float   DEFAULT 0.3,
  match_count     int     DEFAULT 12,
  p_artifact_id   uuid    DEFAULT NULL
) RETURNS TABLE (
  id         uuid,
  content    text,
  metadata   jsonb,
  embedding  vector(1536),
  similarity float,
  fts_rank   float,
  rrf_score  float
) LANGUAGE sql AS $$
  WITH vector_results AS (
    SELECT kd.id, kd.content, kd.metadata, kd.embedding,
           1 - (kd.embedding <=> query_embedding) AS similarity,
           ROW_NUMBER() OVER (ORDER BY kd.embedding <=> query_embedding) AS vrank
    FROM knowledge_docs kd
    WHERE kd.tenant_id = p_tenant_id
      AND (p_artifact_id IS NULL OR kd.artifact_id IS NULL OR kd.artifact_id = p_artifact_id)
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
      AND (p_artifact_id IS NULL OR kd.artifact_id IS NULL OR kd.artifact_id = p_artifact_id)
      AND (p_doc_types IS NULL OR kd.metadata->>'type' = ANY(p_doc_types))
      AND kd.fts @@ websearch_to_tsquery('english', query_text)
    LIMIT match_count * 2
  )
  SELECT
    COALESCE(v.id,       f.id)       AS id,
    COALESCE(v.content,  f.content)  AS content,
    COALESCE(v.metadata, f.metadata) AS metadata,
    COALESCE(v.embedding,f.embedding)AS embedding,
    COALESCE(v.similarity, 0)        AS similarity,
    COALESCE(f.fts_rank, 0)          AS fts_rank,
    COALESCE(1.0 / (60 + v.vrank), 0) + COALESCE(1.0 / (60 + f.frank), 0) AS rrf_score
  FROM vector_results v
  FULL OUTER JOIN fts_results f ON v.id = f.id
  ORDER BY rrf_score DESC
  LIMIT match_count;
$$;
