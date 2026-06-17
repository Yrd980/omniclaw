CREATE TABLE IF NOT EXISTS delivery_manifests (
  id text PRIMARY KEY,
  task_result_id text NOT NULL REFERENCES task_results(id),
  task_id text NOT NULL REFERENCES tasks(id),
  manifest_version text NOT NULL,
  public_safe boolean NOT NULL,
  manifest_payload jsonb NOT NULL,
  manifest_hash text NOT NULL,
  verifier_status text NOT NULL,
  verifier_command text,
  verifier_expected_output text,
  verifier_exit_code integer,
  verifier_stdout_hash text,
  public_safety_status text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE task_results ADD COLUMN IF NOT EXISTS delivery_manifest_id text;

CREATE INDEX IF NOT EXISTS delivery_manifests_task_result_id_idx ON delivery_manifests (task_result_id);
CREATE INDEX IF NOT EXISTS delivery_manifests_task_id_idx ON delivery_manifests (task_id);
CREATE INDEX IF NOT EXISTS delivery_manifests_manifest_hash_idx ON delivery_manifests (manifest_hash);
CREATE INDEX IF NOT EXISTS delivery_manifests_verifier_status_idx ON delivery_manifests (verifier_status);
