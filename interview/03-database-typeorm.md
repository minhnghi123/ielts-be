# Interview: Database, TypeORM & Supabase PgBouncer

---

## Q1. Tại sao dùng PgBouncer? Port 6543 khác gì port PostgreSQL thường (5432)?

**Trả lời:**

**PostgreSQL connection model:**

PostgreSQL tạo một process riêng cho **mỗi connection** (~5-10MB RAM mỗi process). Với 5 services mỗi service có max 5 connections → 25 connections → ~125-250MB RAM chỉ cho connections.

Hơn nữa, establishing a PostgreSQL connection tốn ~50-100ms (TCP handshake + auth + setup). Mỗi request tạo connection mới → chậm.

**PgBouncer — Connection Pooler:**

```
Services (25 connections to PgBouncer)
    ↓
PgBouncer (pool of 10 actual DB connections)
    ↓
PostgreSQL
```

PgBouncer duy trì **pool** connections đến PostgreSQL. Services kết nối đến PgBouncer nhanh (~1ms), PgBouncer reuse connections trong pool.

**Transaction mode (port 6543 của Supabase):**

Supabase PgBouncer dùng `transaction mode`:
- Connection được "borrowed" chỉ trong suốt một transaction
- Sau khi transaction kết thúc → connection trả về pool
- Nhiều services share ít connections hơn

**Trade-off của transaction mode:**

Không support PostgreSQL features cần persistent connection:
- `LISTEN/NOTIFY` (real-time)
- Advisory locks (distributed locking)
- Prepared statements (phải disable)
- `SET LOCAL` session variables

→ Phải config TypeORM: `extra: { statement_timeout: '30000', idle_in_transaction_session_timeout: '30000' }` để tránh long-running transactions giữ connection.

**Config trong dự án:**

```typescript
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    url: config.get('DATABASE_URL'),  // PgBouncer URL port 6543
    ssl: { rejectUnauthorized: false }, // Supabase yêu cầu SSL
    extra: {
      max: 5,           // Max 5 connections per service (PgBouncer limit)
      connectionTimeoutMillis: 10000, // 10s timeout nếu pool exhausted
      idleTimeoutMillis: 30000,       // 30s idle timeout
    },
    synchronize: false,  // NEVER true — dùng database_schema.sql
    logging: ['error'],
  }),
}),
```

---

## Q2. Tại sao `synchronize: false`? Điều gì xảy ra nếu set `true`?

**Trả lời:**

`synchronize: true` → TypeORM tự động đọc entities và **ALTER TABLE** để match entity definitions.

**Vấn đề nghiêm trọng:**

```typescript
// Giả sử bạn đổi tên column trong entity:
@Column({ name: 'band_score' })  // Trước: 'score'
bandScore: number;

// Với synchronize: true:
// TypeORM thấy 'band_score' không exists → ADD COLUMN band_score
// Thấy 'score' không trong entity → DROP COLUMN score  ← 💀 DATA LOSS!
```

**Trong production với dữ liệu thực:**

```sql
ALTER TABLE test_attempts DROP COLUMN score;
-- 10,000 bản ghi mất dữ liệu band score → không thể recover
```

**Đúng cách — Manual migration:**

```sql
-- db/database_schema.sql
ALTER TABLE test_attempts RENAME COLUMN score TO band_score;
-- Apply manually → preview trước → test ở dev env trước
```

**Process đúng khi thêm column mới:**

1. Viết ALTER TABLE trong `db/database_schema.sql`
2. Apply vào dev database → test
3. Update TypeORM entity
4. Update DTO và service
5. Apply vào production database → deploy service mới

Never let ORM touch production schema automatically.

---

## Q3. Cross-service table ownership. Giải thích vấn đề với `test_attempts`.

**Trả lời:**

`test_attempts` là bảng được share giữa hai services:

```
test-service:
  - CREATE test_attempts record khi user bắt đầu bài thi
  - Entity: TestAttempt (test-service entity)

submission-service:
  - FINALIZE test_attempts record khi submit (set submitted_at, raw_score, band_score)
  - Entity: TestAttempt (submission-service entity — CÙNG TABLE, KHÁC ENTITY CLASS)
```

