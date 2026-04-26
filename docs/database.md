# Backend — Database Schema

Provider: **PostgreSQL via Supabase PgBouncer** (transaction mode, port 6543).  
DDL source: [`db/database_schema.sql`](../db/database_schema.sql) — apply manually, `synchronize: false`.

---

## Table Ownership

| Service | Tables |
|---|---|
| **auth-service** | `accounts`, `learner_profiles`, `admin_profiles`, `admin_roles`, `admin_role_assignments` |
| **test-service** | `tests`, `sections`, `question_groups`, `questions`, `question_answers`, `writing_tasks`, `speaking_parts`, `test_attempts` (create only) |
| **submission-service** | `test_attempts` (finalize), `question_attempts`, `writing_submissions`, `writing_scores`, `ai_writing_gradings`, `speaking_submissions`, `speaking_scores` |
| **analytics-service** | `learner_band_profiles`, `learner_mistakes`, `learner_progress_snapshots` |

Cross-service notes:
- `test_attempts` is **created** by test-service and **finalized** by submission-service. Both services have TypeORM entities for it.
- analytics-service runs raw cross-service SQL (joins across `test_attempts`, `question_attempts`, auth tables).

---

## Entity Relationship Overview

```
accounts ──────────── learner_profiles ──── learner_band_profiles
         └──────────── admin_profiles       learner_progress_snapshots
                                            learner_mistakes
tests ──── sections ──── question_groups ──── questions ──── question_answers
      └──── writing_tasks                                └──── question_attempts ← test_attempts
      └──── speaking_parts                writing_submissions ──── writing_scores
                                                             └──── ai_writing_gradings
                                         speaking_submissions ──── speaking_scores
```

---

## Tables (public schema)

### `accounts`

Central user table. Both learners and admins have an account.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `uuid_generate_v4()` | Primary key |
| `email` | `varchar` | NO | — | Unique email address |
| `password` | `varchar` | YES | — | bcrypt hash. NULL for OAuth-only accounts |
| `status` | `varchar` | NO | `'active'` | Account status |
| `full_name` | `varchar` | YES | — | Display name |
| `avatar_url` | `varchar` | YES | — | Cloudinary or external URL |
| `created_at` | `timestamp` | NO | `now()` | |
| `updated_at` | `timestamp` | NO | `now()` | |

---

### `learner_profiles`

One-to-one with `accounts` for learner-specific data.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `uuid_generate_v4()` | Primary key; used as `learnerId` FK in submissions/analytics |
| `account_id` | `uuid` | NO | — | FK → `accounts.id` |
| `current_level` | `varchar` | NO | `'beginner'` | Self-reported level |
| `created_at` | `timestamp` | NO | `now()` | |

---

### `admin_profiles`

One-to-one with `accounts` for admin-specific data.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `uuid_generate_v4()` | Primary key |
| `account_id` | `uuid` | NO | — | FK → `accounts.id` |
| `created_at` | `timestamp` | NO | `now()` | |

---

### `admin_roles`

Role definitions for RBAC (not yet enforced at gateway level).

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `uuid` | NO | Primary key |
| `name` | `varchar(50)` | YES | Role name (e.g., `'super_admin'`, `'content_manager'`) |

---

### `admin_role_assignments`

Many-to-many join between admins and roles.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `admin_id` | `uuid` | NO | FK → `admin_profiles.id` |
| `role_id` | `uuid` | NO | FK → `admin_roles.id` |

---

### `tests`

Top-level test metadata.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `skill` | `varchar(50)` | YES | — | `'reading'` \| `'listening'` \| `'writing'` \| `'speaking'` |
| `title` | `varchar(255)` | YES | — | Display title |
| `is_mock` | `boolean` | NO | — | `true` = timed mock exam |
| `created_by` | `uuid` | NO | — | FK → `accounts.id` of creator |
| `created_at` | `timestamp` | NO | `now()` | |

---

### `sections`

A test is split into sections (reading passages, listening tracks).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `test_id` | `uuid` | NO | — | FK → `tests.id` |
| `section_order` | `integer` | NO | — | 1-based ordering within test |
| `passage` | `text` | YES | — | Reading passage (HTML/plain text) |
| `audio_url` | `text` | YES | — | Cloudinary audio URL for listening |
| `time_limit` | `integer` | YES | — | Section time limit in seconds |

---

### `question_groups`

Groups of related questions within a section (e.g., "Questions 1–5: True/False/Not Given").

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `section_id` | `uuid` | NO | — | FK → `sections.id` |
| `group_order` | `integer` | NO | — | 1-based ordering within section |
| `instructions` | `text` | YES | — | Instruction text shown above questions |

---

### `questions`

Individual questions. The `config` JSONB field holds type-specific data.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `question_group_id` | `uuid` | NO | — | FK → `question_groups.id` |
| `question_order` | `integer` | NO | — | 1-based ordering within group |
| `question_type` | `varchar(50)` | YES | — | See question types below |
| `question_text` | `text` | YES | — | Question stem |
| `config` | `jsonb` | NO | — | Type-specific config (options, pairs, etc.) |
| `explanation` | `text` | YES | — | Explanation for review |

