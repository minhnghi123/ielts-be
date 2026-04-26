# Backend — Environment Variables

Each NestJS service loads its **own** `.env` file from `apps/<service-name>/.env`. There is also a root `.env` used by Docker Compose.

---

## Per-Service Variable Reference

### auth-service (`apps/auth-service/.env`)

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` | Yes | PostgreSQL hostname. Use Supabase PgBouncer: `aws-0-<region>.pooler.supabase.com` |
| `DB_PORT` | Yes | PgBouncer transaction mode port: `6543` |
| `DB_USERNAME` | Yes | Supabase pooler user: `postgres.<project-ref>` |
| `DB_PASSWORD` | Yes | Database password |
| `DB_NAME` | Yes | Database name: `postgres` |
| `JWT_SECRET` | Yes | Strong random secret for JWT signing. Must match across services. |
| `JWT_EXPIRES_IN` | Yes | Token TTL: `24h` recommended |
| `NODE_ENV` | No | `development` \| `production` |
| `PORT` | No | Service port override (default `5001`) |

### test-service (`apps/test-service/.env`)

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` | Yes | Same Supabase PgBouncer host |
| `DB_PORT` | Yes | `6543` |
| `DB_USERNAME` | Yes | Same pooler username |
| `DB_PASSWORD` | Yes | Same database password |
| `DB_NAME` | Yes | `postgres` |
| `JWT_SECRET` | Yes | Same secret as auth-service (for JWT guard validation) |
| `JWT_EXPIRES_IN` | Yes | `24h` |
| `NODE_ENV` | No | Environment |
| `ADMIN_PROFILE_ID` | No | UUID of the default admin profile (used when `createdBy` is empty in seeds) |

### submission-service (`apps/submission-service/.env`)

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` | Yes | Supabase PgBouncer host |
| `DB_PORT` | Yes | `6543` |
| `DB_USERNAME` | Yes | Pooler username |
| `DB_PASSWORD` | Yes | Database password |
| `DB_NAME` | Yes | `postgres` |
| `JWT_SECRET` | Yes | Same secret |
| `JWT_EXPIRES_IN` | Yes | `24h` |
| `NODE_ENV` | No | Environment |
| `RABBITMQ_URL` | Yes | RabbitMQ AMQP URL: `amqp://guest:guest@localhost:5672` |

### analytics-service (`apps/analytics-service/.env`)

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` | Yes | Supabase PgBouncer host |
| `DB_PORT` | Yes | `6543` |
| `DB_USERNAME` | Yes | Pooler username |
| `DB_PASSWORD` | Yes | Database password |
| `DB_NAME` | Yes | `postgres` |
| `NODE_ENV` | No | Environment |
| `RABBITMQ_URL` | Yes | RabbitMQ AMQP URL |

### api-gateway (`apps/api-gateway/.env`)

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | No | Environment |
| `PORT` | No | Gateway port (default `5000`) |

---

## .env.example Template (all services)

```env
# Database — Supabase PgBouncer (Transaction Mode)
DB_HOST=aws-0-ap-northeast-1.pooler.supabase.com
DB_PORT=6543
DB_USERNAME=postgres.<your-project-ref>
DB_PASSWORD=<your-db-password>
DB_NAME=postgres

# JWT (must be identical across auth, test, submission services)
JWT_SECRET=<strong-random-secret-min-32-chars>
JWT_EXPIRES_IN=24h

# RabbitMQ (submission-service and analytics-service only)
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Misc
NODE_ENV=development
ADMIN_PROFILE_ID=<uuid-of-default-admin>
```

---

## Database Connection Config (TypeORM)

All services use this TypeORM configuration pattern (`TypeOrmModule.forRootAsync()`):

```typescript
{
  type: 'postgres',
  host: configService.get('DB_HOST'),
  port: +configService.get('DB_PORT'),
  username: configService.get('DB_USERNAME'),
  password: configService.get('DB_PASSWORD'),
  database: configService.get('DB_NAME'),
  ssl: { rejectUnauthorized: false },   // Supabase requires SSL
  synchronize: false,                    // NEVER enable — use database_schema.sql
  extra: {
    max: 5,                              // Max connections per service (PgBouncer limit)
    connectionTimeoutMillis: 10000,      // 10s connect timeout
    idleTimeoutMillis: 30000,            // 30s idle timeout
  },
  retryAttempts: 5,
  retryDelay: 3000,                      // 3s between retries on startup
}
```

**Critical notes:**
- Port must be `6543` (PgBouncer transaction mode), not `5432` (direct Postgres).
- `synchronize: false` is mandatory — all DDL goes through `db/database_schema.sql`.
- `rejectUnauthorized: false` is required for Supabase's self-signed SSL cert.
- Max 5 connections per service — Supabase free tier limits total connections.

---

## Docker Compose Environment

When running via `docker compose up`, environment variables are sourced from the root `.env` file. The Compose file maps them to each service container. The root `.env` is not used when running services directly via `pnpm run start:dev`.
