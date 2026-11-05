BEGIN;
ALTER TABLE ai_writing_gradings DROP COLUMN IF EXISTS diff_json;
ALTER TABLE writing_submissions DROP COLUMN IF EXISTS parent_submission_id, DROP COLUMN IF EXISTS revision_no;
COMMIT;
