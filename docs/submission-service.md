# Submission Service

**Port:** 5003  
**Prefix:** `/` (no prefix — routes are flat)  
**Swagger:** http://localhost:5003/api/docs

Handles answer saving during test sessions, attempt finalization with auto-grading, and writing/speaking submission management.

---

## Entities

### TestAttempt (`test_attempts` table)

Mirror of test-service's entity — submission-service only finalizes, never creates.

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
}
```

### QuestionAttempt (`question_attempts` table)

```typescript
@Entity('question_attempts')
class QuestionAttempt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'test_attempt_id' }) testAttemptId: string;
  @Column({ name: 'question_id' }) questionId: string;
  @Column({ nullable: true }) answer: string;
  @Column({ name: 'is_correct', nullable: true }) isCorrect: boolean;
  @Column({ name: 'answered_at', nullable: true }) answeredAt: Date;
}
```

### WritingSubmission (`writing_submissions` table)

```typescript
@Entity('writing_submissions')
class WritingSubmission {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'learner_id' }) learnerId: string;
  @Column({ name: 'writing_task_id' }) writingTaskId: string;
  @Column({ type: 'text' }) content: string;
  @CreateDateColumn({ name: 'submitted_at' }) submittedAt: Date;
  @Column({ name: 'overall_band', type: 'decimal', precision: 2, scale: 1, nullable: true }) overallBand: number;
  @Column({ name: 'grading_status', nullable: true }) gradingStatus: string;
}
```

### SpeakingSubmission (`speaking_submissions` table)

```typescript
@Entity('speaking_submissions')
class SpeakingSubmission {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'learner_id' }) learnerId: string;
  @Column({ name: 'speaking_part_id' }) speakingPartId: string;
  @Column({ name: 'audio_url', type: 'text' }) audioUrl: string;
  @Column({ type: 'text', nullable: true }) transcript: string;
  @CreateDateColumn({ name: 'submitted_at' }) submittedAt: Date;
  @Column({ name: 'overall_band', type: 'decimal', precision: 2, scale: 1, nullable: true }) overallBand: number;
  @Column({ name: 'grading_status', nullable: true }) gradingStatus: string;
}
```

### WritingScore / SpeakingScore (`writing_scores` / `speaking_scores`)

```typescript
@Entity('writing_scores')
class WritingScore {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'submission_id' }) submissionId: string;
  @Column({ length: 50, nullable: true }) criterion: string;
  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true }) band: number;
  @Column({ type: 'text', nullable: true }) feedback: string;
}
```

### AiWritingGrading (`ai_writing_gradings` table)

```typescript
@Entity('ai_writing_gradings')
class AiWritingGrading {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'submission_id' }) submissionId: string;
  @Column({ name: 'model_name', length: 100, nullable: true }) modelName: string;
  @Column({ name: 'model_version', length: 50, nullable: true }) modelVersion: string;
  @Column({ name: 'prompt_version', length: 50, nullable: true }) promptVersion: string;
  @Column({ name: 'task_response', type: 'decimal', precision: 2, scale: 1, nullable: true }) taskResponse: number;
  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true }) coherence: number;
  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true }) lexical: number;
  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true }) grammar: number;
  @Column({ name: 'overall_band', type: 'decimal', precision: 2, scale: 1, nullable: true }) overallBand: number;
  @Column({ type: 'jsonb', nullable: true }) feedback: Record<string, any>;
  @Column({ name: 'confidence_score', type: 'decimal', precision: 3, scale: 2, nullable: true }) confidenceScore: number;
  @CreateDateColumn({ name: 'graded_at' }) gradedAt: Date;
}
```

---

## Band Conversion Tables

Used when auto-grading reading and listening attempts:

**Reading (raw correct → IELTS band):**

| Raw | Band | Raw | Band | Raw | Band | Raw | Band |
|---|---|---|---|---|---|---|---|
| 40 | 9.0 | 30 | 7.0 | 20 | 5.5 | 10 | 4.0 |
| 39 | 8.5 | 29 | 6.5 | 19 | 5.5 | 9 | 3.5 |
| 38 | 8.5 | 28 | 6.5 | 18 | 5.0 | 8 | 3.5 |
| 37 | 8.0 | 27 | 6.5 | 17 | 5.0 | 7 | 3.0 |
| 36 | 8.0 | 26 | 6.0 | 16 | 5.0 | 6 | 3.0 |
| 35 | 7.5 | 25 | 6.0 | 15 | 4.5 | 5 | 2.5 |
| 34 | 7.5 | 24 | 6.0 | 14 | 4.5 | 4 | 2.5 |
| 33 | 7.0 | 23 | 5.5 | 13 | 4.5 | 0–3 | 2.0 |
| 32 | 7.0 | 22 | 5.5 | 12 | 4.0 | | |
| 31 | 7.0 | 21 | 5.5 | 11 | 4.0 | | |

**Listening (raw correct → IELTS band):**

| Raw | Band | Raw | Band | Raw | Band | Raw | Band |
|---|---|---|---|---|---|---|---|
| 40 | 9.0 | 30 | 7.0 | 20 | 5.5 | 10 | 3.5 |
| 39 | 9.0 | 29 | 6.5 | 19 | 5.0 | 9 | 3.5 |
| 38 | 8.5 | 28 | 6.5 | 18 | 5.0 | 8 | 3.0 |
| 37 | 8.0 | 27 | 6.0 | 17 | 4.5 | 7 | 3.0 |
| 36 | 8.0 | 26 | 6.0 | 16 | 4.5 | 6 | 2.5 |
| 35 | 7.5 | 25 | 6.0 | 15 | 4.0 | 5 | 2.0 |
| 34 | 7.5 | 24 | 5.5 | 14 | 4.0 | 4 | 2.0 |
| 33 | 7.0 | 23 | 5.5 | 13 | 4.0 | 3 | 1.5 |
| 32 | 7.0 | 22 | 5.5 | 12 | 3.5 | 2 | 1.0 |
| 31 | 7.0 | 21 | 5.5 | 11 | 3.5 | 0–1 | 1.0 |

---

## Endpoints

### POST `/attempts`

Start a new test attempt.

**Auth:** None  
**Request body:**
```json
{ "learnerId": "uuid", "testId": "uuid" }
```
**Response:** `TestAttempt` object

---

### POST `/attempts/:id/answers`

Save or update a single answer during an active attempt.

**Auth:** None  
**Request body:**
```json
{ "questionId": "uuid", "answer": "TRUE" }
```
**Response:** `QuestionAttempt` object

Uses `UPSERT` on (`test_attempt_id`, `question_id`) — calling multiple times for the same question updates the previous answer.

---

### POST `/attempts/:id/submit`

Finalize the attempt and auto-grade reading/listening questions.

**Auth:** None  

**Logic:**
1. RPC `test.get_skill(testId)` → determine if reading/listening (auto-grade) or writing/speaking (skip)
2. If auto-gradable: RPC `test.get_answers(questionIds)` → fetch correct answers
3. Grade each `QuestionAttempt` (apply IELTS answer template expansion — see [test-service.md](test-service.md#answer-grading))
4. Count correct → look up `rawScore` in band conversion table
5. Update `test_attempts.raw_score`, `band_score`, `submitted_at`
6. Publish `analytics.test.submitted` event to RabbitMQ
7. Save all `QuestionAttempt` records

**Response:** Finalized `TestAttempt` with `bandScore` and `rawScore`

---

### GET `/attempts/:id`

Get attempt with all question attempts.

**Auth:** None  
**Response:** `TestAttempt` with nested `questionAttempts[]`

---

### GET `/learners/:learnerId/attempts`

List all attempts for a learner, sorted by `startedAt` descending.

**Auth:** None  
**Response:** `TestAttempt[]`

---

### GET `/stats/global`

Global platform statistics.

**Auth:** None  
**Response:**
```json
{
  "averageBand": 5.8,
  "totalCompleted": 1234
}
```

---

### GET `/stats/recent-activity`

Last 5 submissions with learner email and test info.

**Auth:** None  
**Response:**
```json
[{
  "email": "learner@example.com",
  "skill": "reading",
  "testTitle": "Practice Test 1",
  "bandScore": 6.5,
  "submittedAt": "2025-01-15T10:00:00.000Z"
}]
```

---

### POST `/writing-submissions`

Create a new writing submission.

**Auth:** None  
**Request body:**
```json
{
  "learnerId": "uuid",
  "writingTaskId": "uuid",
  "content": "The graph shows..."
}
```
**Response:** `WritingSubmission` with `gradingStatus: 'pending'`

**Side effect:** Publishes `grading.grade_writing` event to RabbitMQ (worker not yet fully implemented).

---

### GET `/writing-submissions/:id`

Get a single writing submission.

**Auth:** None  
**Response:** `WritingSubmission` (with scores if graded)

---

### GET `/learners/:learnerId/writing-submissions`

List all writing submissions for a learner.

**Auth:** None  
**Response:** `WritingSubmission[]`

---

### POST `/writing-gradings`

Save an AI grading result for a writing submission.

**Auth:** None  
**Request body:** `CreateWritingGradingDto`
```json
{
  "submissionId": "uuid",
  "modelName": "llama-3.3-70b-versatile",
  "modelVersion": "v1",
  "promptVersion": "writing-v2",
  "taskResponse": 6.0,
  "coherence": 6.5,
  "lexical": 6.0,
  "grammar": 5.5,
  "overallBand": 6.0,
  "feedback": { "annotated_html": "...", "suggestions": [...] },
  "confidenceScore": 0.85
}
```

**Side effect:** Updates `writing_submissions.grading_status` to `'ai_graded'`  
**Response:** `AiWritingGrading`

---

### GET `/writing-gradings/:id`

Get a grading record by its own ID.

---

### GET `/writing-gradings/by-submission/:submissionId`

Get a grading record by submission ID.

---

### POST `/speaking-submissions`

Create a new speaking submission.

**Auth:** None  
**Request body:**
```json
{
  "learnerId": "uuid",
  "speakingPartId": "uuid",
  "audioUrl": "https://cloudinary.com/...",
  "transcript": "I think traveling is very important..."
}
```
**Response:** `SpeakingSubmission` with `gradingStatus: 'pending'`

**Side effect:** Publishes `grading.grade_speaking` event to RabbitMQ.

---

### GET `/speaking-submissions/:id`

Get a single speaking submission.

---

### GET `/learners/:learnerId/speaking-submissions`

List all speaking submissions for a learner.
