-- 003_personalization.sql
-- Personalisation foundation: learner goals, richer question metadata, mistake
-- notebook, explanation cache, per-KC ratings, study tasks, saved words.
-- Idempotent: safe to re-run on Supabase. Apply manually (TypeORM synchronize is off).
-- Rollback: 003_personalization_down.sql

BEGIN;

-- ─── test-service: questions ────────────────────────────────────────────────
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS difficulty       smallint,
  ADD COLUMN IF NOT EXISTS elo_rating       numeric(7,2) NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS evidence_anchor  jsonb;
DO $$ BEGIN
  ALTER TABLE questions ADD CONSTRAINT questions_difficulty_chk
    CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Normalise legacy question_type spellings to the canonical codes in
-- libs/common/src/constants/question-types.ts
UPDATE questions SET question_type = CASE lower(trim(question_type))
  WHEN 'matching_headings'       THEN 'matching_heading'
  WHEN 'heading_matching'        THEN 'matching_heading'
  WHEN 'true_false_ng'           THEN 'true_false_not_given'
  WHEN 'true_false'              THEN 'true_false_not_given'
  WHEN 'tfng'                    THEN 'true_false_not_given'
  WHEN 'yes_no_ng'               THEN 'yes_no_not_given'
  WHEN 'yes_no'                  THEN 'yes_no_not_given'
  WHEN 'ynng'                    THEN 'yes_no_not_given'
  WHEN 'matching_information'    THEN 'matching'
  WHEN 'matching_feature'        THEN 'matching_features'
  WHEN 'sentence_endings'        THEN 'sentence_ending'
  WHEN 'matching_sentence_endings' THEN 'sentence_ending'
  WHEN 'mcq'                     THEN 'multiple_choice'
  WHEN 'gap_fill'                THEN 'fill_in_blank'
  WHEN 'sentence_completion'     THEN 'fill_in_blank'
  WHEN 'summary_completion'      THEN 'fill_in_blank'
  WHEN 'note_completion'         THEN 'fill_in_blank'
  WHEN 'table_completion'        THEN 'fill_in_blank'
  ELSE lower(trim(question_type)) END
WHERE question_type <> lower(trim(question_type))
   OR lower(trim(question_type)) IN (
     'matching_headings','heading_matching','true_false_ng','true_false','tfng',
     'yes_no_ng','yes_no','ynng','matching_information','matching_feature',
     'sentence_endings','matching_sentence_endings','mcq','gap_fill',
     'sentence_completion','summary_completion','note_completion','table_completion');

CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(question_type);

