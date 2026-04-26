# Test Service

**Port:** 5002  
**Prefix:** `/` (flat routes)  
**Swagger:** http://localhost:5002/api/docs

Manages the full test content lifecycle: CRUD for tests/sections/questions, DOCX import, attempt creation, and auto-grading for reading/listening.

---

## Entities

### Test (`tests` table)

```typescript
@Entity('tests')
class Test {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 50, nullable: true }) skill: string;
  @Column({ length: 255, nullable: true }) title: string;
  @Column({ name: 'is_mock' }) isMock: boolean;
  @Column({ name: 'created_by' }) createdBy: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @OneToMany(() => Section, s => s.test, { cascade: true }) sections: Section[];
  @OneToMany(() => WritingTask, t => t.test, { cascade: true }) writingTasks: WritingTask[];
  @OneToMany(() => SpeakingPart, p => p.test, { cascade: true }) speakingParts: SpeakingPart[];
}
```

### Section / QuestionGroup / Question / QuestionAnswer

See [database.md](database.md) for column-level details. All use cascade delete from parent to child.

### TestAttempt (`test_attempts` table)

```typescript
@Entity('test_attempts')
class TestAttempt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'learner_id' }) learnerId: string;
  @Column({ name: 'test_id' }) testId: string;
  @CreateDateColumn({ name: 'started_at' }) startedAt: Date;
  @Column({ name: 'submitted_at', nullable: true }) submittedAt: Date;
  @Column({ name: 'raw_score', nullable: true }) rawScore: number;
  @Column({ name: 'band_score', type: 'decimal', precision: 3, scale: 1, nullable: true }) bandScore: number;
  @Column({ name: 'ai_feedback', type: 'text', nullable: true }) aiFeedback: string;
  @OneToMany(() => QuestionAttempt, qa => qa.testAttempt, { cascade: true }) questionAttempts: QuestionAttempt[];
}
```

---

## DTOs

### CreateTestDto (basic)

```typescript
{
  skill: 'reading' | 'listening' | 'writing' | 'speaking';
  title: string;
  isMock: boolean;
  createdBy: string;   // accounts.id (UUID)
}
```

### CreateManualTestDto (nested bulk creation)

```typescript
{
  skill: string; title: string; isMock: boolean; createdBy: string;
  sections: {
    sectionOrder: number;
    passage?: string;
    audioUrl?: string;
    groups: {
      groupOrder: number;
      instructions?: string;
      questions: {
        questionOrder: number;
        questionType: string;
        questionText?: string;
        config: Record<string, any>;
        explanation?: string;
        answer: { correctAnswers: string[]; caseSensitive: boolean };
      }[];
    }[];
  }[];
}
```

### CreateWritingTestDto

```typescript
{
  title: string; isMock: boolean; createdBy: string;
  tasks: {
    taskNumber: 1 | 2;
    promptText: string;
    timeLimit?: number;
    mediaUrl?: string;
    rubric?: string[];
  }[];
}
```

### CreateSpeakingTestDto

```typescript
{
  title: string; isMock: boolean; createdBy: string;
  part1: { topics: string[] };
  part2: { mainTopic: string; cues: string[]; prepTime?: number; speakTime?: number };
  part3: { questions: string[] };
}
```

### SubmitTestAttemptDto

```typescript
{
  answers: { questionId: string; answer: string }[];
  bandScore?: number;   // Optional override (for writing/speaking)
}
```

### QueryTestsDto

```typescript
{
  skill?: string;
  isMock?: boolean;
  page?: number;    // default 1
  limit?: number;   // default 20
}
```

---

## Endpoints

### POST `/tests/import`

Import a test from a `.docx` file using Mammoth for DOCX-to-HTML conversion.

**Auth:** None  
**Request:** `multipart/form-data`
- `file` — `.docx` test document
- `audioFiles[]` — optional audio files for listening sections

**Response:** Created `Test` with all nested sections/questions

---

### GET `/tests`

List tests with pagination and filters.

**Auth:** None  
**Query params:** `skill`, `isMock`, `page`, `limit`

