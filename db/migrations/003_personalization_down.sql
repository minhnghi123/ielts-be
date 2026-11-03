-- Rollback for 003_personalization.sql
BEGIN;
ALTER TABLE ai_writing_gradings DROP COLUMN IF EXISTS errors_json;
DROP TABLE IF EXISTS saved_words;
DROP TABLE IF EXISTS study_tasks;
DROP TABLE IF EXISTS learner_kc_ratings;
DROP TABLE IF EXISTS question_explanations;
DROP INDEX IF EXISTS uq_learner_mistakes_attempt_question;
DROP INDEX IF EXISTS idx_learner_mistakes_due;
DROP INDEX IF EXISTS idx_learner_mistakes_learner_status;
ALTER TABLE learner_mistakes
  DROP CONSTRAINT IF EXISTS learner_mistakes_status_chk,
  DROP CONSTRAINT IF EXISTS learner_mistakes_error_cause_chk;
ALTER TABLE learner_mistakes
  DROP COLUMN IF EXISTS attempt_id, DROP COLUMN IF EXISTS skill, DROP COLUMN IF EXISTS question_type,
  DROP COLUMN IF EXISTS error_cause, DROP COLUMN IF EXISTS user_answer, DROP COLUMN IF EXISTS correct_answer,
  DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS srs_interval_days, DROP COLUMN IF EXISTS srs_ease,
  DROP COLUMN IF EXISTS next_review_at, DROP COLUMN IF EXISTS review_count, DROP COLUMN IF EXISTS last_reviewed_at,
  DROP COLUMN IF EXISTS updated_at;
DROP TABLE IF EXISTS learner_goals;
DROP INDEX IF EXISTS idx_questions_type;
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_difficulty_chk;
ALTER TABLE questions DROP COLUMN IF EXISTS difficulty, DROP COLUMN IF EXISTS elo_rating, DROP COLUMN IF EXISTS evidence_anchor;
-- question_type values are left in canonical form (no data rollback).
COMMIT;
