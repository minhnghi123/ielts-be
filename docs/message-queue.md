# Backend — Message Queue (RabbitMQ)

RabbitMQ is provisioned and packages are installed. Inter-service messaging is **partially implemented** — RPC patterns (test.get_answers, test.get_skill) are fully wired; event-based grading patterns are defined but the consumer workers are not yet complete.

---

## Configuration

| Setting | Value |
|---|---|
| AMQP URL | `amqp://guest:guest@localhost:5672` (or `rabbitmq:5672` in Docker) |
| Queue name | `ielts_messages` |
| Queue type | Durable |
| Transport | `Transport.RMQ` (NestJS `@nestjs/microservices`) |

Services using RabbitMQ: `test-service`, `submission-service`, `analytics-service`.

---

## Pattern Constants

**File:** `libs/common/src/events/rmq-patterns.ts`

```typescript
export const RMQ_PATTERNS = {
  ANALYTICS: {
    TEST_SUBMITTED: 'analytics.test.submitted',
  },
  GRADING: {
    GRADE_WRITING: 'grading.grade_writing',
    GRADE_SPEAKING: 'grading.grade_speaking',
  },
  TEST: {
    GET_ANSWERS: 'test.get_answers',
    GET_SKILL: 'test.get_skill',
  },
};
```

Always import from this constant — never hardcode pattern strings.

---

## Pattern Reference

### 1. `test.get_answers` — RPC

**Status:** Fully implemented  
**Publisher:** submission-service  
**Consumer:** test-service  
**Purpose:** Submission-service needs correct answers to auto-grade reading/listening attempts without direct DB access to test-service tables.

**Request payload:**
```typescript
string[]  // Array of question IDs
```

**Response payload:**
```typescript
{
  questionId: string;
  correctAnswers: string[];
  caseSensitive: boolean;
}[]
```

**Flow:**
```
submission-service.submitAttempt()
    → RPC: test.get_answers([questionId1, questionId2, ...])
    ← [{ questionId, correctAnswers, caseSensitive }, ...]
    → grade each question_attempt locally
```

---

### 2. `test.get_skill` — RPC

**Status:** Fully implemented  
**Publisher:** submission-service  
**Consumer:** test-service  
**Purpose:** Determine whether a test is reading/listening (auto-gradable) or writing/speaking (requires AI grading).

**Request payload:**
```typescript
string  // testId
```

**Response payload:**
```typescript
{ skill: 'reading' | 'listening' | 'writing' | 'speaking' }
```

---

### 3. `analytics.test.submitted` — Event

**Status:** Fully implemented  
**Publisher:** submission-service  
**Consumer:** analytics-service  
**Purpose:** Trigger a full analytics sync after a test attempt is submitted.

**Payload:**
```typescript
{
  learnerId: string;
  testId: string;
  attemptId: string;
  skill: 'reading' | 'listening' | 'writing' | 'speaking';
  bandScore: number | null;
  submittedAt: string;  // ISO 8601
}
```

**Consumer handler (analytics-service):**
```typescript
@EventPattern(RMQ_PATTERNS.ANALYTICS.TEST_SUBMITTED)
async handleTestSubmitted(data: TestSubmittedEvent) {
  await this.analyticsService.fullSyncLearnerAnalytics(data.learnerId);
}
```

`fullSyncLearnerAnalytics` rebuilds all band profiles, progress snapshots, and mistakes for the learner from scratch.

---

### 4. `grading.grade_writing` — Event

**Status:** Defined, not fully wired (consumer worker incomplete)  
**Publisher:** submission-service  
**Consumer:** submission-service (intended as a background worker)  
**Purpose:** Dispatch AI writing grading as an async background task.

**Payload:**
```typescript
{
  submissionId: string;
  writingTaskId: string;
  learnerId: string;
  content: string;
}
```

**Current behavior:** The event is published when a writing submission is created, but the consumer worker that calls the Groq AI grading endpoint is not yet fully implemented. Writing grading is currently triggered synchronously via the Next.js `/api/ai/grade-writing` route instead.

---

### 5. `grading.grade_speaking` — Event

**Status:** Defined, not fully wired (consumer worker incomplete)  
**Publisher:** submission-service  
**Consumer:** submission-service (intended as a background worker)  
**Purpose:** Dispatch AI speaking grading as an async background task.

**Payload:**
```typescript
{
  submissionId: string;
  speakingPartId: string;
  learnerId: string;
  audioUrl: string;
  transcript?: string;
}
```

---

## Event Flow Diagram

```
                    ┌──────────────────┐
                    │  test-service    │
                    │  (port 5002)     │
                    │                  │
                    │  @MessagePattern │◄──RPC── test.get_answers
                    │  @MessagePattern │◄──RPC── test.get_skill
                    └──────────────────┘
                            ▲ RPC
                            │
                    ┌──────────────────┐
                    │submission-service│
                    │  (port 5003)     │
                    │                  │
                    │  publishEvent ──►│── analytics.test.submitted ──►┐
                    │  publishEvent ──►│── grading.grade_writing   ──►┐│
                    │  publishEvent ──►│── grading.grade_speaking  ──►│││
                    └──────────────────┘                              │││
                                                                      │││
                    ┌──────────────────┐                              │││
                    │analytics-service │◄─────────────────────────────┘││
                    │  (port 5004)     │  @EventPattern                 ││
                    │                  │  fullSyncLearnerAnalytics      ││
                    └──────────────────┘                                ││
                                                                        ││
                    ┌──────────────────┐                                ││
                    │submission-service│◄───────────────────────────────┘│
                    │  (grading worker)│  @EventPattern (not yet impl)   │
                    └──────────────────┘                                 │
                                                                         │
                    (speaking worker — not yet implemented) ◄────────────┘
```

---

## Adding a New Pattern

1. Add the pattern string to `RMQ_PATTERNS` in `libs/common/src/events/rmq-patterns.ts`
2. Define the payload interface
3. Publisher: inject `ClientProxy` and call `client.emit(RMQ_PATTERNS.X.Y, payload)` (event) or `client.send(...)` (RPC)
4. Consumer: add `@EventPattern(RMQ_PATTERNS.X.Y)` or `@MessagePattern(...)` handler to the target service's controller
5. Register `ClientsModule.registerAsync([{ name: 'IELTS_SERVICE', ... }])` in the publisher's module
