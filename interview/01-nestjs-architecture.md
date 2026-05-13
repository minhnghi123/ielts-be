# Interview: NestJS Architecture & Microservices

---

## Q1. Tại sao dự án dùng kiến trúc microservices? Ưu và nhược điểm so với monolith?

**Trả lời:**

Dự án có 4 microservices + 1 API gateway:

```
api-gateway  (5000) — HTTP proxy, không có business logic
auth-service (5001) — Authentication, user management
test-service (5002) — Test content, DOCX import, grading
submission-service (5003) — Answers, submissions, finalization
analytics-service  (5004) — Band profiles, mistakes, statistics
```

**Ưu điểm microservices:**

1. **Độc lập deploy:** Có thể deploy riêng từng service mà không restart toàn bộ. Nếu test-service có bug → chỉ restart test-service, auth-service vẫn chạy.

2. **Scalability độc lập:** Nếu analytics-service tốn nhiều CPU (aggregate queries) → chỉ scale service đó, không scale cả hệ thống.

3. **Technology independence:** Mỗi service có thể dùng language/framework khác nhau (trong tương lai có thể thêm Python service cho ML).

4. **Team ownership:** Mỗi team/developer chịu trách nhiệm một service rõ ràng.

**Nhược điểm (và trade-offs thực tế của dự án):**

1. **Cross-service ownership phức tạp:** `test_attempts` được create bởi test-service nhưng finalize bởi submission-service. Bất kỳ change nào cần coordinate 2 services → dễ bug, khó maintain.

2. **Network latency:** Mỗi inter-service call là HTTP request (~1-5ms). Một user request có thể trigger nhiều inter-service calls.

3. **Debugging khó hơn:** Một request có thể đi qua 3-4 services. Tracing lỗi cần log tập trung.

4. **Hardcoded URLs:** `http://localhost:5001` trong api-gateway source code → không thể deploy lên cloud mà không sửa code (Known Issue).

**Thực tế của dự án:**

Đây là **monorepo** (tất cả trong 1 git repo), tất cả share cùng 1 PostgreSQL database (Supabase). Về bản chất gần với **modular monolith** hơn là true microservices. True microservices thường có database riêng cho mỗi service.

---

## Q2. NestJS Module system hoạt động như thế nào? Giải thích `@Module`, `providers`, `imports`, `exports`.

**Trả lời:**

NestJS dùng **Dependency Injection (DI) container** tương tự Angular. Module là đơn vị đóng gói DI:

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Test, Section, QuestionGroup, Question, QuestionAnswer]),
    ClientsModule.registerAsync([{
      name: 'IELTS_SERVICE',
      useFactory: (config: ConfigService) => ({
        transport: Transport.RMQ,
        options: { urls: [config.get('RABBITMQ_URL')], queue: 'ielts_messages' },
      }),
      inject: [ConfigService],
    }]),
  ],
  controllers: [TestController],  // HTTP endpoints
  providers: [TestService],       // Business logic, injectable
  exports: [TestService],         // Export để module khác inject
})
export class TestModule {}
```

**`providers`:** Classes được đăng ký với DI container. NestJS tự tạo instance và inject khi cần.

**`imports`:** Import modules khác → lấy exported providers của chúng. `TypeOrmModule.forFeature([Test])` → inject `Repository<Test>` vào providers.

**`exports`:** Cho phép module khác import và dùng providers. Nếu không export → private.

**`controllers`:** Không injectable, chỉ handle HTTP/RMQ requests và delegate sang Services.

**AppModule pattern (mỗi service):**

```typescript
@Module({
  imports: [
    // 1. Config — phải đầu tiên để các module khác dùng được
    ConfigModule.forRoot({
      isGlobal: true,                          // Không cần import ở feature modules
      envFilePath: './apps/test-service/.env', // Load env file riêng
    }),
    // 2. Database — dùng async để đợi ConfigModule ready
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        // ...
      }),
    }),
    // 3. Feature modules
    TestModule,
  ],
})
export class AppModule {}
```

**Tại sao `forRootAsync` thay vì `forRoot`?**

`forRoot({ host: process.env.DB_HOST })` đọc env NGAY KHI module load — trước khi `ConfigModule` có cơ hội load `.env` file. `forRootAsync` với `inject: [ConfigService]` đợi ConfigModule setup xong → đọc env thông qua `ConfigService`.

---

## Q3. Giải thích `TransformInterceptor` và `AllExceptionsFilter`. Chúng được apply ở đâu?

**Trả lời:**

**`TransformInterceptor`** — wrap tất cả 2xx responses:

```typescript
// libs/common/src/interceptors/transform.interceptor.ts
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map(data => ({
        statusCode: context.switchToHttp().getResponse().statusCode,
        message: 'Success',
        data,  // ← payload gốc được wrap vào đây
      }))
    );
  }
}
```

**`AllExceptionsFilter`** — catch tất cả errors:

```typescript
// libs/common/src/filters/http-exception.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const error = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal server error';

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error,
    });
  }
}
```

**Apply trong `main.ts` của mỗi service:**

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalInterceptors(new TransformInterceptor());  // Wrap responses
  app.useGlobalFilters(new AllExceptionsFilter());        // Catch errors
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,   // Strip unknown fields (bảo mật)
    transform: true,   // Auto-cast: "3" → 3 (string to number)
  }));
  
  await app.listen(PORT);
}
```

