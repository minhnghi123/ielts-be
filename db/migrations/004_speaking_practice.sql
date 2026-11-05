-- 004_speaking_practice.sql
-- Luyện nói theo bậc (phát âm từ → ghép câu → câu dài → nói tự do) với chấm tự động.
-- Idempotent; depends on 003 (learner_kc_ratings, learner_mistakes). Rollback: 004_speaking_practice_down.sql
BEGIN;

CREATE TABLE IF NOT EXISTS speaking_exercises (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level           varchar(16) NOT NULL CHECK (level IN ('word','sentence_build','sentence','free')),
  text            text NOT NULL,                       -- từ / câu mẫu / câu hỏi
  ipa             text,
  target_sounds   text[] NOT NULL DEFAULT '{}',        -- ARPAbet, vd. {TH,DH,S_final}
  topic           varchar(60),
  difficulty      smallint NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  shuffled_tokens text[],                              -- chỉ sentence_build
  sample_answer   text,                                -- chỉ free
  tip_vi          text,
  created_by      uuid,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_speaking_exercises_level ON speaking_exercises(level, is_active, difficulty);
CREATE UNIQUE INDEX IF NOT EXISTS uq_speaking_exercises_level_text ON speaking_exercises(level, lower(text));

CREATE TABLE IF NOT EXISTS speaking_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id    uuid NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  exercise_id   uuid REFERENCES speaking_exercises(id) ON DELETE SET NULL,
  level         varchar(16) NOT NULL CHECK (level IN ('word','sentence_build','sentence','free')),
  audio_url     text,
  transcript    text,
  duration_s    numeric(6,2),
  wpm           int,
  pauses        int,
  fillers       int,
  word_results  jsonb,       -- [{word,status,heard,sounds:[{expected,actual}]}]
  scores        jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors_json   jsonb,       -- thẻ lỗi bậc free
  provider      varchar(10) NOT NULL DEFAULT 'groq',
  expires_at    timestamptz, -- audio tự xoá
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_speaking_attempts_learner ON speaking_attempts(learner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_speaking_attempts_exercise ON speaking_attempts(learner_id, exercise_id);

-- Nguyên nhân sai cho Speaking trong sổ lỗi
ALTER TABLE learner_mistakes DROP CONSTRAINT IF EXISTS learner_mistakes_error_cause_chk;
ALTER TABLE learner_mistakes ADD CONSTRAINT learner_mistakes_error_cause_chk
  CHECK (error_cause IS NULL OR error_cause IN (
    'spelling','word_limit','paraphrase_miss','tfng_confusion','distractor',
    'number_format','location_miss','inference','skipped','time_management','unknown',
    'sound_substitution','final_consonant','word_stress','omission','pace'));

COMMIT;
