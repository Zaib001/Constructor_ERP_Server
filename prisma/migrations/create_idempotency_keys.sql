CREATE TABLE IF NOT EXISTS audit.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID,
  route VARCHAR(255) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_body JSONB,
  created_at TIMESTAMP(6) DEFAULT NOW(),
  expires_at TIMESTAMP(6) NOT NULL
);