**Cả hai services đều có entity class cho cùng một bảng:**

```typescript
// apps/test-service/src/entities/test-attempt.entity.ts
@Entity('test_attempts')
export class TestAttempt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'learner_id' }) learnerId: string;
  @Column({ name: 'test_id' }) testId: string;
  @CreateDateColumn({ name: 'started_at' }) startedAt: Date;
  // submission-service fields (nullable khi chưa submit):
  @Column({ name: 'submitted_at', nullable: true }) submittedAt: Date;
  @Column({ name: 'raw_score', nullable: true }) rawScore: number;
  @Column({ name: 'band_score', type: 'decimal', nullable: true }) bandScore: number;
  @Column({ name: 'ai_feedback', type: 'text', nullable: true }) aiFeedback: string;
}
```

**Vấn đề:**

1. **Code duplication:** Entity giống nhau trong 2 services
2. **Schema drift risk:** Nếu một service thêm column vào entity nhưng quên update service kia → runtime error
3. **Circular ownership:** Ai "owns" bảng này? Ai có responsibility?

**Giải pháp tốt hơn (microservices best practice):**

Mỗi service có database riêng. Communication qua events:

```
test-service (DB: tests DB) → emit "attempt.created" event
submission-service (DB: submissions DB) → consume event → tạo record riêng trong submissions DB
```

Dự án hiện tại share DB để đơn giản hóa (phù hợp graduation project). Trong production microservices thực sự, đây là anti-pattern.

---

## Q4. Giải thích `@OneToMany` với `cascade: true`. Khi nào nên dùng?

**Trả lời:**

```typescript
@Entity('tests')
class Test {
  @OneToMany(() => Section, section => section.test, { cascade: true })
  sections: Section[];
}

@Entity('sections')
class Section {
  @ManyToOne(() => Test, test => test.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'test_id' })
  test: Test;
}
```

**`cascade: true` ở TypeORM level:**

Khi bạn save một Test với embedded sections:
```typescript
const test = this.testRepo.create({
  title: 'Test 1',
  sections: [
    { sectionOrder: 1, passage: 'Lorem ipsum...' }
  ]
});
await this.testRepo.save(test);
// TypeORM tự động INSERT vào 'sections' table → không cần gọi sectionRepo.save()
```

Cascade operations: INSERT, UPDATE khi save entity parent.

**`onDelete: 'CASCADE'` ở database level (FK constraint):**

```sql
-- Trong database_schema.sql:
FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
```

Khi DELETE `tests` record → PostgreSQL tự DELETE `sections` records với test_id đó. Không qua TypeORM.

**Khi nào dùng cascade:**

✅ Child entities không có meaning độc lập (Section không tồn tại nếu Test bị xóa)
✅ Tạo complex objects trong 1 operation (createManualTest với nested sections/questions)
✅ Tránh orphaned records

❌ Không dùng khi child entities có lifecycle riêng:
```typescript
// KHÔNG cascade delete LearnerProfile khi delete Account
// (LearnerProfile có references từ nhiều bảng khác — sẽ gây cascade lỗi)
```

---

## Q5. Giải thích `question_answers` table riêng biệt. Tại sao không embed vào `questions.config`?

**Trả lời:**

```sql
questions (id, question_group_id, question_order, question_type, question_text, config jsonb)
question_answers (id, question_id, correct_answers text[], case_sensitive boolean)
```

**Lý do tách riêng:**

**Security (quan trọng nhất):**

Khi user đang làm bài thi, frontend cần load questions để hiển thị. Nếu correct answers trong `questions.config`:

```json
{
  "type": "multiple_choice",
  "options": ["A", "B", "C", "D"],
  "correct": "B"  ← Answers exposed trong API response!
}
```

User inspect network → thấy đáp án → cheat.

Với bảng riêng:

```typescript
// GET /groups/:groupId/questions — public endpoint
// TypeORM query: LEFT JOIN question_answers... WHERE user.isAdmin
// → Chỉ load answers nếu là admin request
// → Learner không nhìn thấy answers trong response
```

**Performance:**

