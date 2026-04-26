# Backend — Architecture

---

## Full Request Flow

```
Browser (port 3000)
    │
    │  HTTP request with Authorization: Bearer <jwt>
    ▼
Next.js App (my-app)
    │
    │  Axios → NEXT_PUBLIC_API_URL (default: http://localhost:5000)
    ▼
API Gateway (port 5000)   ← apps/api-gateway/
    │  • CORS: http://localhost:3000
    │  • Validation pipe (global)
    │  • No auth logic — pure HTTP proxy
    │
    ├── /api/auth/*         → auth-service (port 5001)
    ├── /api/tests/*        → test-service  (port 5002)
    ├── /api/sections/*     → test-service  (port 5002)
    ├── /api/groups/*       → test-service  (port 5002)
    ├── /api/questions/*    → test-service  (port 5002)
    ├── /api/writing-tasks/* → test-service (port 5002)
    ├── /api/speaking-parts/* → test-service (port 5002)
    ├── /api/attempts/*     → test-service + submission-service (port 5002/5003)
    ├── /api/writing-submissions/* → submission-service (port 5003)
    ├── /api/speaking-submissions/* → submission-service (port 5003)
    ├── /api/writing-gradings/* → submission-service (port 5003)
    ├── /api/stats/*        → submission-service (port 5003)
    ├── /api/learners/*     → submission-service (port 5003)
    └── /api/analytics/*    → analytics-service (port 5004)
```

**Note:** `/api/attempts/*` routes are ambiguous — test-service handles attempt creation (POST `/tests/:id/attempts`) and analytics-service handles analytics; submission-service handles answer saving, submission finalization, and retrieval. The gateway proxy is route-prefix based, not method-based.

---

## Service Boundaries

```
┌─────────────────────────────────────────────────────┐
│                    auth-service                      │
│  Tables: accounts, learner_profiles, admin_profiles  │
│  Concerns: registration, login, JWT, Google OAuth    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   test-service                       │
│  Tables: tests, sections, question_groups,           │
│          questions, question_answers, writing_tasks, │
│          speaking_parts, test_attempts (create)      │
│  Concerns: test CRUD, DOCX import, attempt start,   │
│            auto-grading (reading/listening),         │
│            RPC provider for answers/skill            │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                 submission-service                   │
│  Tables: test_attempts (finalize), question_attempts,│
│          writing_submissions, writing_scores,         │
│          ai_writing_gradings, speaking_submissions,  │
│          speaking_scores                             │
│  Concerns: answer saving, attempt finalization,      │
│            writing/speaking submissions,             │
│            grading dispatch via RabbitMQ             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                 analytics-service                    │
│  Tables: learner_band_profiles, learner_mistakes,    │
│          learner_progress_snapshots                  │
│  Concerns: band tracking, mistake logging,           │
│            dashboard aggregation, admin stats        │
└─────────────────────────────────────────────────────┘
```

---

## API Gateway Proxy Pattern

The gateway is a thin HTTP forwarder with no business logic.

**File:** `apps/api-gateway/src/proxy/proxy.service.ts`

```typescript
// ProxyService forwards requests preserving method, headers, and body
async forwardRequest(targetUrl: string, req: Request) {
  const response = await axios({
    method: req.method,
    url: targetUrl,
    headers: {
      ...req.headers,
      host: new URL(targetUrl).host,
    },
    data: req.body,
    validateStatus: () => true,  // Pass all status codes through
  });
  return response;
}
```

**Proxy controllers** use `@All()` decorators to catch all HTTP methods on a given path prefix and forward them to the appropriate service.

---

## Inter-Service Communication

### Synchronous (HTTP)

After a test is submitted, test-service POSTs directly to analytics-service to sync analytics:

```
test-service → POST http://localhost:5004/analytics/sync/:learnerId
```

### Asynchronous (RabbitMQ)

```
submission-service ──PUBLISH──► analytics.test.submitted ──► analytics-service
submission-service ──PUBLISH──► grading.grade_writing    ──► (worker, partially implemented)
submission-service ──PUBLISH──► grading.grade_speaking   ──► (worker, partially implemented)

test-service ◄──RPC────────── test.get_answers ◄──────── submission-service
test-service ◄──RPC────────── test.get_skill   ◄──────── submission-service
```

See [message-queue.md](message-queue.md) for full details.

---

## NestJS Bootstrap Pattern (all services)

Each service's `main.ts` follows the same setup:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // HTTP server + global middleware
  app.enableCors({ origin: 'http://localhost:3000' });
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger
  SwaggerModule.setup('api/docs', app, createDocument(app));

  // For services with RabbitMQ: add microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL],
      queue: 'ielts_messages',
      queueOptions: { durable: true },
    },
  });
  await app.startAllMicroservices();

  await app.listen(PORT);
}
```

---

## Module Structure (per service)

Each service follows the standard NestJS module layout:

```
apps/<service>/src/
├── <domain>/
│   ├── <domain>.module.ts       # Imports TypeORM entities, declares providers
│   ├── <domain>.controller.ts   # HTTP endpoints + RMQ handlers
│   ├── <domain>.service.ts      # Business logic
│   └── dto/                     # Request/response DTOs
├── entities/                    # TypeORM entity classes
└── main.ts                      # Bootstrap + global middleware
```

### AppModule pattern

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: './apps/<service>/.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        // ... see environment.md for full config
      }),
    }),
    DomainModule,
  ],
})
export class AppModule {}
```

`ConfigModule.forRoot()` uses `isGlobal: true` — no need to re-import in feature modules.
