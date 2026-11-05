BEGIN;
DROP TABLE IF EXISTS speaking_attempts;
DROP TABLE IF EXISTS speaking_exercises;
ALTER TABLE learner_mistakes DROP CONSTRAINT IF EXISTS learner_mistakes_error_cause_chk;
ALTER TABLE learner_mistakes ADD CONSTRAINT learner_mistakes_error_cause_chk
  CHECK (error_cause IS NULL OR error_cause IN (
    'spelling','word_limit','paraphrase_miss','tfng_confusion','distractor',
    'number_format','location_miss','inference','skipped','time_management','unknown'));
COMMIT;