**`whitelist: true` làm gì?**

```typescript
// DTO:
class CreateTestDto {
  @IsString() title: string;
  @IsBoolean() isMock: boolean;
}

// Request body:
{ "title": "Test 1", "isMock": false, "hack": "malicious" }

// Với whitelist: true → "hack" bị strip trước khi vào controller
// Không có whitelist → "hack" passed through → security risk
```

---

## Q4. TypeORM Entity conventions trong dự án. Giải thích các decorators chính.

**Trả lời:**

```typescript
// apps/test-service/src/entities/test.entity.ts
@Entity('tests')  // ← Map đến table 'tests' (không phải class name 'Test')
export class Test {
  @PrimaryGeneratedColumn('uuid')  // ← UUID tự sinh (không phải auto-increment int)
  id: string;

  @Column({ length: 50, nullable: true })
  skill: string;

  @Column({ name: 'is_mock' })  // ← DB column = 'is_mock', JS property = 'isMock'
  isMock: boolean;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })  // ← Tự set khi INSERT
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })  // ← Tự update khi UPDATE
  updatedAt: Date;

  // Relations:
  @OneToMany(() => Section, section => section.test, { cascade: true })
  sections: Section[];
  // cascade: true → khi delete Test → tự delete Sections liên quan

  @OneToMany(() => WritingTask, task => task.test, { cascade: true })
  writingTasks: WritingTask[];
}
```

**Tại sao UUID thay vì integer ID:**

1. **Distributed safe:** Không cần coordination giữa services để generate ID. Mỗi service có thể insert rows với UUID mà không conflict.
2. **Security:** UUID không sequential → attacker không đoán được ID tiếp theo. `/api/tests/1`, `/api/tests/2`... dễ enumerate. UUID không.
3. **Merge safety:** Nếu export/import data giữa environments, UUID không conflict.

**camelCase vs snake_case mapping:**

```
DB column: created_at   → TypeORM @Column({ name: 'created_at' }) → JS: createdAt
DB column: is_mock      → TypeORM @Column({ name: 'is_mock' })    → JS: isMock
```

TypeORM không tự động convert camelCase↔snake_case (không như ActiveRecord của Rails). Phải explicit declare `name`.

---

## Q5. `ValidationPipe` với `transform: true` làm gì? Cho ví dụ.

**Trả lời:**

`transform: true` tự động **type coerce** (convert) giá trị input sang type được declare trong DTO:

```typescript
// DTO:
class QueryTestsDto {
  @IsOptional()
  @IsString()
  skill?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true') // Query params đến dưới dạng string
  isMock?: boolean;

  @IsOptional()
  @Type(() => Number)  // ← Cần decorator này để transform work
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
```

**Không có transform:**

