-- 001_exam_realism.sql
-- Adds difficulty / publishing status to tests and a server-side attempt lifecycle
-- (deadline, autosave draft, status). Safe to run multiple times.

ALTER TABLE tests
    ADD COLUMN IF NOT EXISTS difficulty  varchar(20) NOT NULL DEFAULT 'medium',
    ADD COLUMN IF NOT EXISTS status      varchar(20) NOT NULL DEFAULT 'published',
    ADD COLUMN IF NOT EXISTS description text,
    ADD COLUMN IF NOT EXISTS duration_minutes integer;

ALTER TABLE tests
    DROP CONSTRAINT IF EXISTS tests_difficulty_check,
    ADD CONSTRAINT tests_difficulty_check CHECK (difficulty IN ('easy', 'medium', 'hard')),
    DROP CONSTRAINT IF EXISTS tests_status_check,
    ADD CONSTRAINT tests_status_check CHECK (status IN ('draft', 'published', 'archived'));

ALTER TABLE test_attempts
    ADD COLUMN IF NOT EXISTS status           varchar(20) NOT NULL DEFAULT 'in_progress',
    ADD COLUMN IF NOT EXISTS duration_seconds integer,
    ADD COLUMN IF NOT EXISTS expires_at       timestamptz,
    ADD COLUMN IF NOT EXISTS draft_answers    jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS last_saved_at    timestamptz,
    ADD COLUMN IF NOT EXISTS is_practice      boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ai_feedback      text;

ALTER TABLE test_attempts
    DROP CONSTRAINT IF EXISTS test_attempts_status_check,
    ADD CONSTRAINT test_attempts_status_check CHECK (status IN ('in_progress', 'submitted', 'expired'));

-- Historic rows: anything already submitted is "submitted".
UPDATE test_attempts SET status = 'submitted' WHERE submitted_at IS NOT NULL AND status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_test_attempts_learner_status ON test_attempts (learner_id, status);
CREATE INDEX IF NOT EXISTS idx_test_attempts_learner_test ON test_attempts (learner_id, test_id);
CREATE INDEX IF NOT EXISTS idx_tests_status_skill ON tests (status, skill);

-- Account lifecycle used by the admin user-management screen.
ALTER TABLE accounts
    DROP CONSTRAINT IF EXISTS accounts_status_check,
    ADD CONSTRAINT accounts_status_check CHECK (status IN ('active', 'suspended', 'deleted'));
