-- 008_writing_revisions.sql — Writing revise-and-resubmit loop. Depends on 003 (errors_json).
BEGIN;
ALTER TABLE writing_submissions
  ADD COLUMN IF NOT EXISTS parent_submission_id uuid REFERENCES writing_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_no int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_writing_submissions_parent ON writing_submissions(parent_submission_id);
-- Comparison with the previous version: {resolved:[], remaining:[], added:[], byType:{type:{resolved,remaining,added}}, bandDelta}
ALTER TABLE ai_writing_gradings
  ADD COLUMN IF NOT EXISTS diff_json jsonb;
COMMIT;
