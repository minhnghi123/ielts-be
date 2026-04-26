# Backend — Response Format

Every NestJS response is normalized through two global interceptors/filters applied in each service's `main.ts`.

---

## Success Response — TransformInterceptor

**File:** `libs/common/src/interceptors/transform.interceptor.ts`

Applied globally via `app.useGlobalInterceptors(new TransformInterceptor())`.

All successful responses (2xx) are wrapped in this envelope:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": <actual payload>
}
```

### Examples

**GET /analytics/summary/:learnerId → 200**
```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "bandProfiles": [...],
    "latestOverallBand": 6.5,
    "progressHistory": [...],
    "totalMistakes": 12
  }
}
```

**POST /tests → 201**
```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "skill": "reading",
    "title": "Practice Test 1",
    "isMock": false,
    "createdAt": "2025-01-15T10:00:00.000Z"
  }
}
```

### Frontend Unwrapping Pattern

All `lib/api/*.ts` modules unwrap the envelope in the `.then()` chain:

```typescript
// lib/api/tests.ts
export const testApi = {
  getTestById: (id: string) =>
    apiClient.get<ApiResponse<Test>>(`/api/tests/${id}`)
      .then(r => r.data.data),  // unwrap: r.data = ApiResponse, .data = Test
};
```

---

## Error Response — AllExceptionsFilter

**File:** `libs/common/src/filters/http-exception.filter.ts`

Applied globally via `app.useGlobalFilters(new AllExceptionsFilter())`.

Catches all unhandled exceptions and returns a structured error body:

```json
{
  "statusCode": 400,
  "timestamp": "2025-01-15T10:00:00.000Z",
  "path": "/api/auth/register",
  "error": "Human-readable error message",
  "rawException": { ... }
}
```

### Common Error Responses

| Status | Scenario | `error` example |
|---|---|---|
| 400 | Validation failure (class-validator) | `"email must be an email"` |
| 401 | Missing or invalid JWT | `"Unauthorized"` |
| 403 | Insufficient role | `"Forbidden resource"` |
| 404 | Entity not found | `"Test not found"` |
| 409 | Unique constraint violation | `"Email already exists"` |
| 500 | Unhandled server error | `"Internal server error"` |

### Validation Errors (400)

When `ValidationPipe` rejects a request, the error object contains details from `class-validator`:

```json
{
  "statusCode": 400,
  "timestamp": "2025-01-15T10:00:00.000Z",
  "path": "/auth/register",
  "error": [
    "email must be an email",
    "password must be longer than or equal to 8 characters"
  ],
  "rawException": {
    "message": [...],
    "error": "Bad Request",
    "statusCode": 400
  }
}
```

---

## Global Setup (each service's main.ts)

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Standard response envelope
  app.useGlobalInterceptors(new TransformInterceptor());

  // Structured error responses
  app.useGlobalFilters(new AllExceptionsFilter());

  // Input validation with auto-transform and whitelist stripping
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,    // Strip unknown properties
    transform: true,    // Auto-cast types (string → number, etc.)
  }));

  // CORS for frontend
  app.enableCors({ origin: 'http://localhost:3000' });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Service Name')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(PORT);
}
```

---

## Notes

- The `rawException` field in error responses may expose internal stack traces in `development`. In production, consider stripping it.
- `AllExceptionsFilter` also logs all errors to `console.error` — integrate a proper logger (Winston, Pino) before production.
- The `TransformInterceptor` wraps every 2xx response, including streaming responses — do not use it with SSE or chunked transfer.
