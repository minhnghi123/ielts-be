# Backend — Complete API Reference

All endpoints exposed through the API Gateway (port 5000). The gateway proxies to the appropriate microservice — the prefix `/api/` is added by the gateway.

**Base URL:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <jwt>` (from login response)  
**All responses wrapped in:** `{ statusCode, message, data }` (see [response-format.md](response-format.md))

---

## Auth Service (`/api/auth/`)

Proxied to: `http://localhost:5001/auth/*`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Register new learner |
| POST | `/api/auth/login` | None | Login, returns JWT |
| POST | `/api/auth/google` | None | Google OAuth token exchange |
| GET | `/api/auth/profile` | Bearer | Get current user's profile |
| PUT | `/api/auth/profile` | Bearer | Update fullName / avatarUrl |
| GET | `/api/auth/users` | None* | Get paginated user list |

*Admin guard not enforced at gateway — frontend enforces role.

---

## Test Service — Tests (`/api/tests/`)

Proxied to: `http://localhost:5002/tests*`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tests` | None | List tests (`?skill`, `?isMock`, `?page`, `?limit`) |
| GET | `/api/tests/:id` | None | Get test with all sections/questions |
| POST | `/api/tests` | Bearer | Create minimal test |
| POST | `/api/tests/manual` | Bearer | Create test with nested sections/questions |
| POST | `/api/tests/writing` | Bearer | Create writing test (Task 1+2) |
| POST | `/api/tests/speaking` | Bearer | Create speaking test (Part 1+2+3) |
| POST | `/api/tests/import` | None | Import from .docx (multipart) |
| PUT | `/api/tests/:id` | Bearer | Update test metadata |
| PUT | `/api/tests/:id/writing` | Bearer | Replace writing tasks |
| PUT | `/api/tests/:id/speaking` | Bearer | Replace speaking parts |
| DELETE | `/api/tests/:id` | Bearer | Delete test (cascades) |

---

## Test Service — Sections (`/api/tests/:testId/sections`, `/api/sections/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tests/:testId/sections` | None | List sections with groups |
| POST | `/api/tests/:testId/sections` | Bearer | Add section to test |
| PUT | `/api/sections/:sectionId` | Bearer | Update section |
| DELETE | `/api/sections/:sectionId` | Bearer | Delete section (cascades) |

---

## Test Service — Question Groups (`/api/sections/:sectionId/groups`, `/api/groups/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/sections/:sectionId/groups` | Bearer | Add group to section |
| PUT | `/api/groups/:groupId` | Bearer | Update group |
| DELETE | `/api/groups/:groupId` | Bearer | Delete group (cascades) |

---

## Test Service — Questions (`/api/groups/:groupId/questions`, `/api/questions/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/groups/:groupId/questions` | None | List questions with answers |
| POST | `/api/groups/:groupId/questions` | Bearer | Add question with answer |
| PUT | `/api/questions/:questionId` | Bearer | Update question |
| DELETE | `/api/questions/:questionId` | Bearer | Delete question |

---

## Test Service — Writing Tasks (`/api/tests/:testId/writing-tasks`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tests/:testId/writing-tasks` | None | Get writing task prompts |
| POST | `/api/tests/:testId/writing-tasks` | Bearer | Add writing task |
| DELETE | `/api/writing-tasks/:taskId` | Bearer | Delete writing task |

---

## Test Service — Speaking Parts (`/api/tests/:testId/speaking-parts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tests/:testId/speaking-parts` | None | Get speaking part configs |
| POST | `/api/tests/:testId/speaking-parts` | Bearer | Add speaking part |
| DELETE | `/api/speaking-parts/:partId` | Bearer | Delete speaking part |

---

## Test Service — Attempts (creation + query)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/tests/:testId/attempts` | Bearer | Start test attempt |
| POST | `/api/attempts/:attemptId/submit` | Bearer | Submit + auto-grade attempt |
| GET | `/api/attempts/:attemptId` | None | Get attempt with question attempts |
| GET | `/api/attempts?learnerId=<id>` | None | List attempts for learner |
| PUT | `/api/attempts/:attemptId/ai-feedback` | Bearer | Save AI feedback markdown |

---

## Submission Service — Attempt Flow

Proxied to: `http://localhost:5003/*`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/attempts` | None | Start attempt (submission-service) |
| POST | `/api/attempts/:id/answers` | None | Save/update single answer |
| POST | `/api/attempts/:id/submit` | None | Finalize + auto-grade |
| GET | `/api/attempts/:id` | None | Get attempt with question attempts |
| GET | `/api/learners/:learnerId/attempts` | None | List learner's attempts |

---

## Submission Service — Stats

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/stats/global` | None | Avg band, total completed |
| GET | `/api/stats/recent-activity` | None | Last 5 submissions |

---

## Submission Service — Writing

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/writing-submissions` | None | Submit writing essay |
| GET | `/api/writing-submissions/:id` | None | Get submission |
| GET | `/api/learners/:learnerId/writing-submissions` | None | List learner's writing |
| POST | `/api/writing-gradings` | None | Save AI grading result |
| GET | `/api/writing-gradings/:id` | None | Get grading by ID |
| GET | `/api/writing-gradings/by-submission/:submissionId` | None | Get grading by submission |

---

## Submission Service — Speaking

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/speaking-submissions` | None | Submit recording URL |
| GET | `/api/speaking-submissions/:id` | None | Get submission |
| GET | `/api/learners/:learnerId/speaking-submissions` | None | List learner's speaking |

---

## Analytics Service

Proxied to: `http://localhost:5004/analytics/*`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/analytics/summary/:learnerId` | None | Full dashboard summary |
| GET | `/api/analytics/band-profiles/:learnerId` | None | Per-skill band profiles |
| PUT | `/api/analytics/band-profiles` | None | Upsert band profile |
| GET | `/api/analytics/progress/:learnerId` | None | Progress time series |
| POST | `/api/analytics/progress/snapshot` | None | Create progress snapshot |
| GET | `/api/analytics/mistakes/:learnerId` | None | Mistake log |
| POST | `/api/analytics/mistakes` | None | Record mistake |
| POST | `/api/analytics/sync/:learnerId` | None | Rebuild learner analytics |
| POST | `/api/analytics/sync-all` | None | Rebuild all learners |
| GET | `/api/analytics/admin/global-stats` | None* | Platform-wide metrics |

*Admin guard not enforced at gateway.

---

## Common Request/Response Patterns

### Pagination

Paginated endpoints accept:
- `page` (integer, default: 1)
- `limit` (integer, default: 20)

And return:
```json
{
  "data": [],
  "total": 100,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

### UUID Validation

All ID parameters are UUIDs. Passing a non-UUID will return 400 with a class-validator error.

### Bearer Token

All `Bearer` endpoints require:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Missing or expired tokens return 401. The frontend Axios interceptor handles this by redirecting to `/login`.

### Error Response Shape

```json
{
  "statusCode": 400,
  "timestamp": "2025-01-15T10:00:00.000Z",
  "path": "/api/tests",
  "error": "Validation failed: title must be a string",
  "rawException": { ... }
}
```
