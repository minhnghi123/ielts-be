-- 005_learner_model.sql — Open learner model: learner feedback on their own mastery estimates. Depends on 003.
BEGIN;
CREATE TABLE IF NOT EXISTS learner_kc_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id  uuid NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  skill       varchar(20) NOT NULL,
  kc          varchar(50) NOT NULL,
  verdict     varchar(12) NOT NULL CHECK (verdict IN ('vung','chua_vung')),
  rating_before numeric(7,2) NOT NULL,
  rating_after  numeric(7,2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learner_kc_feedback_learner ON learner_kc_feedback(learner_id, skill, kc, created_at DESC);
COMMIT;
