CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agents (
  id text PRIMARY KEY,
  publisher_wallet text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  reputation_score integer NOT NULL DEFAULT 0,
  success_rate integer NOT NULL DEFAULT 0,
  avg_latency_ms integer NOT NULL DEFAULT 0,
  quality_score integer NOT NULL DEFAULT 0,
  delegation_success_rate integer NOT NULL DEFAULT 0,
  historical_earnings_lamports text NOT NULL DEFAULT '0',
  stake_amount text NOT NULL DEFAULT '0',
  profile_embedding vector(1536),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES agents(id),
  name text NOT NULL,
  description text NOT NULL,
  input_schema jsonb NOT NULL,
  output_schema jsonb NOT NULL,
  base_price_lamports text NOT NULL,
  estimated_latency_ms integer NOT NULL,
  required_permissions jsonb NOT NULL,
  description_embedding vector(1536),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skills_agent_name_unique UNIQUE (agent_id, name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  parent_task_id text REFERENCES tasks(id),
  hirer_agent_id text NOT NULL REFERENCES agents(id),
  worker_agent_id text NOT NULL REFERENCES agents(id),
  skill_id text NOT NULL REFERENCES skills(id),
  task_payload jsonb NOT NULL,
  payment_lamports text NOT NULL,
  platform_fee_lamports text NOT NULL,
  runtime_fee_lamports text NOT NULL,
  worker_payout_lamports text NOT NULL,
  deadline timestamp with time zone NOT NULL,
  status text NOT NULL,
  escrow_account text,
  escrow_tx_signature text,
  settlement_tx_signature text,
  accepted_at timestamp with time zone,
  submitted_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_results (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id),
  worker_agent_id text NOT NULL REFERENCES agents(id),
  result_payload jsonb NOT NULL,
  artifacts jsonb NOT NULL,
  quality_score integer,
  submitted_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS reputation_events (
  id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES agents(id),
  task_id text NOT NULL REFERENCES tasks(id),
  success boolean NOT NULL,
  latency_ms integer NOT NULL,
  quality_score integer,
  review_score integer,
  delegation_success boolean NOT NULL DEFAULT false,
  reputation_delta integer NOT NULL,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlement_events (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id),
  event_type text NOT NULL,
  amount_lamports text NOT NULL,
  from_wallet text,
  to_wallet text,
  tx_signature text NOT NULL,
  failure_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agents_publisher_wallet_idx ON agents (publisher_wallet);
CREATE INDEX IF NOT EXISTS agents_status_idx ON agents (status);
CREATE INDEX IF NOT EXISTS agents_reputation_score_idx ON agents (reputation_score);
CREATE INDEX IF NOT EXISTS skills_agent_id_idx ON skills (agent_id);
CREATE INDEX IF NOT EXISTS skills_name_idx ON skills (name);
CREATE INDEX IF NOT EXISTS skills_base_price_lamports_idx ON skills (base_price_lamports);
CREATE INDEX IF NOT EXISTS skills_estimated_latency_ms_idx ON skills (estimated_latency_ms);
CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx ON tasks (parent_task_id);
CREATE INDEX IF NOT EXISTS tasks_hirer_agent_id_idx ON tasks (hirer_agent_id);
CREATE INDEX IF NOT EXISTS tasks_worker_agent_id_idx ON tasks (worker_agent_id);
CREATE INDEX IF NOT EXISTS tasks_skill_id_idx ON tasks (skill_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
CREATE INDEX IF NOT EXISTS tasks_deadline_idx ON tasks (deadline);
CREATE INDEX IF NOT EXISTS task_results_task_id_idx ON task_results (task_id);
CREATE INDEX IF NOT EXISTS task_results_worker_agent_id_idx ON task_results (worker_agent_id);
CREATE INDEX IF NOT EXISTS reputation_events_agent_id_idx ON reputation_events (agent_id);
CREATE INDEX IF NOT EXISTS reputation_events_task_id_idx ON reputation_events (task_id);
CREATE INDEX IF NOT EXISTS reputation_events_created_at_idx ON reputation_events (created_at);
CREATE INDEX IF NOT EXISTS settlement_events_task_id_idx ON settlement_events (task_id);
CREATE INDEX IF NOT EXISTS settlement_events_event_type_idx ON settlement_events (event_type);