**Question types and `config` shapes:**

| `question_type` | `config` fields |
|---|---|
| `multiple_choice` | `{ options: string[] }` |
| `fill_in_blank` | `{ blanks: number }` |
| `matching` | `{ pairs: { left: string, right: string }[] }` |
| `heading_matching` | `{ headings: string[], paragraphs: string[] }` |
| `matching_features` | `{ features: string[], statements: string[] }` |
| `sentence_ending` | `{ sentence_starts: string[], endings: string[] }` |

---

### `question_answers`

Correct answers for auto-gradable questions. Stored separate from `questions` to allow secure answer-hiding.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `question_id` | `uuid` | NO | — | FK → `questions.id` (unique) |
| `correct_answers` | `text[]` | NO | — | PostgreSQL array of acceptable answers |
| `case_sensitive` | `boolean` | NO | — | Whether grading is case-sensitive |

**Answer template syntax** (parsed by test-service grader):
- `[OR]` — alternation: `"MIDNIGHT [OR] 12(.00) A.M./AM"` → two options
- `(text)` — optional word: `"(FREDERICK) FLEET"` → `"FLEET"` or `"FREDERICK FLEET"`
- `a/b` — slash variants: `"A.M./AM"` → `"A.M."` or `"AM"`
- TFNG aliases: `"ng"`, `"n/g"`, `"not-given"` all map to `"NOT GIVEN"`

---

### `writing_tasks`

Prompts for writing tests (Task 1 and Task 2).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `test_id` | `uuid` | NO | — | FK → `tests.id` |
| `task_number` | `integer` | NO | — | `1` or `2` |
| `prompt` | `text` | NO | — | Writing task prompt |
| `word_limit` | `integer` | NO | — | Minimum word count (150 for Task 1, 250 for Task 2) |
| `config` | `jsonb` | YES | `'{}'` | Optional: `{ timeLimit, mediaUrl, rubric[] }` |

---

### `speaking_parts`

