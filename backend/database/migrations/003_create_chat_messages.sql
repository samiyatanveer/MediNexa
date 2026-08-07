-- Migration 003: Create chat_messages table
-- Depends on: 002_create_chat_sessions.sql

CREATE TABLE IF NOT EXISTS chat_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role                VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content             TEXT NOT NULL,
    category            VARCHAR(50),
    sources_json        JSONB,
    retrieval_metadata  JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup: messages for a session ordered chronologically
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id
    ON chat_messages(session_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
    ON chat_messages(session_id, created_at ASC);

-- JSONB GIN indexes for source and metadata querying
CREATE INDEX IF NOT EXISTS idx_chat_messages_sources
    ON chat_messages USING GIN (sources_json);

CREATE INDEX IF NOT EXISTS idx_chat_messages_retrieval
    ON chat_messages USING GIN (retrieval_metadata);

CREATE INDEX IF NOT EXISTS idx_chat_messages_category
    ON chat_messages(category);
