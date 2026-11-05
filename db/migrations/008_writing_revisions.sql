-- 008_writing_revisions.sql — Writing revise-and-resubmit loop. Depends on 003 (errors_json).
BEGIN;
ALTER TABLE writing_submissions
  -- plain uuid (no FK): the production table predates this migration and has no PK constraint on id
  ADD COLUMN IF NOT EXISTS parent_submission_id uuid,
  ADD COLUMN IF NOT EXISTS revision_no int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_writing_submissions_parent ON writing_submissions(parent_submission_id);
-- Comparison with the previous version: {resolved:[], remaining:[], added:[], byType:{type:{resolved,remaining,added}}, bandDelta}
ALTER TABLE ai_writing_gradings
  ADD COLUMN IF NOT EXISTS diff_json jsonb;
COMMIT;