```
GET /tests?page=1&limit=20
→ page: "1" (string), limit: "20" (string)
→ Validation fail vì @IsInt() expect number
```

**Với transform + `@Type(() => Number)`:**

```
GET /tests?page=1&limit=20
→ page: 1 (number), limit: 20 (number)
→ Validation pass
```

**`@Transform` decorator:**

```typescript
// Cho boolean query params:
@Transform(({ value }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value; // Giữ nguyên nếu không match
})
@IsBoolean()
isMock?: boolean;

// Vì URL query: ?isMock=true → string "true"
// Cần transform string → boolean
```

---

## Q6. Swagger được setup như thế nào? Tại sao mỗi service có Swagger riêng?

**Trả lời:**

**Setup trong mỗi service's `main.ts`:**

```typescript
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Build Swagger document
  const config = new DocumentBuilder()
    .setTitle('Test Service API')
    .setDescription('IELTS Platform - Test Content Management')
    .setVersion('1.0')
    .addBearerAuth()  // ← Thêm "Authorize" button trong UI
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(5002);
}
```

**Tại sao mỗi service có Swagger riêng:**

- **Auth-service:** `http://localhost:5001/api/docs` — endpoints login, register, profile
- **Test-service:** `http://localhost:5002/api/docs` — endpoints tests, sections, questions
- **Submission-service:** `http://localhost:5003/api/docs` — endpoints submissions, grading
- **Analytics-service:** `http://localhost:5004/api/docs` — endpoints analytics, stats
- **API Gateway:** `http://localhost:5000/api/docs` — aggregated (tất cả)

Trong microservices, mỗi service expose API riêng. Developer của service đó cần biết CHÍNH XÁC endpoints của service mình. Aggregated Swagger ở gateway chứa tất cả nhưng có thể confusing.

**Decorator trên Controller và DTO:**

```typescript
// Controller:
@ApiTags('tests')          // Grouping trong Swagger UI
@ApiOperation({ summary: 'Get all tests' })
@ApiQuery({ name: 'skill', required: false, enum: ['reading', 'listening', 'writing', 'speaking'] })
@ApiResponse({ status: 200, type: PaginatedTestsDto })
@Get()
getTests(@Query() query: QueryTestsDto) { ... }

// DTO:
class CreateTestDto {
  @ApiProperty({ example: 'reading', enum: ['reading', 'listening', 'writing', 'speaking'] })
  @IsString()
  skill: string;
}
```

---

## Q7. NestJS lifecycle hooks. Khi nào dùng `OnModuleInit`?

**Trả lời:**

NestJS có lifecycle hooks cho phép chạy code tại specific moments:

```
bootstrap()
  → Module initialization (imports processed)
  → Providers instantiated
  → OnModuleInit.onModuleInit() ← Hook này
  → OnApplicationBootstrap.onApplicationBootstrap()
  → app.listen() called
```

**Ví dụ trong dự án (analytics-service):**

```typescript
@Injectable()
export class AnalyticsService implements OnModuleInit {
  constructor(
    @InjectRepository(LearnerBandProfile)
    private bandProfileRepo: Repository<LearnerBandProfile>,
    @Inject('IELTS_SERVICE')
    private rmqClient: ClientProxy,
  ) {}

  async onModuleInit() {
    // Đợi RabbitMQ connection ready trước khi nhận messages
    await this.rmqClient.connect();
  }
}
```

**Một use case khác — Database seeding:**

```typescript
async onModuleInit() {
  // Kiểm tra có admin account chưa, nếu chưa thì tạo
  const adminCount = await this.accountRepo.count({ where: { role: 'admin' } });
  if (adminCount === 0) {
    await this.createDefaultAdmin();
  }
}
```

**`OnModuleDestroy` và `OnApplicationShutdown`:**

```typescript
async onApplicationShutdown(signal?: string) {
  // Graceful shutdown: đóng connections, flush pending operations
  await this.rmqClient.close();
  console.log(`Shutting down on signal: ${signal}`);
}
```

Quan trọng trong production để không mất data khi restart service.
