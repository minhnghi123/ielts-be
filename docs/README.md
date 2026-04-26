# Backend — api-gateway

NestJS monorepo containing the API Gateway and four microservices for the IELTS Practice Platform.

---

## Service Map

| Service | Port | Responsibility |
|---|---|---|
| `api-gateway` | 5000 | HTTP reverse proxy; CORS, validation, Swagger aggregation |
| `auth-service` | 5001 | Account + profile CRUD, JWT signing, Google OAuth |
| `test-service` | 5002 | Test content lifecycle (CRUD, DOCX import, attempt creation) |
| `submission-service` | 5003 | Answer persistence, attempt finalization, AI grading dispatch |
| `analytics-service` | 5004 | Band profile tracking, mistake aggregation, learner statistics |

All services share a single PostgreSQL database on Supabase (PgBouncer port 6543). Inter-service communication: HTTP proxy (sync) + RabbitMQ (async, partially implemented).

---

## Quick Start

```bash
# Prerequisites: Node 20+, pnpm, PostgreSQL (Supabase), RabbitMQ

# 1. Copy env (one file per service)
cp apps/auth-service/.env.example       apps/auth-service/.env
cp apps/test-service/.env.example       apps/test-service/.env
cp apps/submission-service/.env.example apps/submission-service/.env
cp apps/analytics-service/.env.example  apps/analytics-service/.env
cp apps/api-gateway/.env.example        apps/api-gateway/.env

# 2. Install dependencies
pnpm install

# 3. Start all services in watch mode
pnpm run start:dev

# 4. Start a single service
nest start auth-service --watch
nest start test-service --watch
nest start submission-service --watch
nest start analytics-service --watch

# 5. Production build + start
pnpm run build
pnpm run start:prod

# 6. Full stack with Docker (all services + PostgreSQL + RabbitMQ)
docker compose up
docker compose down
```

---

## Directory Structure

```
api-gateway/
├── apps/
│   ├── api-gateway/         # HTTP proxy (port 5000)
│   │   └── src/
│   │       ├── proxy/       # ProxyModule, ProxyService, proxy controllers
│   │       └── main.ts
│   ├── auth-service/        # Auth microservice (port 5001)
│   │   └── src/
│   │       ├── auth/        # AuthModule, AuthController, AuthService
│   │       ├── entities/    # Account, LearnerProfile, AdminProfile
│   │       └── main.ts
│   ├── test-service/        # Test microservice (port 5002)
│   │   └── src/
│   │       ├── test/        # TestModule, TestController, TestService
│   │       ├── entities/    # Test, Section, QuestionGroup, Question, etc.
│   │       ├── dto/         # CreateTestDto, SubmitAttemptDto, etc.
│   │       └── main.ts
│   ├── submission-service/  # Submission microservice (port 5003)
│   │   └── src/
│   │       ├── submission/  # SubmissionModule, SubmissionController, SubmissionService
│   │       ├── entities/    # WritingSubmission, SpeakingSubmission, Scores, etc.
│   │       ├── dto/
│   │       └── main.ts
│   └── analytics-service/  # Analytics microservice (port 5004)
│       └── src/
│           ├── analytics/  # AnalyticsModule, AnalyticsController, AnalyticsService
│           ├── entities/   # LearnerBandProfile, LearnerMistake, ProgressSnapshot
│           ├── dto/
│           └── main.ts
├── libs/
│   └── common/              # Shared @app/common library
│       └── src/
│           ├── filters/     # AllExceptionsFilter
│           ├── interceptors/# TransformInterceptor
│           ├── events/      # rmq-patterns.ts
│           └── constants/   # services.constants.ts
├── db/
│   └── database_schema.sql  # Canonical DDL — apply manually, never auto-sync
├── docs/                    # ← You are here
└── nest-cli.json
```

---

## Documentation Index

| File | Covers |
|---|---|
| [architecture.md](architecture.md) | Request flow, proxy pattern, service boundaries |
| [api-reference.md](api-reference.md) | All 80+ HTTP endpoints across services |
| [auth-service.md](auth-service.md) | Auth endpoints, JWT, Google OAuth, DTOs |
| [test-service.md](test-service.md) | Test/question endpoints, DOCX import, grading logic |
| [submission-service.md](submission-service.md) | Submission endpoints, band conversion, grading flow |
| [analytics-service.md](analytics-service.md) | Analytics endpoints, dashboard algorithm, admin stats |
| [database.md](database.md) | Full schema (19 tables), relationships, ownership |
| [message-queue.md](message-queue.md) | RabbitMQ patterns, event flow diagram |
| [response-format.md](response-format.md) | Standard response envelope and error format |
| [environment.md](environment.md) | Per-service environment variables |

---

## Known Issues

- **Admin RBAC not enforced at Gateway level** — admin-only NestJS routes are currently unguarded at the proxy layer. Role checks exist in the frontend middleware only. Backend guards exist in individual services but the gateway does not validate roles before proxying.
- **RabbitMQ partially wired** — packages are installed and patterns are defined in `RMQ_PATTERNS`, but grading events (`GRADING.GRADE_WRITING`, `GRADING.GRADE_SPEAKING`) are queued but not yet fully consumed by a grading worker.
- **Hardcoded CORS origin** — `http://localhost:3000` is hardcoded in each `main.ts`. Change all four service files when the frontend origin changes.
- **Hardcoded service URLs in proxy** — `http://localhost:5001`, `5002`, etc. are hardcoded in `api-gateway`. Not suitable for non-local deployments without source changes.
- **`test_attempts` cross-service ownership** — created by `test-service`, finalized by `submission-service`. Any lifecycle change must be coordinated across both.

---

## Swagger UI

Each service exposes Swagger at `/api/docs`:

| Service | URL |
|---|---|
| API Gateway | http://localhost:5000/api/docs |
| Auth | http://localhost:5001/api/docs |
| Test | http://localhost:5002/api/docs |
| Submission | http://localhost:5003/api/docs |
| Analytics | http://localhost:5004/api/docs |
