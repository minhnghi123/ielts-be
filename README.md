<div align="center">

# IELTS-MN — Backend

**NestJS Microservices API for an AI-powered IELTS practice platform**

[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.1-3178C6?logo=typescript)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-3ECF8E?logo=supabase)](https://supabase.com)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3.x-FF6600?logo=rabbitmq)](https://rabbitmq.com)

</div>

---

## About the Project

**IELTS-MN** is the graduation thesis project of **Nghi Minh Nguyen** — a full-stack online IELTS practice platform powered by large language models.

### Background & Motivation

The IELTS exam is a critical milestone for millions of students in Vietnam who aspire to study abroad, immigrate, or work in international environments. Yet most learners face the same fundamental pain points:

- **No quality feedback** — Writing and Speaking require human graders. Costs are high, turnaround is slow, and access is limited.
- **No insight into weak areas** — After finishing a test, learners see a score but not *which question types* they consistently fail or *which skill* needs the most work.
- **No personalized study path** — Every learner has a different current band and a different target. A one-size-fits-all curriculum doesn't work.
- **No realistic practice environment** — Access to authentic, timed, full-length test simulations is scarce.

### What This Project Sets Out to Solve

> *Give every learner a personal IELTS assistant — available 24/7, grading instantly, tracking progress continuously, and recommending exactly what to study next.*

This backend provides the full data and business logic infrastructure for the platform:

1. **Test content management** — Full CRUD for all 4 skills, DOCX import via Mammoth, support for 6 standard IELTS question types.
2. **Reading & Listening auto-grading** — Scores against the official British Council band conversion tables, handles complex answer template syntax (`[OR]`, `()`, `/`).
3. **Submission management** — Stores Writing and Speaking submissions, coordinates AI grading dispatch via RabbitMQ.
4. **Analytics engine** — Computes per-skill band profiles, tracks progress over time, logs mistakes by question type, serves learner and admin dashboards.
5. **Auth & identity** — JWT-based auth, Google OAuth via Supabase, learner/admin role separation.

---

## Microservices Architecture

```
                        ┌──────────────────┐
                        │   API Gateway    │  :5000
                        │  (HTTP Proxy)    │
                        │  CORS · Swagger  │
                        └────────┬─────────┘
                                 │ Proxy (Axios)
           ┌─────────────────────┼─────────────────────┐
           │                     │                     │
    ┌──────▼──────┐    ┌─────────▼──────┐    ┌────────▼──────┐
    │auth-service │    │  test-service  │    │  submission-  │
    │   :5001     │    │    :5002       │    │  service :5003│
    │             │    │                │    │               │
    │ • Register  │    │ • Test CRUD    │    │ • Save answers│
    │ • Login     │    │ • DOCX import  │    │ • Auto-grade  │
    │ • Google    │    │ • Auto-grade   │    │ • Writing sub │
    │   OAuth     │    │   R/L          │    │ • Speaking sub│
    │ • JWT sign  │    │ • Attempt CRUD │    │ • Grading RMQ │
    └─────────────┘    └───────┬────────┘    └───────┬───────┘
                               │ RPC                 │ Event
                               │ (RabbitMQ)          │ (RabbitMQ)
                               └─────────────────────┼──────────────┐
                                                      ▼              │
                                             ┌────────────────┐      │
                                             │analytics-service│     │
                                             │    :5004        │◄────┘
                                             │                 │
                                             │ • Band profiles │
                                             │ • Progress track│
                                             │ • Mistake log   │
                                             │ • Admin stats   │
                                             └────────────────┘
                                                      │
                                            ┌─────────▼──────────┐
                                            │  PostgreSQL         │
                                            │  (Supabase          │
                                            │   PgBouncer :6543)  │
                                            │  19 tables          │
                                            └────────────────────┘
```

---

## Monorepo Structure

```
api-gateway/
├── apps/
│   ├── api-gateway/         # HTTP reverse proxy (port 5000)
│   ├── auth-service/        # Auth, JWT, Google OAuth (port 5001)
│   ├── test-service/        # Test content lifecycle (port 5002)
│   ├── submission-service/  # Submissions and grading (port 5003)
│   └── analytics-service/  # Analytics and dashboards (port 5004)
├── libs/
│   └── common/              # Shared: TransformInterceptor, AllExceptionsFilter, RMQ_PATTERNS
├── db/
│   └── database_schema.sql  # Canonical DDL — apply manually, never use synchronize
└── docs/                    # Detailed documentation
```

---

## Database Schema

19 PostgreSQL tables across four service ownership boundaries:

| Service | Tables |
|---|---|
| auth-service | `accounts`, `learner_profiles`, `admin_profiles`, `admin_roles`, `admin_role_assignments` |
| test-service | `tests`, `sections`, `question_groups`, `questions`, `question_answers`, `writing_tasks`, `speaking_parts`, `test_attempts` (create only) |
| submission-service | `test_attempts` (finalize), `question_attempts`, `writing_submissions`, `writing_scores`, `ai_writing_gradings`, `speaking_submissions`, `speaking_scores` |
| analytics-service | `learner_band_profiles`, `learner_mistakes`, `learner_progress_snapshots` |

Core relationships:
```
tests → sections → question_groups → questions → question_answers
tests → writing_tasks    ↘
tests → speaking_parts    test_attempts → question_attempts
```

---

## Technical Highlights

### IELTS Answer Template Syntax

The test-service grader expands complex IELTS answer templates before comparing:

```
"MIDNIGHT [OR] 12(.00) A.M./AM"
→ Expands to: ["MIDNIGHT", "12 A.M.", "12 AM", "12.00 A.M.", "12.00 AM"]

"(FREDERICK) FLEET"
→ Expands to: ["FLEET", "FREDERICK FLEET"]

"ng" / "n/g" / "not-given"
→ Normalized to: "NOT GIVEN"
```

### Official IELTS Band Conversion

Uses the official British Council score tables:
- Reading: 40 questions → band 2.0–9.0
- Listening: 40 questions → band 1.0–9.0 (different scale from Reading)

### Uniform Response Envelope

Every response from every service is wrapped by `TransformInterceptor`:

```json
{ "statusCode": 200, "message": "Success", "data": <payload> }
```

The frontend unwraps with: `.then(r => r.data.data)`

### Analytics Full Sync

Every time a learner submits a test, submission-service publishes an `analytics.test.submitted` event to RabbitMQ. The analytics-service handles it by fully rebuilding:
- Per-skill band profiles (average across all attempts per skill)
- Progress snapshots (one data point per completed attempt)
- Mistake log (one record per wrong answer, tagged with question type)

---

## Getting Started

### Prerequisites

- Node.js 20+, pnpm
- PostgreSQL via Supabase (get the connection string from Project Settings)
- RabbitMQ — local quickstart: `docker run -d -p 5672:5672 rabbitmq:3`

### Step 1 — Install

```bash
cd api-gateway
pnpm install
```

### Step 2 — Configure Environment

Each service loads its own `.env` file:

```bash
cp apps/auth-service/.env.example       apps/auth-service/.env
cp apps/test-service/.env.example       apps/test-service/.env
cp apps/submission-service/.env.example apps/submission-service/.env
cp apps/analytics-service/.env.example  apps/analytics-service/.env
```

Minimum `.env` contents (see [docs/environment.md](docs/environment.md) for full reference):

```env
# Database — Supabase PgBouncer (must use port 6543, NOT 5432)
DB_HOST=aws-0-ap-northeast-1.pooler.supabase.com
DB_PORT=6543
DB_USERNAME=postgres.<your-project-ref>
DB_PASSWORD=<your-password>
DB_NAME=postgres

# JWT — must be identical across auth, test, and submission services
JWT_SECRET=<strong-random-secret-min-32-chars>
JWT_EXPIRES_IN=24h

# RabbitMQ — submission-service and analytics-service only
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

### Step 3 — Apply the Database Schema

```bash
# Via psql
psql "postgresql://postgres.<ref>:<password>@db.<ref>.supabase.co:5432/postgres" \
  -f db/database_schema.sql
```

Or paste the contents of `db/database_schema.sql` directly into the Supabase SQL Editor.

> **Critical:** `synchronize: false` is set in all services. Never enable `synchronize: true` — it will attempt to auto-alter the live schema and can cause data loss.

### Step 4 — Run

```bash
# Start all services in watch mode
pnpm run start:dev

# Or start each service individually
nest start auth-service --watch
nest start test-service --watch
nest start submission-service --watch
nest start analytics-service --watch

# Production
pnpm run build
pnpm run start:prod
```

### Docker (full stack)

```bash
# Spin up all services + PostgreSQL + RabbitMQ
docker compose up

docker compose down
```

---

## API Endpoints at a Glance

| Group | Base Path | Service | Endpoints |
|---|---|---|---|
| Auth | `/api/auth/*` | auth-service:5001 | 6 |
| Tests | `/api/tests/*` | test-service:5002 | 12 |
| Sections / Groups / Questions | `/api/sections/*`, `/api/groups/*`, `/api/questions/*` | test-service:5002 | 12 |
| Writing & Speaking tasks | `/api/writing-tasks/*`, `/api/speaking-parts/*` | test-service:5002 | 6 |
| Attempts | `/api/attempts/*` | test + submission service | 8 |
| Submissions | `/api/writing-submissions/*`, `/api/speaking-submissions/*` | submission-service:5003 | 10 |
| Gradings | `/api/writing-gradings/*` | submission-service:5003 | 3 |
| Stats | `/api/stats/*` | submission-service:5003 | 2 |
| Analytics | `/api/analytics/*` | analytics-service:5004 | 11 |

→ Full reference at [docs/api-reference.md](docs/api-reference.md)

---

## Swagger UI

Every service exposes a Swagger UI at `/api/docs`:

| Service | URL |
|---|---|
| API Gateway | http://localhost:5000/api/docs |
| Auth Service | http://localhost:5001/api/docs |
| Test Service | http://localhost:5002/api/docs |
| Submission Service | http://localhost:5003/api/docs |
| Analytics Service | http://localhost:5004/api/docs |

---

## RabbitMQ Message Patterns

| Pattern | Type | Publisher → Consumer | Purpose |
|---|---|---|---|
| `test.get_answers` | RPC | submission → test | Fetch correct answers for auto-grading |
| `test.get_skill` | RPC | submission → test | Determine if a test is auto-gradable |
| `analytics.test.submitted` | Event | submission → analytics | Trigger full learner analytics sync |
| `grading.grade_writing` | Event | submission → (worker) | Dispatch AI writing grading (in progress) |
| `grading.grade_speaking` | Event | submission → (worker) | Dispatch AI speaking grading (in progress) |

---

## Documentation

Detailed documentation is in the [`docs/`](docs/) folder:

| File | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Request flow, proxy pattern, service boundaries, module structure |
| [docs/api-reference.md](docs/api-reference.md) | All 80+ endpoints — method, path, auth guard, request/response |
| [docs/auth-service.md](docs/auth-service.md) | Auth endpoints, JWT strategy, Google OAuth, entities, DTOs |
| [docs/test-service.md](docs/test-service.md) | Test CRUD, DOCX import, answer grading logic, band conversion |
| [docs/submission-service.md](docs/submission-service.md) | Submission flow, band conversion tables, grading DTOs |
| [docs/analytics-service.md](docs/analytics-service.md) | Dashboard algorithm, admin stats, full sync logic |
| [docs/database.md](docs/database.md) | All 19 tables with column types, constraints, FK, and ownership |
| [docs/message-queue.md](docs/message-queue.md) | RabbitMQ patterns, payload schemas, event flow diagram |
| [docs/response-format.md](docs/response-format.md) | Response envelope format, error format, examples |
| [docs/environment.md](docs/environment.md) | Per-service env vars, TypeORM connection config, PgBouncer notes |

---

## Known Issues

- **Admin RBAC not enforced at the gateway** — Role checks exist in individual services but the API Gateway proxy does not validate roles before forwarding. The frontend enforces this via middleware.
- **Grading workers incomplete** — `grading.grade_writing` and `grading.grade_speaking` events are published but the consumer workers are not yet fully implemented. Writing grading is currently triggered synchronously from the Next.js `/api/ai/grade-writing` route.
- **Hardcoded CORS origin** — `http://localhost:3000` is hardcoded in each service's `main.ts`. All four files must be updated when deploying to a different frontend origin.
- **Hardcoded service URLs** — Proxy URLs (`http://localhost:5001`, `5002`, ...) are hardcoded in the api-gateway. Env-based configuration is needed for non-local deployments.

---

## Author

**Nghi Minh Nguyen**  
Undergraduate — Graduation Thesis Project, 2025

---

## Related

- [Frontend — my-app](../my-app/README.md)
- [Database Schema](db/database_schema.sql)
- [Frontend Documentation](../my-app/docs/)