-- ─── analytics-service: learner goals ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS learner_goals (
  learner_id        uuid PRIMARY KEY REFERENCES learner_profiles(id) ON DELETE CASCADE,
  target_overall    numeric(2,1) NOT NULL CHECK (target_overall BETWEEN 4.0 AND 9.0),
  target_listening  numeric(2,1) CHECK (target_listening IS NULL OR target_listening BETWEEN 4.0 AND 9.0),
  target_reading    numeric(2,1) CHECK (target_reading  IS NULL OR target_reading  BETWEEN 4.0 AND 9.0),
  target_writing    numeric(2,1) CHECK (target_writing  IS NULL OR target_writing  BETWEEN 4.0 AND 9.0),
  target_speaking   numeric(2,1) CHECK (target_speaking IS NULL OR target_speaking BETWEEN 4.0 AND 9.0),
  exam_date         date,
  minutes_per_day   int NOT NULL DEFAULT 30 CHECK (minutes_per_day BETWEEN 10 AND 300),
  days_per_week     int NOT NULL DEFAULT 5 CHECK (days_per_week BETWEEN 1 AND 7),
  purpose           varchar(30) CHECK (purpose IS NULL OR purpose IN ('study_abroad','immigration','work','graduation','other')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── analytics-service: mistake notebook ────────────────────────────────────
ALTER TABLE learner_mistakes
  ADD COLUMN IF NOT EXISTS attempt_id       uuid,
  ADD COLUMN IF NOT EXISTS skill            varchar(20),
  ADD COLUMN IF NOT EXISTS question_type    varchar(50),
  ADD COLUMN IF NOT EXISTS error_cause      varchar(40),
  ADD COLUMN IF NOT EXISTS user_answer      text,
  ADD COLUMN IF NOT EXISTS correct_answer   text,
  ADD COLUMN IF NOT EXISTS status           varchar(12) NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS srs_interval_days int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS srs_ease         numeric(4,2) NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS next_review_at   timestamptz,
  ADD COLUMN IF NOT EXISTS review_count     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();
DO $$ BEGIN
  ALTER TABLE learner_mistakes ADD CONSTRAINT learner_mistakes_status_chk
    CHECK (status IN ('new','reviewing','fixed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE learner_mistakes ADD CONSTRAINT learner_mistakes_error_cause_chk
    CHECK (error_cause IS NULL OR error_cause IN (
      'spelling','word_limit','paraphrase_miss','tfng_confusion','distractor',
      'number_format','location_miss','inference','skipped','time_management','unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_learner_mistakes_learner_status
  ON learner_mistakes(learner_id, status);
CREATE INDEX IF NOT EXISTS idx_learner_mistakes_due
  ON learner_mistakes(learner_id, next_review_at) WHERE status <> 'fixed';
CREATE UNIQUE INDEX IF NOT EXISTS uq_learner_mistakes_attempt_question
  ON learner_mistakes(attempt_id, question_id) WHERE attempt_id IS NOT NULL;

-- ─── analytics-service: cached AI explanations (per question + wrong answer) ─
CREATE TABLE IF NOT EXISTS question_explanations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id      uuid NOT NULL,                     -- logical FK → questions.id (test-service)
  user_answer_norm text NOT NULL DEFAULT '',          -- '' = generic explanation for the question
  error_cause      varchar(40),
  evidence_quote   text,
  explanation_vi   text NOT NULL,
  tip_vi           text,
  model            varchar(80),
  source           varchar(10) NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','author','teacher')),
  approved_by      uuid,
  approved_at      timestamptz,
  helpful_votes    int NOT NULL DEFAULT 0,
  unhelpful_votes  int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_answer_norm)
);

-- ─── analytics-service: per knowledge-component Elo ratings ─────────────────
CREATE TABLE IF NOT EXISTS learner_kc_ratings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id   uuid NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  skill        varchar(20) NOT NULL CHECK (skill IN ('listening','reading','writing','speaking')),
  kc           varchar(50) NOT NULL,                  -- question_type or rubric criterion
  rating       numeric(7,2) NOT NULL DEFAULT 1500,
  attempts     int NOT NULL DEFAULT 0,
  correct      int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, skill, kc)
);

-- ─── analytics-service: study plan tasks ────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id    uuid NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  week_start    date NOT NULL,
  scheduled_for date NOT NULL,
  task_type     varchar(12) NOT NULL CHECK (task_type IN ('drill','review','mock','writing','speaking','placement')),
  skill         varchar(20) CHECK (skill IS NULL OR skill IN ('listening','reading','writing','speaking')),
  kc            varchar(50),
  ref_type      varchar(12) CHECK (ref_type IS NULL OR ref_type IN ('test','drill','mistakes','words')),
  ref_id        uuid,
  title_vi      varchar(160) NOT NULL,
  reason_vi     varchar(240),
  est_minutes   int NOT NULL DEFAULT 15 CHECK (est_minutes BETWEEN 5 AND 180),
  priority      smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  done_at       timestamptz,
  result_ref    uuid,                                  -- attempt that completed the task
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_study_tasks_learner_day ON study_tasks(learner_id, scheduled_for);

-- ─── analytics-service: saved vocabulary ────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_words (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id       uuid NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  word             varchar(80) NOT NULL,
  context          text,
  meaning_vi       text,
  test_id          uuid,
  srs_interval_days int NOT NULL DEFAULT 1,
  srs_ease         numeric(4,2) NOT NULL DEFAULT 2.5,
  next_review_at   timestamptz,
  review_count     int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, word)
);
CREATE INDEX IF NOT EXISTS idx_saved_words_due ON saved_words(learner_id, next_review_at);

-- ─── submission-service: tagged writing errors ──────────────────────────────
ALTER TABLE ai_writing_gradings
  ADD COLUMN IF NOT EXISTS errors_json jsonb;

COMMIT;