Khi grading, submission-service chỉ cần `correct_answers` và `case_sensitive` từ `question_answers`, không cần load toàn bộ `config` JSONB (có thể lớn với matching questions có nhiều options).

RabbitMQ RPC pattern:
```
submission-service: "Cho tôi answers của [questionId1, questionId2, ...]"
test-service: Chỉ query question_answers → return [{questionId, correctAnswers, caseSensitive}]
```

**Answer template syntax:**

```
correct_answers: ["MIDNIGHT [OR] 12(.00) A.M./AM"]
case_sensitive: false

→ Expand thành: ["MIDNIGHT", "12 A.M.", "12 AM", "12.00 A.M.", "12.00 AM"]
```

Array format (`text[]`) cho phép multiple valid answers cho cùng một question.

---

## Q6. JSONB trong PostgreSQL. `config` field của questions được dùng như thế nào?

**Trả lời:**

**JSONB vs JSON:**

| | JSON | JSONB |
|---|---|---|
| Storage | Text, preserved whitespace | Binary, compressed |
| Indexing | ❌ | ✅ GIN index |
| Querying operators | Basic | `->`, `->>`, `@>`, `?` operators |
| Write speed | Faster (no parse) | Slower (parse to binary) |
| Read speed | Slower (parse each time) | Faster (already binary) |

**Tại sao JSONB cho `config`:**

`config` lưu type-specific configuration. Không thể dùng cột riêng vì schema khác nhau:

```typescript
// multiple_choice: { options: string[] }
// fill_in_blank: { blanks: number }
// matching: { pairs: { left: string, right: string }[] }
```

Nếu dùng cột riêng → rất nhiều NULL columns, schema cứng nhắc.

**TypeORM mapping:**

```typescript
@Column({ type: 'jsonb', default: '{}' })
config: Record<string, any>;
```

TypeORM tự serialize/deserialize JSONB → JavaScript object.

**Query JSONB trong TypeORM:**

```typescript
// Tìm tất cả multiple_choice questions
await questionRepo.find({
  where: { questionType: 'multiple_choice' }
});

// Tìm questions với specific config value (dùng raw query):
await questionRepo.query(`
  SELECT * FROM questions
  WHERE config->>'blanks' = '3'
  AND question_type = 'fill_in_blank'
`);
```

`->` operator: Extract JSON field (returns JSON)
`->>` operator: Extract JSON field as text

---

## Q7. Giải thích `learner_mistakes` table. Data được insert từ đâu và tại sao bypass NestJS?

**Trả lời:**

```sql
CREATE TABLE learner_mistakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL,
  question_id UUID NOT NULL,
  mistake_type VARCHAR(50),  -- question_type của câu sai
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Insert từ Next.js AI route (bypass NestJS):**

```typescript
// app/api/ai/analyze-result/route.ts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Insert mistakes trực tiếp vào Supabase
const mistakeRows = wrongQuestionIds.map(questionId => ({
  learner_id: learnerId,
  question_id: questionId,
  mistake_type: 'wrong_answer',
  created_at: new Date().toISOString(),
}));

const { error } = await supabase.from('learner_mistakes').insert(mistakeRows);
```

**Tại sao bypass NestJS:**

Route `/api/ai/analyze-result` đã gọi:
1. Groq (AI analysis)
2. `PUT /api/attempts/:id/ai-feedback` (NestJS)

Nếu thêm một HTTP call nữa đến NestJS analytics-service để insert mistakes → 3 sequential HTTP calls → tăng latency đáng kể.

Supabase anon key cho phép direct DB access (nếu Row Level Security đúng cách, hoặc trong dự án này RLS là permissive). Direct write nhanh hơn.

**Known Security Issue:**

Dùng `NEXT_PUBLIC_SUPABASE_ANON_KEY` — key này expose ra browser (do có prefix `NEXT_PUBLIC_`). Trong thực tế:
- Row Level Security (RLS) phải được config để restrict writes
- Hoặc dùng Supabase service role key (server-only, không `NEXT_PUBLIC_`)

Dự án dùng `NEXT_PUBLIC_` vì key này cũng cần dùng ở client-side cho Supabase auth. Đây là compromise được document trong known issues.
