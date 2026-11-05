-- 006_tutor_hints.sql — Socratic hints cache + learner self-reported error cause. Depends on 003.
BEGIN;
ALTER TABLE learner_mistakes
  ADD COLUMN IF NOT EXISTS self_cause varchar(40),
  ADD COLUMN IF NOT EXISTS hint_level smallint;
CREATE TABLE IF NOT EXISTS question_hints (
  question_id  uuid NOT NULL,
  content_hash varchar(32) NOT NULL,
  hints_vi     jsonb NOT NULL,
  model        varchar(80),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, content_hash)
);
COMMIT;
