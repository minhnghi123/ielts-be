BEGIN;
DROP TABLE IF EXISTS question_hints;
ALTER TABLE learner_mistakes DROP COLUMN IF EXISTS self_cause, DROP COLUMN IF EXISTS hint_level;
COMMIT;
