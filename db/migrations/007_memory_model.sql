-- 007_memory_model.sql — HLR-lite forgetting model for saved words and the mistake notebook. Depends on 003/006.
BEGIN;
ALTER TABLE saved_words
  ADD COLUMN IF NOT EXISTS correct_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lapse_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS half_life_h numeric(9,2),
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;
ALTER TABLE learner_mistakes
  ADD COLUMN IF NOT EXISTS correct_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lapse_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS half_life_h numeric(9,2);
-- Every review with the recall probability predicted *before* the outcome → lets us fit/evaluate the model per learner.
CREATE TABLE IF NOT EXISTS memory_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id  uuid NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  item_type   varchar(10) NOT NULL CHECK (item_type IN ('word','mistake')),
  item_id     uuid NOT NULL,
  lag_h       numeric(9,2) NOT NULL,
  p_pred      numeric(5,4) NOT NULL,
  outcome     boolean NOT NULL,
  half_life_before_h numeric(9,2),
  half_life_after_h  numeric(9,2),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memory_reviews_learner ON memory_reviews(learner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS learner_memory_params (
  learner_id  uuid PRIMARY KEY REFERENCES learner_profiles(id) ON DELETE CASCADE,
  scale       numeric(4,2) NOT NULL DEFAULT 1.0,
  n_obs       int NOT NULL DEFAULT 0,
  log_loss    numeric(6,4),
  fitted_at   timestamptz
);
COMMIT;
