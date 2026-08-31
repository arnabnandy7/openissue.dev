ALTER TABLE opportunity
  ADD COLUMN workflow_state text DEFAULT 'saved' NOT NULL;

ALTER TABLE opportunity
  ADD COLUMN note text;

ALTER TABLE opportunity
  ADD COLUMN follow_up_at integer;

ALTER TABLE opportunity
  ADD COLUMN workflow_updated_at integer
  DEFAULT 0 NOT NULL;

UPDATE opportunity
  SET workflow_updated_at = updated_at;

CREATE INDEX opportunity_user_workflow_state_idx
  ON opportunity (user_id, workflow_state);
