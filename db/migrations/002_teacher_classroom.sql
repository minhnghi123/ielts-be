-- 002_teacher_classroom.sql
-- Teacher role + classrooms. Idempotent: safe to re-run on Supabase.
-- Apply manually (TypeORM synchronize is off). Rollback: 002_teacher_classroom_down.sql

BEGIN;

-- ─── auth-service ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  organization     varchar(255),
  bio              text,
  approval_status  varchar(20) NOT NULL DEFAULT 'pending'
                   CHECK (approval_status IN ('pending','approved','rejected')),
  approved_by      uuid REFERENCES accounts(id) ON DELETE SET NULL,
  approved_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teacher_profiles_status ON teacher_profiles(approval_status);

-- ─── test-service ───────────────────────────────────────────────────────────
ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS visibility varchar(10) NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS owner_role varchar(10) NOT NULL DEFAULT 'admin';
DO $$ BEGIN
  ALTER TABLE tests ADD CONSTRAINT tests_visibility_chk CHECK (visibility IN ('public','private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE tests ADD CONSTRAINT tests_owner_role_chk CHECK (owner_role IN ('admin','teacher'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_tests_visibility_status ON tests(visibility, status);
CREATE INDEX IF NOT EXISTS idx_tests_created_by ON tests(created_by);

ALTER TABLE test_attempts
  ADD COLUMN IF NOT EXISTS assignment_id uuid,
  ADD COLUMN IF NOT EXISTS attempt_no int NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_test_attempts_assignment
  ON test_attempts(assignment_id) WHERE assignment_id IS NOT NULL;

-- ─── classroom-service ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   uuid NOT NULL REFERENCES teacher_profiles(id) ON DELETE RESTRICT,
  name         varchar(120) NOT NULL,
  description  text,
  target_band  numeric(3,1) CHECK (target_band IS NULL OR (target_band >= 0 AND target_band <= 9)),
  join_code    varchar(8) NOT NULL UNIQUE,
  join_policy  varchar(10) NOT NULL DEFAULT 'approval' CHECK (join_policy IN ('open','approval','closed')),
  max_members  int CHECK (max_members IS NULL OR max_members > 0),
  cover_color  varchar(20),
  status       varchar(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);

CREATE TABLE IF NOT EXISTS class_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  learner_id  uuid NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  status      varchar(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','removed','left')),
  joined_at   timestamptz,
  left_at     timestamptz,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_class_members_class ON class_members(class_id, status);
CREATE INDEX IF NOT EXISTS idx_class_members_learner ON class_members(learner_id, status);

CREATE TABLE IF NOT EXISTS class_assignments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id             uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  test_id              uuid NOT NULL,                      -- logical FK → tests.id (owned by test-service)
  test_snapshot        jsonb NOT NULL DEFAULT '{}'::jsonb,
  title                varchar(160) NOT NULL,
  instructions         text,
  mode                 varchar(10) NOT NULL DEFAULT 'mock' CHECK (mode IN ('practice','mock')),
  open_at              timestamptz,
  due_at               timestamptz NOT NULL,
  close_at             timestamptz,
  allow_late           boolean NOT NULL DEFAULT true,
  max_attempts         int NOT NULL DEFAULT 1 CHECK (max_attempts >= 0),
  result_policy        varchar(15) NOT NULL DEFAULT 'immediately'
                       CHECK (result_policy IN ('immediately','after_due','manual')),
  results_released_at  timestamptz,
  extra_time           jsonb,
  status               varchar(10) NOT NULL DEFAULT 'open'
                       CHECK (status IN ('scheduled','open','closed','archived')),
  created_by           uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (open_at IS NULL OR open_at < due_at),
  CHECK (close_at IS NULL OR close_at >= due_at)
);
CREATE INDEX IF NOT EXISTS idx_class_assignments_class ON class_assignments(class_id, due_at);
CREATE INDEX IF NOT EXISTS idx_class_assignments_test ON class_assignments(test_id);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     uuid NOT NULL REFERENCES class_assignments(id) ON DELETE CASCADE,
  learner_id        uuid NOT NULL,
  attempt_id        uuid NOT NULL UNIQUE,                  -- logical FK → test_attempts.id
  attempt_no        int NOT NULL DEFAULT 1,
  status            varchar(12) NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress','submitted','late','expired')),
  skill             varchar(20),
  raw_score         int,
  ai_band           numeric(3,1),
  teacher_band      numeric(3,1) CHECK (teacher_band IS NULL OR (teacher_band >= 0 AND teacher_band <= 9)),
  final_band        numeric(3,1),
  teacher_feedback  text,
  teacher_rubric    jsonb,
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  started_at        timestamptz,
  submitted_at      timestamptz,
  graded_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_learner
  ON assignment_submissions(assignment_id, learner_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_review
  ON assignment_submissions(assignment_id) WHERE reviewed_at IS NULL AND skill IN ('writing','speaking');

CREATE TABLE IF NOT EXISTS class_posts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id           uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  author_account_id  uuid NOT NULL,
  type               varchar(15) NOT NULL DEFAULT 'announcement' CHECK (type IN ('announcement','material')),
  title              varchar(200),
  body               text NOT NULL,
  attachments        jsonb,
  pinned             boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_class_posts_class ON class_posts(class_id, pinned, created_at DESC);

COMMIT;
