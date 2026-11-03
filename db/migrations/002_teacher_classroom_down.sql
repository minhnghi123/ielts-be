-- Rollback for 002_teacher_classroom.sql
BEGIN;
DROP TABLE IF EXISTS class_posts;
DROP TABLE IF EXISTS assignment_submissions;
DROP TABLE IF EXISTS class_assignments;
DROP TABLE IF EXISTS class_members;
DROP TABLE IF EXISTS classes;
ALTER TABLE test_attempts DROP COLUMN IF EXISTS assignment_id, DROP COLUMN IF EXISTS attempt_no;
ALTER TABLE tests DROP CONSTRAINT IF EXISTS tests_visibility_chk, DROP CONSTRAINT IF EXISTS tests_owner_role_chk;
ALTER TABLE tests DROP COLUMN IF EXISTS visibility, DROP COLUMN IF EXISTS owner_role;
DROP TABLE IF EXISTS teacher_profiles;
COMMIT;
