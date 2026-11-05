BEGIN;
DROP TABLE IF EXISTS learner_memory_params;
DROP TABLE IF EXISTS memory_reviews;
ALTER TABLE learner_mistakes DROP COLUMN IF EXISTS correct_count, DROP COLUMN IF EXISTS lapse_count, DROP COLUMN IF EXISTS half_life_h;
ALTER TABLE saved_words DROP COLUMN IF EXISTS correct_count, DROP COLUMN IF EXISTS lapse_count, DROP COLUMN IF EXISTS half_life_h, DROP COLUMN IF EXISTS last_reviewed_at;
COMMIT;
