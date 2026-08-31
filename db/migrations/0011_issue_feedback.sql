CREATE TABLE hidden_repository (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  repository_full_name text NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE issue_feedback (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  repository_full_name text NOT NULL,
  issue_number integer NOT NULL,
  issue_url text NOT NULL,
  reason text NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX hidden_repository_user_repo_uidx
  ON hidden_repository (user_id, repository_full_name);

CREATE INDEX hidden_repository_user_id_idx
  ON hidden_repository (user_id);

CREATE UNIQUE INDEX issue_feedback_user_repository_issue_uidx
  ON issue_feedback (user_id, repository_full_name, issue_number);

CREATE INDEX issue_feedback_user_id_idx
  ON issue_feedback (user_id);