**Response:**
```json
{
  "data": [ /* Test[] */ ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

---

### GET `/tests/:id`

Get a single test with all nested sections, question groups, questions, and answers.

**Auth:** None  
**Response:** `Test` with all relations loaded

---

### POST `/tests`

Create a minimal test record.

**Auth:** Bearer JWT  
**Request body:** `CreateTestDto`  
**Response:** `Test`

---

### POST `/tests/manual`

Create a complete test with all sections, groups, questions, and answers in a single transactional call.

**Auth:** Bearer JWT  
**Request body:** `CreateManualTestDto`  
**Response:** `Test` with all nested entities

---

### POST `/tests/writing`

Create a writing test with Task 1 and Task 2 prompts.

**Auth:** Bearer JWT  
**Request body:** `CreateWritingTestDto`  
**Response:** `Test` with `writingTasks[]`

---

### POST `/tests/speaking`

Create a speaking test with all three parts configured.

**Auth:** Bearer JWT  
**Request body:** `CreateSpeakingTestDto`  
**Response:** `Test` with `speakingParts[]`

---

### PUT `/tests/:id`

Update test metadata (title, isMock, skill).

**Auth:** Bearer JWT  
**Request body:** `Partial<CreateTestDto>`  
**Response:** Updated `Test`

---

### PUT `/tests/:id/writing`

Atomically replace all writing tasks for a test (delete old, insert new).

**Auth:** Bearer JWT  
**Request body:** `UpdateWritingTestDto`  
**Response:** `Test` with new `writingTasks[]`

---

### PUT `/tests/:id/speaking`

Atomically replace all speaking parts for a test.

**Auth:** Bearer JWT  
**Response:** `Test` with new `speakingParts[]`

---

### DELETE `/tests/:id`

Delete a test and all its sections/questions (cascade).

**Auth:** Bearer JWT  
**Response:** `{ deleted: true }`

---

### GET `/tests/:testId/sections`

Get all sections for a test with their question groups.

**Auth:** None  
**Response:** `Section[]` with nested `questionGroups[]`

---

### POST `/tests/:testId/sections`

Add a section to an existing test.

**Auth:** Bearer JWT  
**Request body:** `CreateSectionDto`  
**Response:** `Section`

---

### PUT `/sections/:sectionId`

Update a section (passage, audio URL, time limit).

**Auth:** Bearer JWT  
**Response:** Updated `Section`

---

### DELETE `/sections/:sectionId`

Delete a section and its question groups/questions.

**Auth:** Bearer JWT

---

### POST `/sections/:sectionId/groups`

Add a question group to a section.

**Auth:** Bearer JWT  
**Request body:** `CreateGroupDto`  
**Response:** `QuestionGroup`

---

### PUT `/groups/:groupId` / DELETE `/groups/:groupId`

Update or delete a question group.

**Auth:** Bearer JWT

---

### GET `/groups/:groupId/questions`

Get all questions in a group with their answers.

**Auth:** None  
**Response:** `Question[]` with nested `answer`

---

### POST `/groups/:groupId/questions`

Add a question with its answer to a group.

**Auth:** Bearer JWT  
**Request body:** `CreateQuestionDto`  
**Response:** `Question` with `answer`

---

### PUT `/questions/:questionId` / DELETE `/questions/:questionId`

Update or delete a question.

**Auth:** Bearer JWT

---

### GET `/tests/:testId/writing-tasks`

Get writing tasks for a test.

**Auth:** None  
**Response:** `WritingTask[]`

---

### POST `/tests/:testId/writing-tasks`

Add a writing task to a test.

**Auth:** Bearer JWT  
**Request body:** `CreateWritingTaskDto`  
**Response:** `WritingTask`

---

### GET `/tests/:testId/speaking-parts`

Get speaking parts for a test.

**Auth:** None  
**Response:** `SpeakingPart[]`

---

### POST `/tests/:testId/speaking-parts`

Add a speaking part to a test.

**Auth:** Bearer JWT  
**Request body:** `CreateSpeakingPartDto`  
**Response:** `SpeakingPart`

---

### POST `/tests/:testId/attempts`

Start a new test attempt.

**Auth:** Bearer JWT  
**Request body:**
```json
{ "learnerId": "uuid" }
```
**Response:** `TestAttempt`

---

### POST `/attempts/:attemptId/submit`

Submit an attempt with all answers and auto-grade reading/listening.

**Auth:** Bearer JWT  
**Request body:** `SubmitTestAttemptDto`

**Grading logic:**
1. Fetch `QuestionAnswer` records for all submitted question IDs
2. Expand IELTS answer templates (see below)
3. Compare learner answer vs expanded acceptable answer set
4. Count correct → convert to IELTS band via lookup table
5. Save all `QuestionAttempt` records with `is_correct` set
6. Update `test_attempts.raw_score`, `band_score`, `submitted_at`
7. POST to analytics-service: `http://localhost:5004/analytics/sync/:learnerId`

**Response:** Finalized `TestAttempt`

---

### GET `/attempts/:attemptId`

Get a test attempt with all question attempts.

**Auth:** None  
**Response:** `TestAttempt` with nested `questionAttempts[]`

---

### GET `/attempts`

Get all attempts for a learner.

**Auth:** None  
**Query param:** `learnerId` (required)  
**Response:** `TestAttempt[]`

---

### PUT `/attempts/:attemptId/ai-feedback`

Save AI-generated markdown feedback to the attempt.

**Auth:** Bearer JWT  
**Request body:**
```json
{ "feedback": "## Performance Summary\n..." }
```
**Response:** Updated `TestAttempt`

---

## Answer Grading — Template Expansion

When grading reading/listening, the service expands IELTS answer templates into a set of all acceptable strings before comparing.

**Expansion rules:**

| Template syntax | Example | Expands to |
|---|---|---|
| `[OR]` alternation | `"MIDNIGHT [OR] 12 A.M."` | `["MIDNIGHT", "12 A.M."]` |
| `(optional word)` | `"(FREDERICK) FLEET"` | `["FLEET", "FREDERICK FLEET"]` |
| `a/b` slash variant | `"A.M./AM"` | `["A.M.", "AM"]` |
| TFNG aliases | `"ng"`, `"n/g"`, `"not-given"` | `"NOT GIVEN"` |

Combined example: `"MIDNIGHT [OR] 12(.00) A.M./AM"` expands to:
`["MIDNIGHT", "12 A.M.", "12 AM", "12.00 A.M.", "12.00 AM"]`

Case sensitivity is controlled per-question via `question_answers.case_sensitive`.

---

## RMQ Handlers

### `@MessagePattern(RMQ_PATTERNS.TEST.GET_ANSWERS)`

Returns correct answers for a list of question IDs.

**Input:** `string[]` (question IDs)  
**Output:** `{ questionId: string; correctAnswers: string[]; caseSensitive: boolean }[]`

### `@MessagePattern(RMQ_PATTERNS.TEST.GET_SKILL)`

Returns the skill type for a test.

**Input:** `string` (testId)  
**Output:** `{ skill: 'reading' | 'listening' | 'writing' | 'speaking' }`
