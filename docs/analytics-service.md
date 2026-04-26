# Analytics Service

**Port:** 5004  
**Prefix:** `/analytics`  
**Swagger:** http://localhost:5004/api/docs

Tracks learner band progression, mistake patterns, and generates dashboard summaries. Subscribes to test submission events via RabbitMQ to trigger automatic syncs.

---

## Entities

### LearnerBandProfile (`learner_band_profiles` table)

```typescript
@Entity('learner_band_profiles')
class LearnerBandProfile {
  @PrimaryColumn('uuid') id: string;      // Set by app before insert
  @Column({ name: 'learner_id' }) learnerId: string;
  @Column({ length: 50, nullable: true }) skill: string;  // 'reading'|'listening'|'writing'|'speaking'|'overall'
  @Column({ name: 'current_band', type: 'decimal', precision: 2, scale: 1, nullable: true }) currentBand: number;
  @Column({ name: 'target_band', type: 'decimal', precision: 2, scale: 1, nullable: true }) targetBand: number;
  @CreateDateColumn({ name: 'assessed_at' }) assessedAt: Date;
}
```

### LearnerMistake (`learner_mistakes` table)

```typescript
@Entity('learner_mistakes')
class LearnerMistake {
  @PrimaryColumn('uuid') id: string;
  @Column({ name: 'learner_id' }) learnerId: string;
  @Column({ name: 'question_id' }) questionId: string;
  @Column({ name: 'mistake_type', length: 50, nullable: true }) mistakeType: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
```

### LearnerProgressSnapshot (`learner_progress_snapshots` table)

```typescript
@Entity('learner_progress_snapshots')
class LearnerProgressSnapshot {
  @PrimaryColumn('uuid') id: string;
  @Column({ name: 'learner_id' }) learnerId: string;
  @Column({ name: 'overall_band', type: 'decimal', precision: 2, scale: 1, nullable: true }) overallBand: number;
  @CreateDateColumn({ name: 'snapshot_at' }) snapshotAt: Date;
}
```

---

## DTOs

### UpsertBandProfileDto

```typescript
{
  learnerId: string;
  skill: string;          // 'reading'|'listening'|'writing'|'speaking'|'overall'
  currentBand?: number;
  targetBand?: number;
}
```

### CreateSnapshotDto

```typescript
{
  learnerId: string;
  overallBand: number;
}
```

### CreateMistakeDto

```typescript
{
  learnerId: string;
  questionId: string;
  mistakeType: string;
}
```

---

## Endpoints

### GET `/analytics/summary/:learnerId`

Full learner dashboard. The most expensive endpoint — aggregates band profiles, progress, mistakes, mastery, and study plan in one response.

**Auth:** None  
**Response:** `DashboardSummary` (see [types.md in my-app](../../my-app/docs/types.md#dashboardsummary))

**Algorithm:**
1. Load band profiles, progress snapshots, mistakes from DB
2. If no profiles exist, run `fullSyncLearnerAnalytics` first (backfill)
3. Calculate `totalAttempts`, `averageBand`, `practiceHours` (sum of attempt durations via EXTRACT EPOCH)
4. Calculate `examReadiness`: `(averageBand / 9) * 100` clamped 0–100
5. Compute `questionTypeMastery`: group `question_attempts` by `question_type`, calculate accuracy, assign mastery level:
   - < 40% accuracy → `'beginner'`
   - 40–65% → `'developing'`
   - 65–80% → `'proficient'`
   - > 80% → `'advanced'`
6. Generate `adaptiveStudyPlan`: prioritize weakest skill bands + weakest question types
7. Fetch latest writing/speaking submissions with scores for `rubricBreakdown`

---

### GET `/analytics/band-profiles/:learnerId`

Per-skill band profiles for a learner (5 records: reading, listening, writing, speaking, overall).

**Auth:** None  
**Response:** `LearnerBandProfile[]`

---

### PUT `/analytics/band-profiles`

Create or update a band profile for a learner-skill combination.

**Auth:** None  
**Request body:** `UpsertBandProfileDto`

**Logic:** INSERT ON CONFLICT (learnerId, skill) DO UPDATE — upsert based on the unique combination.

**Response:** `LearnerBandProfile`

---

### GET `/analytics/progress/:learnerId`

Time-series progress snapshots for charts (one entry per completed attempt).

**Auth:** None  
**Response:** `LearnerProgressSnapshot[]` sorted by `snapshotAt` ascending

---

### POST `/analytics/progress/snapshot`

Manually create a progress snapshot.

**Auth:** None  
**Request body:** `CreateSnapshotDto`  
**Response:** `LearnerProgressSnapshot`

---

### GET `/analytics/mistakes/:learnerId`

All logged mistakes for a learner, ordered by `createdAt` descending.

**Auth:** None  
**Response:** `LearnerMistake[]`

---

### POST `/analytics/mistakes`

Record a new mistake entry.

**Auth:** None  
**Request body:** `CreateMistakeDto`  
**Response:** `LearnerMistake`

---

### POST `/analytics/sync/:learnerId`

Full analytics rebuild for one learner. Deletes and rebuilds all band profiles, progress snapshots, and mistakes from source data.

**Auth:** None  

**Algorithm (`fullSyncLearnerAnalytics`):**
1. DELETE all existing `learner_band_profiles`, `learner_progress_snapshots`, `learner_mistakes` for learnerId
2. Query `test_attempts` → GROUP BY skill → AVG(band_score) → upsert one band profile per skill
3. Compute `overall` band = AVG of all skill bands → upsert overall band profile
4. Query `test_attempts` ORDER BY `submitted_at` → create one progress snapshot per submitted attempt
5. Query `question_attempts WHERE is_correct = false` → create one mistake per wrong answer
6. `mistakeType` = `question_type` of the question (joined via questions table)

**Response:** `{ message: 'Sync completed' }`

---

### POST `/analytics/sync-all`

Full rebuild for all learners. Intended for admin use or data repair.

**Auth:** None  
**Response:** `{ message: 'All synced' }`

---

### GET `/analytics/admin/global-stats`

Platform-wide metrics for the admin dashboard.

**Auth:** None  
**Response:** `AdminGlobalStats`

**Queries performed:**
- `COUNT(DISTINCT learner_id)` from `learner_profiles`
- `COUNT(*)` and `COUNT(*) WHERE submitted_at IS NOT NULL` from `test_attempts`
- `AVG(band_score) WHERE band_score IS NOT NULL` from `test_attempts`
- Attempts per day (last 30 days): group by date using `EXTRACT(EPOCH FROM started_at)`
- Band distribution buckets: COUNT per band range (0–4, 4–5.5, 5.5–6.5, 6.5–7.5, 7.5–9)
- Skill breakdown: GROUP BY skill, AVG(band_score), COUNT
- Top 5 learners: learners with ≥1 attempt, ranked by AVG(band_score)
- Recent 10 submissions: JOIN with accounts to get email, JOIN with tests to get title

---

## RabbitMQ Handler

```typescript
@EventPattern(RMQ_PATTERNS.ANALYTICS.TEST_SUBMITTED)
async handleTestSubmitted(data: {
  learnerId: string;
  testId: string;
  attemptId: string;
  skill: string;
  bandScore: number | null;
  submittedAt: string;
}) {
  // Triggers fullSyncLearnerAnalytics for the learner
  await this.analyticsService.fullSyncLearnerAnalytics(data.learnerId);
}
```

This is the primary trigger for analytics updates — every time a learner submits a test, their analytics are automatically rebuilt from scratch.