Configuration for each part of a speaking test.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `test_id` | `uuid` | NO | — | FK → `tests.id` |
| `part_number` | `integer` | NO | — | `1` (Interview), `2` (Cue Card), `3` (Discussion) |
| `prompt` | `text` | YES | — | Overall part description |
| `config` | `jsonb` | YES | `'{}'` | See config shape in [types.md](../../my-app/docs/types.md#speakingpart) |

---

### `test_attempts`

Records of a learner taking a test. Created by test-service, finalized by submission-service.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `learner_id` | `uuid` | NO | — | FK → `learner_profiles.id` |
| `test_id` | `uuid` | NO | — | FK → `tests.id` |
| `started_at` | `timestamp` | NO | `now()` | When the attempt was created |
| `submitted_at` | `timestamp` | YES | — | When submitted; `NULL` = in progress |
| `raw_score` | `integer` | YES | — | Correct answer count (reading/listening) |
| `band_score` | `numeric(3,1)` | YES | — | IELTS band 0.0–9.0 |
| `ai_feedback` | `text` | YES | — | Markdown AI analysis from `/api/ai/analyze-result` |

---

### `question_attempts`

Individual question responses within a test attempt.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `test_attempt_id` | `uuid` | NO | — | FK → `test_attempts.id` |
| `question_id` | `uuid` | NO | — | FK → `questions.id` |
| `answer` | `text` | YES | — | Learner's answer |
| `is_correct` | `boolean` | YES | — | Graded result (`NULL` = ungraded) |
| `answered_at` | `timestamp` | YES | `now()` | |

---

### `writing_submissions`

Learner writing essay submissions.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `learner_id` | `uuid` | NO | — | FK → `learner_profiles.id` |
| `writing_task_id` | `uuid` | NO | — | FK → `writing_tasks.id` |
| `content` | `text` | NO | — | Full essay text |
| `submitted_at` | `timestamp` | NO | `now()` | |
| `overall_band` | `numeric(2,1)` | YES | — | Combined IELTS band |
| `grading_status` | `varchar(30)` | YES | — | `'pending'` \| `'ai_graded'` \| `'human_reviewed'` |

---

### `writing_scores`

Per-criterion band scores for a writing submission.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `uuid` | NO | Primary key |
| `submission_id` | `uuid` | NO | FK → `writing_submissions.id` |
| `criterion` | `varchar(50)` | YES | e.g., `'Task Achievement'`, `'Coherence and Cohesion'`, `'Lexical Resource'`, `'Grammatical Range and Accuracy'` |
| `band` | `numeric(2,1)` | YES | 0.0–9.0 |
| `feedback` | `text` | YES | Criterion-level feedback |

---

### `ai_writing_gradings`

Raw AI model output for a writing submission.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `submission_id` | `uuid` | NO | — | FK → `writing_submissions.id` |
| `model_name` | `varchar(100)` | YES | — | e.g., `'llama-3.3-70b-versatile'` |
| `model_version` | `varchar(50)` | YES | — | |
| `prompt_version` | `varchar(50)` | YES | — | Grading prompt version for reproducibility |
| `task_response` | `numeric(2,1)` | YES | — | Task Response criterion band |
| `coherence` | `numeric(2,1)` | YES | — | Coherence and Cohesion band |
| `lexical` | `numeric(2,1)` | YES | — | Lexical Resource band |
| `grammar` | `numeric(2,1)` | YES | — | Grammatical Range and Accuracy band |
| `overall_band` | `numeric(2,1)` | YES | — | Computed overall band |
| `feedback` | `jsonb` | YES | — | Full AI response including annotated HTML, suggestions |
| `confidence_score` | `numeric(3,2)` | YES | — | Model confidence 0.00–1.00 |
| `graded_at` | `timestamp` | NO | `now()` | |

---

### `speaking_submissions`

Learner audio recordings for speaking parts.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `learner_id` | `uuid` | NO | — | FK → `learner_profiles.id` |
| `speaking_part_id` | `uuid` | NO | — | FK → `speaking_parts.id` |
| `audio_url` | `text` | NO | — | Cloudinary audio URL |
| `transcript` | `text` | YES | — | Optional STT transcript |
| `submitted_at` | `timestamp` | NO | `now()` | |
| `overall_band` | `numeric(2,1)` | YES | — | |
| `grading_status` | `varchar(30)` | YES | — | `'pending'` \| `'ai_graded'` \| `'human_reviewed'` |

---

### `speaking_scores`

Per-criterion scores for a speaking submission.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `uuid` | NO | Primary key |
| `submission_id` | `uuid` | NO | FK → `speaking_submissions.id` |
| `criterion` | `varchar(50)` | YES | e.g., `'Fluency and Coherence'`, `'Lexical Resource'`, `'Grammatical Range'`, `'Pronunciation'` |
| `band` | `numeric(2,1)` | YES | |
| `feedback` | `text` | YES | |

---

### `ai_speaking_gradings`

Raw AI model output for a speaking submission.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `submission_id` | `uuid` | NO | — | FK → `speaking_submissions.id` |
| `model_name` | `varchar(100)` | YES | — | |
| `model_version` | `varchar(50)` | YES | — | |
| `fluency` | `numeric(2,1)` | YES | — | Fluency and Coherence band |
| `lexical` | `numeric(2,1)` | YES | — | Lexical Resource band |
| `grammar` | `numeric(2,1)` | YES | — | Grammatical Range band |
| `pronunciation` | `numeric(2,1)` | YES | — | Pronunciation band |
| `overall_band` | `numeric(2,1)` | YES | — | |
| `feedback` | `jsonb` | YES | — | Full AI output |
| `confidence_score` | `numeric(3,2)` | YES | — | |
| `graded_at` | `timestamp` | NO | `now()` | |

---

### `learner_band_profiles`

Current and target IELTS band per skill for a learner.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | — | Primary key (set by application before insert) |
| `learner_id` | `uuid` | NO | — | FK → `learner_profiles.id` |
| `skill` | `varchar(50)` | YES | — | `'reading'` \| `'listening'` \| `'writing'` \| `'speaking'` \| `'overall'` |
| `current_band` | `numeric(2,1)` | YES | — | Most recent assessed band |
| `target_band` | `numeric(2,1)` | YES | — | Learner's goal band |
| `assessed_at` | `timestamp` | NO | `now()` | |

---

### `learner_progress_snapshots`

Time-series band history for progress charts.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | — | Primary key |
| `learner_id` | `uuid` | NO | — | FK → `learner_profiles.id` |
| `overall_band` | `numeric(2,1)` | YES | — | Overall band at this point in time |
| `snapshot_at` | `timestamp` | NO | `now()` | One row per completed test attempt |

---

### `learner_mistakes`

Log of incorrect question attempts for analytics.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | — | Primary key |
| `learner_id` | `uuid` | NO | — | FK → `learner_profiles.id` |
| `question_id` | `uuid` | NO | — | FK → `questions.id` |
| `mistake_type` | `varchar(50)` | YES | — | `question_type` of the missed question |
| `created_at` | `timestamp` | NO | `now()` | |

---

## Schema Management

All DDL is managed in `db/database_schema.sql`. To apply:

```sql
-- Connect to Supabase via psql or Supabase SQL editor
\i db/database_schema.sql
```

**Never** enable `synchronize: true` in TypeORM — it will attempt to auto-alter the live schema and can cause data loss.

To add a new column:
1. Write the `ALTER TABLE` statement in `database_schema.sql`
2. Apply it manually to the Supabase database
3. Update the TypeORM entity to reflect the new column
4. Update the relevant DTO and service
