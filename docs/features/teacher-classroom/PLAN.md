# PLAN — Vai trò Giáo viên & Lớp học (Teacher & Classroom)

| | |
|---|---|
| Trạng thái | **Draft v1 – chờ review** |
| Repo ảnh hưởng | `ielts-be` (auth-service, test-service, analytics-service, api-gateway, **classroom-service mới**), `ielts-fe` |
| Phụ thuộc | PR [ielts-be#1](https://github.com/minhnghi123/ielts-be/pull/1) và [ielts-fe#1](https://github.com/minhnghi123/ielts-fe/pull/1) (JWT/role ở gateway, attempt server-side, `RolesGuard`, `INTERNAL_API_KEY`) **phải được merge trước** khi implement |
| Khảo sát sản phẩm | [research.md](./research.md) |

---

## Mục lục

1. [Mục tiêu & phạm vi](#1-mục-tiêu--phạm-vi)
2. [Hiện trạng liên quan](#2-hiện-trạng-liên-quan)
3. [Personas & user stories](#3-personas--user-stories)
4. [Kiến trúc tổng thể](#4-kiến-trúc-tổng-thể)
5. [Mô hình dữ liệu & migration](#5-mô-hình-dữ-liệu--migration)
6. [Phân quyền (RBAC)](#6-phân-quyền-rbac)
7. [API chi tiết](#7-api-chi-tiết)
8. [Luồng nghiệp vụ chính](#8-luồng-nghiệp-vụ-chính)
9. [Frontend: màn hình & UX](#9-frontend-màn-hình--ux)
10. [Tính năng đề xuất thêm](#10-tính-năng-đề-xuất-thêm)
11. [Lộ trình triển khai theo phase](#11-lộ-trình-triển-khai-theo-phase)
12. [Kế hoạch kiểm thử](#12-kế-hoạch-kiểm-thử)
13. [Rủi ro, edge cases & cách xử lý](#13-rủi-ro-edge-cases--cách-xử-lý)
14. [Biến môi trường, deploy, tài liệu](#14-biến-môi-trường-deploy-tài-liệu)
15. [Câu hỏi cần bạn chốt](#15-câu-hỏi-cần-bạn-chốt)

---

## 1. Mục tiêu & phạm vi

### 1.1 Mục tiêu
Thêm vai trò **Giáo viên (teacher)** bên cạnh *learner* và *admin*, cho phép giáo viên:

1. **Tạo & quản lý lớp học**: tên lớp, mô tả, band mục tiêu, mã tham gia, lưu trữ lớp.
2. **Quản lý học sinh trong lớp**: duyệt/mời/xoá học sinh, xem hồ sơ & tiến bộ từng em.
3. **Ngân hàng đề của giáo viên**: tự tạo đề (4 kỹ năng, dùng lại trình tạo đề của admin), đề ở chế độ
   *private* chỉ học sinh trong lớp được giao mới thấy; có thể dùng đề public của admin.
4. **Giao bài (assignment)**: đưa đề vào lớp với hạn nộp, cửa sổ thời gian, chế độ practice/mock, số lần làm,
   chính sách công bố điểm.
5. **Bảng điểm & tracking cả 4 kỹ năng**: ma trận học sinh × bài giao; chi tiết từng bài (đúng/sai từng câu,
   bài viết, audio, điểm AI); tiến bộ theo thời gian; điểm yếu theo dạng câu hỏi.
6. **Chấm/duyệt bài Writing & Speaking**: xem điểm AI, **điều chỉnh band + nhận xét**; học sinh thấy cả nhận
   xét AI lẫn giáo viên. Cặp (AI band, teacher band) được lưu để **đánh giá độ chính xác LLM** (chương thực
   nghiệm của luận văn).
7. **Phân tích lớp**: band trung bình theo kỹ năng, phân bố, tỉ lệ hoàn thành, học sinh có nguy cơ.

### 1.2 Ngoài phạm vi (v1)
Live class/video, chat realtime, thanh toán, tài khoản phụ huynh, SSO/LTI với trường, IELTS General
Training, ứng dụng mobile.

### 1.3 Nguyên tắc
- **Tái sử dụng**: không viết lại timer/autosave/chấm điểm; lớp học chỉ gắn ngữ cảnh lên `test_attempts`.
- **Bảo mật như hiện tại**: identity lấy từ JWT ở gateway, downstream dùng `RolesGuard` + `x-internal-key`.
- **Không phá API cũ**: learner/admin không đổi hành vi; mọi field mới nullable hoặc có default.
- **Migration thủ công** (`synchronize: false`) → file `db/migrations/002_teacher_classroom.sql`.

---

## 2. Hiện trạng liên quan

| Thành phần | Hiện tại | Ảnh hưởng |
|---|---|---|
| `accounts` + `learner_profiles` / `admin_profiles` | Role suy ra từ việc có profile nào (`learnerProfile ? 'learner' : 'admin'`) | Thêm `teacher_profiles`, thứ tự ưu tiên admin → teacher → learner |
| JWT payload `{sub, email, role, profileId}` | role ∈ {learner, admin}; gateway ép mọi role lạ về `learner` | Thêm `teacher`; `profileId` = `teacher_profiles.id` |
| `GatewayAuthGuard` | 3 danh sách: PUBLIC / ADMIN / SYSTEM (regex) | Thêm danh sách TEACHER và route `/api/classes`, `/api/teacher` |
| `RolesGuard`, `resolveLearnerId`, `isPrivileged` (libs/common) | privileged = admin \| system | Teacher **không** privileged toàn cục; chỉ được truy cập học sinh **trong lớp mình** (kiểm tra ở classroom-service) |
| `tests.created_by` (account id), `status`, `difficulty` | Learner chỉ thấy `published` | Thêm `visibility` (`public`/`private`) và quyền sở hữu cho teacher |
| `test_attempts` (test-service) | Đã có `status`, `expires_at`, `draft_answers`, `is_practice`, `band_score`, `ai_feedback` | Thêm `assignment_id` (nullable) + phát event khi nộp / khi có band AI |
| `PUT /attempts/:id/ai-feedback` (system) | Lưu band Writing/Speaking từ Next.js server route | Sau khi lưu → phát event `classroom.attempt.graded` |
| analytics-service | band profile / snapshot / mistakes theo learner | Classroom gọi nội bộ để lấy tiến bộ từng học sinh; thêm endpoint batch |
| RabbitMQ | 1 queue / service (`RMQ_QUEUES`) | Thêm `ielts.classroom` |
| FE route groups | `(auth)`, `(home)`, `(learner)`, `(admin)`, `practice` | Thêm `(teacher)`; learner thêm `/classes` |
| FE `middleware.ts`, `auth-store` | role `'learner' \| 'admin'` | Thêm `'teacher'` + redirect `/teacher` |

---

## 3. Personas & user stories

### Giáo viên (Teacher)
- T1. Đăng ký tài khoản giáo viên (hoặc được admin cấp) và được admin duyệt trước khi tạo lớp.
- T2. Tạo lớp "IELTS 6.5 – Tối T3/T5", nhận mã `AB3K9Q` và link mời, chia sẻ cho học sinh.
- T3. Duyệt học sinh xin vào lớp (hoặc bật "tự động duyệt"), xoá học sinh, xem danh sách.
- T4. Tạo đề Reading từ trình tạo đề (hoặc import), đề ở trạng thái *private*; hoặc chọn đề public của admin.
- T5. Giao đề vào lớp: mở 20:00 thứ 3, hạn 23:59 Chủ nhật, chế độ mock, 1 lần làm, công bố điểm sau hạn.
- T6. Xem bảng điểm: ai chưa làm, ai nộp muộn, band từng em; lọc theo kỹ năng; xuất CSV.
- T7. Mở bài Writing của một em: đọc bài, xem điểm AI 4 tiêu chí, sửa band 6.0 → 5.5, viết nhận xét, "trả bài".
- T8. Xem phân tích lớp: band trung bình 4 kỹ năng, dạng câu hỏi lớp yếu nhất, 3 học sinh có nguy cơ.
- T9. Đăng thông báo "Tuần này ôn Matching Headings" kèm link tài liệu.
- T10. Lưu trữ lớp khi khoá học kết thúc; vẫn xem được dữ liệu cũ.

### Học sinh (Learner)
- L1. Nhập mã lớp → gửi yêu cầu / vào lớp ngay.
- L2. Thấy danh sách bài giao với trạng thái *Chưa làm / Đang làm / Đã nộp / Nộp muộn / Quá hạn* và đếm ngược hạn.
- L3. Làm bài giao bằng đúng giao diện thi hiện có (timer, autosave, auto-submit).
- L4. Xem kết quả theo chính sách của giáo viên; xem nhận xét AI **và** nhận xét giáo viên.
- L5. Rời lớp.

### Admin
- A1. Duyệt / từ chối yêu cầu giáo viên; nâng learner thành teacher; hạ teacher về learner.
- A2. Xem danh sách lớp toàn hệ thống, khoá lớp vi phạm.
- A3. Chuyển đề private của giáo viên thành public (đưa vào ngân hàng chung) nếu chất lượng tốt.
- A4. Xuất dataset (AI band, teacher band) để tính MAE/QWK.

---

## 4. Kiến trúc tổng thể

### 4.1 Quyết định: tạo **`classroom-service`** mới

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Service mới `classroom-service`** (đề xuất) | Ranh giới nghiệp vụ rõ (lớp/bài giao/bảng điểm); đúng tinh thần microservice của luận văn; test-service không phình to | Thêm 1 app, 1 queue, 1 proxy controller, 1 env URL; cần event + internal HTTP giữa services |
| B. Module trong test-service | Ít dây nối, truy vấn attempt trực tiếp | test-service gánh cả đề, attempt, chấm, lớp học; khó trình bày kiến trúc |

Chọn **A**. Tất cả service dùng chung một DB Postgres (Supabase) như hiện nay, nhưng **mỗi service chỉ ghi vào
bảng của mình**; đọc chéo đi qua **RabbitMQ event** (dữ liệu điểm) hoặc **internal HTTP** (kiểm tra quyền,
lấy tiến bộ) với header `x-internal-key` + `x-user-role: system` — đúng pattern `syncAnalyticsAfterSubmit`
đang có trong test-service.

### 4.2 Sơ đồ

```
Browser ──JWT──▶ api-gateway (GatewayAuthGuard: public/learner/teacher/admin/system)
                    │ x-user-id / x-user-role / x-profile-id / x-internal-key
   ┌────────────────┼──────────────────┬───────────────────┬──────────────────┐
   ▼                ▼                  ▼                   ▼                  ▼
auth-service    test-service      submission-service   analytics-service   classroom-service (NEW :5005)
teacher_profiles tests.visibility  writing/speaking     band profiles        classes, class_members,
role=teacher     attempts.assignment_id  submissions    snapshots, mistakes  class_assignments,
approve/reject   ──event──────────────────────────────────────────────────▶ assignment_submissions,
                 classroom.attempt.submitted / .graded   (queue ielts.classroom)   class_posts
                 ◀──internal HTTP GET /internal/access?learnerId&testId──┘
                                                         ▲ internal HTTP (progress of a learner) ┘
```

### 4.3 Luồng dữ liệu điểm số (event-driven)
1. Learner nộp bài (hoặc hết giờ) → test-service `gradeAndClose()` → ngoài việc sync analytics như hiện tại,
   **emit** `classroom.attempt.submitted` `{attemptId, assignmentId, learnerId, testId, skill, status,
   rawScore, bandScore, submittedAt, expiresAt}` nếu `assignment_id != null`.
2. Với Writing/Speaking, band AI đến sau qua `PUT /attempts/:id/ai-feedback` → emit `classroom.attempt.graded`
   `{attemptId, assignmentId, bandScore, aiFeedback(summary)}`.
3. classroom-service consumer **upsert** `assignment_submissions` (idempotent theo `attempt_id`).
4. Dự phòng: `POST /classes/:id/assignments/:aid/sync` (teacher) gọi internal HTTP sang test-service
   `GET /internal/attempts?assignmentId=` để đồng bộ lại khi mất event.

---

## 5. Mô hình dữ liệu & migration

### 5.1 auth-service — `teacher_profiles` (mới)

| Cột | Kiểu | Null | Default | Ghi chú |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK; là `profileId` trong JWT và `teacher_id` trong `classes` |
| `account_id` | uuid | NO | | FK → `accounts.id`, **UNIQUE** |
| `organization` | varchar(255) | YES | | Trung tâm / trường |
| `bio` | text | YES | | Giới thiệu, hiển thị cho học sinh |
| `approval_status` | varchar(20) | NO | `'pending'` | `pending` \| `approved` \| `rejected` |
| `approved_by` | uuid | YES | | FK → `accounts.id` (admin) |
| `approved_at` | timestamptz | YES | | |
| `created_at` | timestamptz | NO | `now()` | |

**Xác định role khi login** (auth-service): `adminProfile → 'admin'`, else `teacherProfile → 'teacher'`,
else `'learner'`. Giáo viên *pending* vẫn đăng nhập với `role='teacher'` nhưng JWT có thêm
`teacherStatus: 'pending'`; classroom-service từ chối tạo lớp khi chưa `approved` (FE hiển thị màn "Đang chờ duyệt").

> Learner được admin nâng cấp lên teacher: tạo `teacher_profiles` (approved), **giữ** `learner_profiles` để
> không mất lịch sử; role mới = teacher (ưu tiên). Có thể hạ cấp bằng cách xoá/`rejected` teacher_profile.

### 5.2 test-service — thay đổi

`tests`
| Cột | Kiểu | Default | Ghi chú |
|---|---|---|---|
| `visibility` | varchar(10) | `'public'` | `public` (ngân hàng chung) \| `private` (chỉ qua bài giao). Đề do teacher tạo mặc định `private`. |
| `owner_role` | varchar(10) | `'admin'` | `admin` \| `teacher` — để lọc nhanh "đề của giáo viên" (created_by vẫn là account id) |

`test_attempts`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `assignment_id` | uuid NULL | FK logic → `class_assignments.id` (không FK vật lý vì khác service); index |
| `attempt_no` | int default 1 | Lần thứ mấy trong cùng assignment (phục vụ `max_attempts`) |

### 5.3 classroom-service — bảng mới

`classes`
| Cột | Kiểu | Null | Default | Ghi chú |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | |
| `teacher_id` | uuid | NO | | → `teacher_profiles.id` (chủ lớp) |
| `name` | varchar(120) | NO | | |
| `description` | text | YES | | |
| `target_band` | decimal(3,1) | YES | | VD 6.5 — dùng để cảnh báo nguy cơ |
| `join_code` | varchar(8) | NO | | **UNIQUE**, 6 ký tự A–Z2–9 (bỏ 0/O/1/I), có thể "đổi mã" |
| `join_policy` | varchar(10) | NO | `'approval'` | `open` (vào ngay) \| `approval` (giáo viên duyệt) \| `closed` |
| `max_members` | int | YES | | null = không giới hạn |
| `cover_color` | varchar(20) | YES | | theme card |
| `status` | varchar(10) | NO | `'active'` | `active` \| `archived` |
| `created_at`, `updated_at` | timestamptz | NO | now() | |

`class_members`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` uuid PK | | |
| `class_id` uuid | → classes | |
| `learner_id` uuid | → learner_profiles.id | |
| `status` varchar(10) | `pending` \| `active` \| `removed` \| `left` | |
| `joined_at`, `left_at` timestamptz | | |
| `note` text NULL | ghi chú riêng của giáo viên về học sinh | |
| UNIQUE(`class_id`, `learner_id`) | | |

`class_assignments`
| Cột | Kiểu | Default | Ghi chú |
|---|---|---|---|
| `id` uuid PK | | | |
| `class_id` uuid | | → classes |
| `test_id` uuid | | → tests (logic FK) |
| `test_snapshot` jsonb | | `{title, skill, difficulty, durationMinutes}` để hiển thị nhanh & bền khi đề bị sửa |
| `title` varchar(160) | | mặc định = tên đề |
| `instructions` text NULL | | |
| `mode` varchar(10) | `'mock'` | `practice` \| `mock` (map sang `is_practice`) |
| `open_at` timestamptz NULL | | null = mở ngay |
| `due_at` timestamptz | | hạn nộp (bắt buộc) |
| `close_at` timestamptz NULL | | sau mốc này không làm được; null = `allow_late` vô hạn |
| `allow_late` bool | true | nộp sau `due_at` nhưng trước `close_at` → gắn `late` |
| `max_attempts` int | 1 | 0 = không giới hạn |
| `result_policy` varchar(15) | `'immediately'` | `immediately` \| `after_due` \| `manual` (giáo viên bấm "trả bài") |
| `results_released_at` timestamptz NULL | | khi `manual` |
| `extra_time` jsonb NULL | | `{learnerId: extraSeconds}` – hỗ trợ học sinh đặc biệt (Phase 3) |
| `status` varchar(10) | `'scheduled'` | `scheduled` \| `open` \| `closed` \| `archived` (tính toán từ thời gian, lưu để lọc) |
| `created_by` uuid, `created_at`, `updated_at` | | account id giáo viên |

`assignment_submissions` (bản chiếu – *read model* – của attempt trong ngữ cảnh lớp)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` uuid PK | | |
| `assignment_id` uuid | → class_assignments | |
| `learner_id` uuid | | |
| `attempt_id` uuid | **UNIQUE** – idempotent khi nhận event lặp | |
| `attempt_no` int | | |
| `status` varchar(12) | `in_progress` \| `submitted` \| `late` \| `expired` | |
| `skill` varchar(20) | | |
| `raw_score` int NULL, `ai_band` decimal(3,1) NULL | điểm hệ thống/AI | |
| `teacher_band` decimal(3,1) NULL | giáo viên override (Writing/Speaking; cho phép cả L/R nếu muốn sửa tay) | |
| `final_band` decimal(3,1) NULL | = `teacher_band ?? ai_band` (cột tính, cập nhật khi ghi) | |
| `teacher_feedback` text NULL, `teacher_rubric` jsonb NULL | nhận xét + điểm 4 tiêu chí của giáo viên | |
| `reviewed_by` uuid NULL, `reviewed_at` timestamptz NULL | | |
| `started_at`, `submitted_at`, `graded_at` timestamptz | | |
| INDEX(`assignment_id`, `learner_id`) | | |

`class_posts` (bảng tin – Phase 2)
| Cột | Ghi chú |
|---|---|
| `id`, `class_id`, `author_account_id`, `type` (`announcement` \| `material`), `title`, `body` text, `attachments` jsonb (`[{name,url}]`), `pinned` bool, `created_at` |

`class_invites` (Phase 3)
| `id`, `class_id`, `email`, `token` unique, `status` (`pending`/`accepted`/`expired`), `expires_at`, `created_at` |

### 5.4 Migration `db/migrations/002_teacher_classroom.sql` (phác thảo)
```sql
BEGIN;
CREATE TABLE IF NOT EXISTS teacher_profiles (...);           -- §5.1
ALTER TABLE tests ADD COLUMN IF NOT EXISTS visibility varchar(10) NOT NULL DEFAULT 'public',
                  ADD COLUMN IF NOT EXISTS owner_role varchar(10) NOT NULL DEFAULT 'admin';
ALTER TABLE tests ADD CONSTRAINT tests_visibility_chk CHECK (visibility IN ('public','private'));
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS assignment_id uuid,
                          ADD COLUMN IF NOT EXISTS attempt_no int NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_test_attempts_assignment ON test_attempts(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS classes (...); CREATE TABLE IF NOT EXISTS class_members (...);
CREATE TABLE IF NOT EXISTS class_assignments (...); CREATE TABLE IF NOT EXISTS assignment_submissions (...);
CREATE TABLE IF NOT EXISTS class_posts (...);
-- CHECK constraints cho status/mode/result_policy, UNIQUE join_code, UNIQUE(class_id, learner_id), UNIQUE(attempt_id)
COMMIT;
```
Tất cả lệnh idempotent (`IF NOT EXISTS`) để chạy lại an toàn trên Supabase. Rollback: file `002_down.sql` kèm theo.

---

## 6. Phân quyền (RBAC)

### 6.1 Ma trận quyền

| Hành động | Learner | Teacher (approved) | Teacher (pending) | Admin | System |
|---|---|---|---|---|---|
| Xem đề public published | ✅ | ✅ | ✅ | ✅ | ✅ |
| Xem đề private | chỉ khi có assignment active trong lớp của mình | chỉ đề **của mình** | ❌ | ✅ | ✅ |
| Tạo/sửa/xoá đề | ❌ | ✅ đề của mình (`created_by = me`); không xoá nếu đang có assignment | ❌ | ✅ mọi đề | ❌ |
| Đổi `visibility` đề → public | ❌ | ❌ (gửi yêu cầu – Phase 3) | ❌ | ✅ | ❌ |
| Tạo lớp | ❌ | ✅ | ❌ | ✅ (thay mặt teacher) | ❌ |
| Sửa/lưu trữ/đổi mã lớp | ❌ | chủ lớp | ❌ | ✅ | ❌ |
| Join lớp bằng mã | ✅ | ❌ | ❌ | ❌ | ❌ |
| Duyệt/xoá học sinh | ❌ | chủ lớp | ❌ | ✅ | ❌ |
| Tạo/sửa/xoá assignment | ❌ | chủ lớp | ❌ | ✅ | ❌ |
| Xem bảng điểm lớp | ❌ | chủ lớp | ❌ | ✅ | ❌ |
| Xem bài làm chi tiết của học sinh (câu trả lời, essay, audio, AI feedback) | của mình | học sinh trong lớp mình, **chỉ attempt thuộc assignment của lớp** | ❌ | ✅ | ✅ |
| Override band + nhận xét | ❌ | chủ lớp | ❌ | ✅ | ❌ |
| Xem tiến bộ/analytics 1 học sinh | của mình | học sinh trong lớp mình (tổng hợp, không gồm attempt ngoài lớp – xem §15) | ❌ | ✅ | ✅ |
| Duyệt giáo viên, đổi role | ❌ | ❌ | ❌ | ✅ | ❌ |
| Nhận event / sync nội bộ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 6.2 Thay đổi code dùng chung
- `libs/common/src/auth/user-context.ts`: `UserRole = 'learner' | 'teacher' | 'admin' | 'system'`;
  thêm `teacherStatus?: 'pending' | 'approved' | 'rejected'` vào `RequestUser` (header `x-teacher-status`).
  `isPrivileged()` **giữ nguyên** (admin|system). Thêm helper `isTeacher(user)` và
  `assertApprovedTeacher(user)`.
- `GatewayAuthGuard`: nhận `role === 'teacher'` từ JWT (không ép về learner); thêm `TEACHER_ROUTES`
  (xem §7) – teacher hoặc admin mới được gọi; POST `/api/tests*` cho teacher được phép (ownership kiểm tra ở test-service).
- `RolesGuard`: hỗ trợ `@Roles('teacher','admin')`.

---

## 7. API chi tiết

Tất cả qua gateway `/api/...`. Phản hồi theo `docs/response-format.md`. Lỗi: 401 chưa đăng nhập, 403 sai vai
trò/không sở hữu, 404 không tồn tại hoặc không thuộc lớp (không lộ sự tồn tại), 409 xung đột trạng thái.

### 7.1 auth-service
| Method & path | Vai trò | Mô tả |
|---|---|---|
| `POST /auth/register` | public | Body thêm `role?: 'learner'\|'teacher'`, `fullName?`, `organization?`. Teacher → `teacher_profiles.approval_status='pending'`. |
| `POST /auth/login`, `/auth/google` | public | Trả `role` ∈ {learner, teacher, admin}, `profileId`, `teacherStatus?`. Google login mặc định learner. |
| `GET /auth/profile` | any | Thêm `teacherStatus`, `organization`, `bio`. |
| `PUT /auth/profile` | any | Teacher sửa được `organization`, `bio`. |
| `GET /auth/users?role=teacher&status=` | admin | Mở rộng filter hiện có (`role` thêm `teacher`). |
| `GET /auth/teachers?approval=pending` | admin | Danh sách yêu cầu giáo viên. |
| `PATCH /auth/teachers/:teacherId/approval` `{status: approved\|rejected, reason?}` | admin | Duyệt / từ chối. |
| `PATCH /auth/users/:accountId/role` `{role: teacher\|learner}` | admin | Nâng/hạ vai trò; không áp dụng cho admin; không tự đổi chính mình. |
| `GET /auth/internal/learners?ids=` | system | Trả `{id, fullName, email, avatarUrl}` cho danh sách learner (dùng cho bảng điểm; cache 60s ở classroom-service). |

### 7.2 test-service
| Method & path | Vai trò | Mô tả |
|---|---|---|
| `GET /tests` | public/any | Learner & khách: `visibility='public' AND status='published'`. Teacher: thêm `?mine=true` (đề của mình mọi status). Admin: tất cả, filter `ownerRole`, `visibility`. |
| `GET /tests/:id` | public/any | Private test: teacher chủ sở hữu, admin, system; learner phải có assignment hợp lệ → test-service gọi `GET {CLASSROOM_URL}/internal/access?learnerId&testId` (cache 60s). Vẫn strip đáp án khi chưa nộp như hiện tại. |
| `POST /tests`, `/tests/manual`, `/tests/writing`, `/tests/speaking`, `/tests/import` | admin, teacher | Teacher: `created_by = account id`, `owner_role='teacher'`, `visibility='private'` (không cho đổi). |
| `PUT/PATCH/DELETE /tests/:id` & sections/groups/questions/writing-tasks/speaking-parts | admin, teacher | Teacher chỉ trên đề `created_by = me`. DELETE bị 409 nếu classroom-service báo còn assignment (`GET /internal/assignments/count?testId`). |
| `PATCH /tests/:id/visibility` | admin | `public`/`private`. |
| `POST /tests/:testId/attempts` `{assignmentId?, durationMinutes?}` | learner | Nếu có `assignmentId`: gọi `GET /internal/assignments/:id/eligibility?learnerId` → nhận `{allowed, reason, mode, maxAttempts, attemptsUsed, closeAt, extraSeconds}`; set `is_practice`, `assignment_id`, `attempt_no`; `expires_at = min(now+duration+extra, closeAt)`. |
| `GET /attempts?assignmentId=` | learner (của mình) / system | Lọc theo assignment. |
| `GET /internal/attempts?assignmentId=&learnerId=` | system | Dùng cho sync dự phòng & màn chi tiết của giáo viên (trả cả `questionAttempts`, đáp án, giải thích vì đã nộp). |
| (event) `classroom.attempt.submitted`, `classroom.attempt.graded` | — | Emit từ `gradeAndClose()` và `applyAiFeedback()` khi `assignment_id != null`. |

### 7.3 submission-service
| Method & path | Vai trò | Mô tả |
|---|---|---|
| `GET /internal/attempts/:attemptId/artifacts` | system | Gom essay(s) + `ai_writing_gradings` + speaking submissions (audio_url, transcript, scores) của attempt → classroom-service dùng cho màn review của giáo viên. |

### 7.4 analytics-service
| Method & path | Vai trò | Mô tả |
|---|---|---|
| `GET /analytics/internal/learners/summary?ids=` | system | Batch `{learnerId: {overallBand, bands{skill}, lastActiveAt, trend}}` cho trang Học sinh của lớp. |
| `GET /analytics/summary/:learnerId` …(hiện có) | + teacher | Cho phép teacher **nếu** classroom-service xác nhận học sinh thuộc lớp của họ → đơn giản hơn: FE giáo viên gọi `GET /classes/:id/students/:learnerId/progress` (classroom-service proxy nội bộ), không mở analytics trực tiếp cho teacher. |

### 7.5 classroom-service (mới, prefix `/classes`, `/teacher`, `/internal`)

**Lớp học**
| Method & path | Vai trò | Mô tả |
|---|---|---|
| `POST /classes` | teacher(approved), admin | `{name, description?, targetBand?, joinPolicy?, maxMembers?, coverColor?}` → sinh `join_code`. |
| `GET /classes` | teacher: lớp của mình; learner: lớp đang tham gia; admin: tất cả (`?teacherId=`, `?status=`, `?search=`) | Kèm `memberCount`, `assignmentCount`, `pendingCount`. |
| `GET /classes/:id` | thành viên active / chủ lớp / admin | Chi tiết + `teacher {fullName, avatar, organization}`; learner không thấy join_code & pending list. |
| `PATCH /classes/:id` | chủ lớp, admin | Sửa thông tin, `joinPolicy`, `status` (archive/unarchive). |
| `POST /classes/:id/join-code/rotate` | chủ lớp, admin | Đổi mã. |
| `DELETE /classes/:id` | admin | Xoá cứng (chỉ khi `archived` và không có submission) – teacher chỉ archive. |

**Thành viên**
| Method & path | Vai trò | Mô tả |
|---|---|---|
| `POST /classes/join` `{code}` | learner | `open` → `active`; `approval` → `pending`; `closed`/full/archived → 409. Idempotent nếu đã là thành viên. |
| `GET /classes/:id/members?status=` | chủ lớp, admin (learner chỉ thấy `active`, không email) | Kèm thông tin learner từ auth internal + tóm tắt analytics (band hiện tại, bài đã nộp/đã giao, lần hoạt động cuối). |
| `PATCH /classes/:id/members/:learnerId` `{status: active\|removed, note?}` | chủ lớp, admin | Duyệt / xoá / ghi chú. |
| `POST /classes/:id/leave` | learner | → `left`. |
| `GET /classes/:id/students/:learnerId/progress` | chủ lớp, admin | Gộp: analytics summary (internal), danh sách submissions trong lớp, điểm yếu theo dạng câu hỏi (từ `question_attempts` của các attempt thuộc lớp – qua test-service internal). |

**Bài giao**
| Method & path | Vai trò | Mô tả |
|---|---|---|
| `POST /classes/:id/assignments` | chủ lớp, admin | `{testId, title?, instructions?, mode, openAt?, dueAt, closeAt?, allowLate, maxAttempts, resultPolicy}`. Validate: test tồn tại & (public published \| private của chính teacher) qua test-service internal; `openAt < dueAt <= closeAt`. Lưu `test_snapshot`. |
| `GET /classes/:id/assignments?status=` | thành viên, chủ lớp, admin | Learner nhận thêm `mySubmission {status, attemptsUsed, finalBand?, canStart, canViewResult}`; teacher nhận `stats {submitted, late, missing, avgBand}`. |
| `GET /classes/:id/assignments/:aid` | như trên | Chi tiết. |
| `PATCH /classes/:id/assignments/:aid` | chủ lớp, admin | Sửa hạn/cấu hình (không đổi `testId` khi đã có submission). |
| `DELETE /classes/:id/assignments/:aid` | chủ lớp, admin | 409 nếu đã có submission → dùng `status=archived`. |
| `POST /classes/:id/assignments/:aid/release` | chủ lớp, admin | `result_policy=manual`: công bố điểm. |
| `POST /classes/:id/assignments/:aid/sync` | chủ lớp, admin | Đồng bộ lại từ test-service (dự phòng). |
| `POST /classes/:id/assignments/:aid/remind` | chủ lớp | Gửi nhắc nhở học sinh chưa nộp (Phase 3 – email/in-app). |

**Bảng điểm & review**
| Method & path | Vai trò | Mô tả |
|---|---|---|
| `GET /classes/:id/gradebook?skill=&from=&to=` | chủ lớp, admin | `{students:[{learnerId, name, avatar}], assignments:[...], cells:{[learnerId][assignmentId]: {status, finalBand, aiBand, teacherBand, late, attemptId}} , totals:{avgByStudent, avgByAssignment}}` |
| `GET /classes/:id/gradebook.csv` | chủ lớp, admin | Xuất CSV (UTF-8 BOM để mở Excel tiếng Việt). |
| `GET /classes/:id/assignments/:aid/submissions` | chủ lớp, admin | Danh sách theo học sinh, gồm `missing` (chưa làm) tính từ members active. |
| `GET /classes/:id/submissions/:sid` | chủ lớp, admin, **learner chủ bài** (chỉ phần được phép theo `result_policy`) | Gộp: attempt (câu trả lời/đáp án/giải thích), artifacts (essay, AI rubric, audio, transcript), teacher review. |
| `PUT /classes/:id/submissions/:sid/review` | chủ lớp, admin | `{teacherBand?, teacherRubric?: {taskResponse, coherence, lexical, grammar} \| {fluency, lexical, grammar, pronunciation}, teacherFeedback, releaseNow?: bool}` → band 0–9 bước 0.5; ghi `reviewed_by/at`; emit `classroom.submission.reviewed` cho analytics (cập nhật band profile dùng `final_band`). |
| `GET /classes/:id/analytics` | chủ lớp, admin | §8.6 |
| `GET /classes/:id/posts`, `POST /classes/:id/posts`, `PATCH/DELETE /classes/:id/posts/:pid` | thành viên đọc; chủ lớp ghi | Bảng tin (Phase 2). |

**Internal (system only)**
| Method & path | Mô tả |
|---|---|
| `GET /internal/access?learnerId&testId` | `{allowed: bool, assignmentIds: []}` – có assignment `open`/`closed-but-viewable` trong lớp mà learner `active`. |
| `GET /internal/assignments/:id/eligibility?learnerId` | Kiểm tra cửa sổ thời gian, `max_attempts`, thành viên; trả `mode`, `closeAt`, `extraSeconds`. |
| `GET /internal/assignments/count?testId` | Chặn xoá đề. |
| `(event) classroom.attempt.submitted / .graded` | Upsert `assignment_submissions`. |

**Admin / nghiên cứu**
| Method & path | Mô tả |
|---|---|
| `GET /teacher/evaluation/ai-vs-teacher.csv?skill=writing` (admin) | Dataset `{submissionId, skill, aiBand, teacherBand, aiRubric, teacherRubric, modelName, promptVersion}` để tính MAE, QWK, Pearson trong luận văn. |
| `GET /analytics/admin/global-stats` (mở rộng) | Thêm `teachers`, `classes`, `assignments`, `reviewedSubmissions`. |

---

## 8. Luồng nghiệp vụ chính

### 8.1 Đăng ký & duyệt giáo viên
1. FE `/register` thêm lựa chọn **"Tôi là giáo viên"** → thêm trường Họ tên, Đơn vị.
2. auth-service tạo `accounts` + `teacher_profiles(pending)`; email xác nhận (Phase 3).
3. Teacher đăng nhập → FE điều hướng `/teacher`; thấy banner "Tài khoản đang chờ admin duyệt" và chỉ được
   xem đề public, sửa hồ sơ.
4. Admin vào `/admin/teachers` → Duyệt / Từ chối (kèm lý do). Sau duyệt, lần đăng nhập/refresh profile kế
   tiếp có `teacherStatus=approved` (FE gọi `GET /auth/profile` khi vào `/teacher` để cập nhật).

### 8.2 Tạo lớp → mời học sinh → duyệt
1. `POST /classes` → trả `joinCode`, `joinLink = {FE_URL}/classes/join?code=XXXXXX`, QR (FE tự render).
2. Học sinh vào `/classes/join`, nhập mã → `POST /classes/join`.
   - `open`: vào ngay; `approval`: trạng thái `pending`, giáo viên thấy badge "3 yêu cầu".
3. Giáo viên duyệt trong tab **Học sinh**; có thể "Duyệt tất cả".

### 8.3 Giáo viên tạo đề riêng
- `/teacher/tests` tái sử dụng toàn bộ trình tạo đề của admin (`app/(admin)/admin/tests/*` → tách thành
  `components/test-builder/*` dùng chung). Khác biệt: không có nút "Public", mặc định `private`, chỉ thấy đề của mình.
- Có tab "Ngân hàng chung" để duyệt đề public khi giao bài.

### 8.4 Giao bài → học sinh làm → điểm về bảng điểm
1. Teacher chọn đề (của mình hoặc public) → form assignment (§7.5) → `scheduled` nếu `openAt` tương lai, ngược lại `open`.
2. Learner vào `/classes/:id` → card bài giao: đếm ngược, nút **Bắt đầu** (disabled kèm lý do nếu chưa mở /
   hết lượt / đã đóng).
3. Nhấn Bắt đầu → FE `POST /tests/:testId/attempts {assignmentId}` → test-service kiểm tra eligibility
   (internal) → tạo attempt với `assignment_id`, `is_practice = mode==='practice'`, `expires_at` không vượt
   `close_at`. FE chuyển `/practice/:testId?assignment=:aid` – **giao diện thi giữ nguyên**.
4. Nộp bài / hết giờ → `gradeAndClose()` → emit `classroom.attempt.submitted` → `assignment_submissions`
   upsert (`status = submittedAt > dueAt ? 'late' : 'submitted'`).
5. Writing/Speaking: Next.js route chấm AI → `PUT /attempts/:id/ai-feedback` → emit `classroom.attempt.graded`
   → cập nhật `ai_band`, `graded_at`.
6. Kết quả hiển thị cho học sinh theo `result_policy`: trang result hiện có kiểm tra
   `GET /classes/:id/submissions/:sid` → nếu chưa được xem: màn "Điểm sẽ được công bố sau …".

### 8.5 Giáo viên review Writing/Speaking
1. Tab **Bảng điểm** → click ô → `/teacher/classes/:id/submissions/:sid`.
2. Màn 2 cột: trái = đề + bài viết (hoặc audio + transcript), phải = rubric AI 4 tiêu chí + feedback AI +
   form giáo viên (4 slider 0–9 bước 0.5, band tổng tự tính theo công thức IELTS, ô nhận xét, nút "Lưu & trả bài").
3. `PUT .../review` → `final_band = teacher_band`; học sinh nhận thông báo; result page hiển thị khối
   "Nhận xét của giáo viên" ưu tiên trên AI.
4. Bản ghi (ai_band, teacher_band) tích luỹ cho `GET /teacher/evaluation/ai-vs-teacher.csv`.

### 8.6 Phân tích lớp & cảnh báo nguy cơ
`GET /classes/:id/analytics` tính từ `assignment_submissions` + analytics internal:
- `avgBandBySkill`, `bandDistribution` (bucket 0.5), `completionRate` theo assignment, `lateRate`.
- `weakQuestionTypes`: top dạng câu hỏi có tỉ lệ sai cao nhất (lấy từ `question_attempts` của các attempt thuộc
  lớp qua test-service internal, group theo `question.type`).
- `atRisk`: học sinh thoả ≥1 điều kiện: bỏ ≥ 2 assignment liên tiếp; `final_band` trung bình < `target_band − 1.0`;
  band giảm ≥ 0.5 qua 2 bài gần nhất; không hoạt động > 14 ngày. Mỗi em kèm `reasons[]`.
- `trend`: band trung bình lớp theo tuần.
- (Phase 3) `aiInsight`: Next.js route gọi Groq tóm tắt 3 điểm yếu & 3 gợi ý can thiệp cho giáo viên.

---

## 9. Frontend: màn hình & UX

### 9.1 Điều hướng & bảo vệ route
- `middleware.ts`: `role === 'teacher'` → `/teacher/*`; chặn teacher vào `/admin`, `/practice` (teacher
  **xem thử đề** qua `/teacher/tests/:id/preview` – render giao diện thi ở chế độ read-only, không tạo attempt).
- `auth-store`: `role: 'learner' | 'teacher' | 'admin'`, `teacherStatus?`.
- Sau login: learner → `/`, teacher → `/teacher`, admin → `/admin`.

### 9.2 Route group `(teacher)` – sidebar: Tổng quan · Lớp học · Ngân hàng đề · Hồ sơ
| Route | Nội dung |
|---|---|
| `/teacher` | Cards: số lớp, học sinh, bài cần chấm (Writing/Speaking chưa review), bài sắp hết hạn; danh sách lớp dạng card (màu, số HS, bài đang mở); "Cần chú ý" (học sinh at-risk gộp các lớp). |
| `/teacher/classes` | Grid lớp + bộ lọc active/archived + nút Tạo lớp (dialog). |
| `/teacher/classes/[id]` | Header (tên, band mục tiêu, mã lớp + copy/QR, nút Giao bài). Tabs: **Bảng tin · Bài giao · Học sinh · Bảng điểm · Phân tích · Cài đặt**. |
| `…/assignments/new` | Form 3 bước: chọn đề (tab Đề của tôi / Ngân hàng chung, lọc kỹ năng/độ khó, xem trước) → cấu hình (mode, mở/hạn/đóng với date-time picker, số lần, công bố điểm) → xác nhận. |
| `…/assignments/[aid]` | Thống kê (đã nộp/muộn/chưa làm, band TB, phân bố), bảng học sinh, nút Trả bài/Nhắc nhở/Sync, phân tích theo câu hỏi. |
| `…/students/[learnerId]` | Hồ sơ học sinh trong lớp: band 4 kỹ năng, biểu đồ tiến bộ, lịch sử bài giao, dạng câu hỏi yếu, ghi chú giáo viên. |
| `…/submissions/[sid]` | Màn review (§8.5). Với L/R: bảng câu hỏi đúng/sai + đáp án + giải thích. |
| `/teacher/tests`, `/teacher/tests/new`, `/teacher/tests/[id]` | Tái sử dụng test-builder; badge "Private". |
| `/teacher/profile` | Hồ sơ + đơn vị + bio + đổi mật khẩu (dùng lại component learner). |

### 9.3 Learner
| Route | Nội dung |
|---|---|
| `/classes` (sidebar "Lớp học") | Lớp đang tham gia + nút "Tham gia bằng mã"; trạng thái `pending`. |
| `/classes/join?code=` | Trang nhập mã (auto-fill từ link/QR). |
| `/classes/[id]` | Tabs: Bài giao (card: kỹ năng, hạn, trạng thái, nút Bắt đầu/Tiếp tục/Xem kết quả) · Bảng tin · Thành viên (tên + avatar) · Điểm của tôi. |
| `/practice/[id]?assignment=` | Không đổi UI; truyền `assignmentId` khi start; banner nhỏ "Bài giao của lớp X · hạn …". |
| `/practice/[id]/result` | Thêm khối "Nhận xét của giáo viên" và trạng thái "chờ công bố" theo `result_policy`. |
| Dashboard | Widget "Bài giao sắp đến hạn" (3 bài gần nhất). |

### 9.4 Admin
| Route | Nội dung |
|---|---|
| `/admin/teachers` | Danh sách giáo viên + tab Chờ duyệt (Duyệt/Từ chối), nâng/hạ vai trò. |
| `/admin/classes` | Tất cả lớp, tìm kiếm, archive. |
| `/admin/tests` | Cột Chủ sở hữu/Visibility; hành động "Đưa vào ngân hàng chung". |
| `/admin/evaluation` | Bảng AI vs Teacher: MAE, QWK, biểu đồ phân tán, nút tải CSV. |

### 9.5 UX conventions
- Trạng thái bài giao bằng màu + icon nhất quán: *Sắp mở* (xám), *Đang mở* (xanh), *Sắp hết hạn <24h* (cam),
  *Đã đóng* (đỏ nhạt), *Đã nộp* (xanh lá), *Nộp muộn* (vàng).
- Empty state có hướng dẫn 3 bước (Tạo lớp → Mời học sinh → Giao bài). Loading skeleton cho bảng điểm.
- Mọi thời gian hiển thị theo múi giờ trình duyệt, lưu ISO UTC.
- Mobile: bảng điểm cuộn ngang, cột tên cố định (sticky).
- Accessibility: bảng có `scope`, nút có `aria-label`, focus ring, màu kèm chữ.

---

## 10. Tính năng đề xuất thêm

Xếp theo giá trị/chi phí. (✔ = đưa vào phase cụ thể ở §11)

| # | Tính năng | Lý do / nguồn cảm hứng | Phase |
|---|---|---|---|
| 1 | Chính sách công bố điểm (ngay / sau hạn / thủ công) | Testportal, Classroom "return" | 1 ✔ |
| 2 | Nhiều lần làm + lấy điểm cao nhất/lần cuối (`grade_policy`) | Moodle quiz | 2 |
| 3 | Teacher override band + rubric → dataset MAE/QWK | Yêu cầu đề cương (thực nghiệm) | 2 ✔ |
| 4 | Phân tích theo dạng câu hỏi IELTS cho lớp & cho từng em | Quizizz/Kahoot question report | 2 ✔ |
| 5 | Cảnh báo học sinh nguy cơ + lý do | Moodle analytics | 2 ✔ |
| 6 | Bảng tin / tài liệu lớp | Classroom Stream, Edmodo Library | 2 ✔ |
| 7 | Xuất CSV bảng điểm | Moodle grader report | 2 ✔ |
| 8 | Nhắc hạn (in-app + email) & thông báo khi được trả bài | Classroom | 3 |
| 9 | Mời qua email / import CSV danh sách | Classroom, ClassMarker | 3 |
| 10 | Thêm giờ cho học sinh cụ thể (`extra_time`) | Quizizz accommodations | 3 |
| 11 | Đồng giáo viên / trợ giảng | Classroom | 3 |
| 12 | Bảng xếp hạng nội bộ lớp (tuỳ chọn bật/tắt) | Quizizz/Kahoot | 3 |
| 13 | AI Insight cho giáo viên: tóm tắt điểm yếu lớp + gợi ý giáo án tuần | Điểm độc đáo cho luận văn (LLM cá nhân hoá) | 3 |
| 14 | Giáo viên "đề xuất đưa đề vào ngân hàng chung", admin duyệt | Chia sẻ nội dung | 3 |
| 15 | Chống gian lận nhẹ ở mode mock: ghi nhận số lần rời tab / fullscreen (log, không chặn) | Exam.net/Testportal | 3 |
| 16 | Mock test định kỳ làm "mốc" (Snapshot) & biểu đồ tiến bộ lớp | Edmodo Snapshot | 3 |
| 17 | Lộ trình cá nhân hoá hiện có đọc thêm `target_band` lớp & nhận xét giáo viên | Kết nối với module personalization sẵn có | 3 |

---

## 11. Lộ trình triển khai theo phase

Mỗi phase = 1 PR backend + 1 PR frontend (stack trên phase trước), build/lint/test xanh trước khi mở.

### Phase 0 – Chuẩn bị (0.5 ngày)
- [ ] Merge PR ielts-be#1 & ielts-fe#1; chạy `001_exam_realism.sql`; cấu hình `JWT_SECRET`, `INTERNAL_API_KEY`.
- [ ] Chốt các câu hỏi §15.

### Phase 1 – MVP lớp học (BE ~3 ngày, FE ~3 ngày)
**Backend**
- [ ] `libs/common`: `UserRole` + `teacher`, header `x-teacher-status`, helper `isTeacher`, `RolesGuard` cập nhật, test.
- [ ] auth-service: entity `TeacherProfile`, register `role`, login/profile trả role teacher, admin endpoints duyệt & đổi role, internal learners lookup.
- [ ] api-gateway: nhận role teacher, `TEACHER_ROUTES`, proxy `classroom.proxy.controller.ts` (`CLASSROOM_SERVICE_URL`), mở POST tests cho teacher; test.
- [ ] test-service: `visibility`/`owner_role`, ownership guard cho teacher, `assignment_id`/`attempt_no` trên attempt, eligibility check khi start, emit 2 event, `GET /internal/attempts`; grading spec bổ sung.
- [ ] **classroom-service**: scaffold app (`nest g app classroom-service`), entities 4 bảng (classes, members, assignments, submissions), CRUD lớp, join, members, assignments, gradebook, submission detail (gộp internal), event consumer, internal endpoints; unit test cho eligibility/time-window/status mapping.
- [ ] `db/migrations/002_teacher_classroom.sql` (+ down), docs: database/architecture/api-reference/message-queue/environment, `start:all` thêm service, `.env.example`.
**Frontend**
- [ ] Types/API clients (`lib/api/classroom.ts`, `lib/api/auth.ts` mở rộng), hooks, query keys.
- [ ] `middleware.ts`, `auth-store`, login redirect theo role, register "Tôi là giáo viên".
- [ ] `(teacher)` layout + sidebar; `/teacher`, `/teacher/classes`, `/teacher/classes/[id]` (tabs Bài giao · Học sinh · Bảng điểm · Cài đặt), form giao bài, chi tiết assignment, màn submission (xem câu trả lời/essay/audio + AI).
- [ ] Tách `components/test-builder` từ admin, dùng cho `/teacher/tests`.
- [ ] Learner: `/classes`, `/classes/join`, `/classes/[id]`, truyền `assignmentId` vào start attempt, result page theo `result_policy`.
- [ ] Admin: `/admin/teachers`.
- [ ] Loading/empty/error state, responsive.

### Phase 2 – Chấm/duyệt & phân tích (BE ~2 ngày, FE ~2.5 ngày)
- [ ] Review endpoint + rubric teacher; event `classroom.submission.reviewed` → analytics dùng `final_band`.
- [ ] `GET /classes/:id/analytics`, weak question types, at-risk; `gradebook.csv`.
- [ ] Bảng tin (`class_posts`).
- [ ] FE: màn review 2 cột, tab Phân tích (biểu đồ), tab Bảng tin, hồ sơ học sinh trong lớp, export CSV, widget "cần chấm".
- [ ] Admin `/admin/evaluation` + CSV AI-vs-Teacher (phục vụ chương thực nghiệm).

### Phase 3 – Nâng cao (chọn theo thời gian còn lại)
- [ ] Thông báo in-app (bảng `notifications` trong classroom-service) + email (Resend/SMTP) cho hạn nộp & trả bài.
- [ ] Mời email / CSV, `extra_time`, co-teacher, leaderboard lớp, AI Insight, đề xuất đề lên ngân hàng chung, log rời tab, Snapshot định kỳ.
- [ ] Docker compose thêm service; CI chạy test classroom-service.

---

## 12. Kế hoạch kiểm thử

### Unit (Jest)
- auth: role resolution (admin > teacher > learner), pending teacher payload, approve/reject, change role guards (không tự đổi mình, không đổi admin).
- common: `RolesGuard` với `teacher`; gateway route classification cho `/api/classes/*`, `/api/teacher/*`, POST `/api/tests` by teacher.
- test-service: ownership check teacher; `visibility` filter; start attempt với assignment (window, max attempts, `expires_at` cap theo `close_at`, `attempt_no`); emit event payload.
- classroom-service: join code generator (không ký tự nhầm lẫn, unique retry), join policy, assignment status machine theo thời gian, eligibility matrix (before open / open / after due & allow_late / after close / exhausted attempts / not member / archived class), submission upsert idempotent, `late` mapping, result visibility theo policy, at-risk rules, gradebook aggregation, CSV escape.

### Integration / e2e (supertest, DB test hoặc Supabase branch)
1. Teacher đăng ký → pending → không tạo được lớp (403) → admin duyệt → tạo được.
2. Learner join (approval) → pending → không thấy assignment → duyệt → thấy.
3. Giao đề private → learner ngoài lớp `GET /tests/:id` 404; learner trong lớp OK; start attempt ngoài cửa sổ 409.
4. Nộp bài → event → gradebook có band; nộp sau due → `late`.
5. Writing: AI feedback → `ai_band`; teacher review → `final_band`, learner result hiển thị nhận xét giáo viên; `result_policy=after_due` ẩn điểm trước hạn.
6. Xoá đề đang có assignment → 409; archive lớp → join 409.
7. Bảo mật: teacher A không đọc được lớp/bài của teacher B (404), không gọi được internal (403), learner không gọi được review (403).

### Manual / UI (testing agent)
Kịch bản end-to-end 3 vai trò trên 4 kỹ năng (L/R auto-grade, W/S AI + review), mobile viewport cho bảng điểm, dark mode.

### Non-functional
- Gradebook lớp 60 HS × 30 assignment < 500 ms (index + 1 query aggregate).
- Event consumer idempotent; retry 3 lần rồi vào DLQ `ielts.classroom.dlq`.

---

## 13. Rủi ro, edge cases & cách xử lý

| Tình huống | Xử lý |
|---|---|
| Mất event RabbitMQ → bảng điểm thiếu | Upsert idempotent + nút/scheduler `sync` kéo từ test-service internal; log cảnh báo |
| Học sinh vào lớp **sau** khi assignment đã giao | Thấy ngay nếu còn trong cửa sổ; `missing` chỉ tính với thành viên `active` tại thời điểm xem |
| Học sinh rời/bị xoá khỏi lớp | Submissions giữ lại (ẩn khỏi bảng điểm mặc định, có filter "đã rời"); không còn truy cập đề private |
| Đề bị sửa sau khi giao | `test_snapshot` giữ tiêu đề/kỹ năng; cấm đổi `skill`; cảnh báo giáo viên khi sửa đề có assignment |
| Đề bị xoá/archived | Chặn xoá khi có assignment (409); archived → assignment mới không chọn được, attempt cũ vẫn xem |
| Attempt đang làm thì giáo viên đổi `close_at` sớm hơn | `expires_at` của attempt đã tạo không đổi (công bằng); assignment detail cảnh báo |
| Learner tự start đề private không qua assignment | test-service kiểm tra access; không có assignment hợp lệ → 404 |
| Nhiều lần làm | `attempt_no`, `max_attempts`; gradebook hiển thị theo `grade_policy` (v1: lần cuối) |
| Hết giờ auto-submit sau `due_at` | Dùng `submitted_at` thực tế; nếu `expires_at <= due_at` thì không coi là late dù auto-submit chậm vài giây (grace 60s) |
| Teacher bị `suspended` | Login bị chặn như hiện tại; lớp tự động read-only cho học sinh (vẫn xem kết quả) |
| Teacher pending/rejected có lớp cũ (bị hạ cấp) | Lớp chuyển `archived`; admin có thể gán lại cho teacher khác (`PATCH /classes/:id {teacherId}`) |
| Đồng bộ role trên FE sau khi admin duyệt | FE gọi `GET /auth/profile` khi vào `/teacher`; JWT cũ vẫn hợp lệ, gateway dựa `teacherStatus` từ auth qua header → đơn giản hơn: classroom-service gọi auth internal `GET /internal/teachers/:id` (cache 60s) để kiểm tra `approved` thay vì tin JWT |
| Múi giờ | Lưu UTC, FE hiển thị local; form chọn giờ có nhãn múi giờ |
| Email trùng, Google login tạo learner cho giáo viên | Teacher đăng ký Google → vẫn learner; vào Hồ sơ → "Đăng ký làm giáo viên" (tạo teacher_profile pending) |
| Spam tạo lớp / join brute-force mã | Rate limit `POST /classes/join` (10/phút/user), mã 6 ký tự từ 32 ký tự ≈ 1 tỷ tổ hợp, đổi mã được |
| Dữ liệu cá nhân học sinh | Teacher chỉ thấy tên/avatar/email của thành viên lớp mình; export CSV chỉ chủ lớp |
| Conflict với PR #1 | Phase 1 branch tạo từ **sau khi merge PR#1**; không sửa lại file migration 001 |

---

## 14. Biến môi trường, deploy, tài liệu

| Nơi | Biến | Ghi chú |
|---|---|---|
| api-gateway | `CLASSROOM_SERVICE_URL=http://localhost:5005` | |
| test-service | `CLASSROOM_SERVICE_URL` | access/eligibility check |
| classroom-service | `PORT=5005`, `DATABASE_URL`/Supabase vars, `RABBITMQ_URL`, `INTERNAL_API_KEY`, `TEST_SERVICE_URL`, `SUBMISSION_SERVICE_URL`, `ANALYTICS_SERVICE_URL`, `AUTH_SERVICE_URL`, `CORS_ORIGIN` | |
| ielts-fe | không thêm biến (dùng gateway) | |

- `package.json` `start:all` thêm `classroom`; `docker-compose` (nếu có) thêm service; CI matrix thêm app.
- Cập nhật `docs/architecture.md`, `docs/database.md`, `docs/api-reference.md`, `docs/message-queue.md`
  (`RMQ_QUEUES.CLASSROOM`, pattern `classroom.*`), `docs/environment.md`, thêm `docs/classroom-service.md`.
- Swagger tag `Classroom`, `Teacher`.

---

## 15. Câu hỏi cần bạn chốt

1. **Duyệt giáo viên**: tự đăng ký + admin duyệt (đề xuất) hay chỉ admin tạo/nâng cấp tài khoản?
2. **Tài khoản vừa là học viên vừa là giáo viên?** Đề xuất v1: một role duy nhất; teacher xem thử đề nhưng không làm bài tính điểm.
3. **Giáo viên có được xem lịch sử làm bài của học sinh *ngoài* lớp** (bài tự luyện) không? Đề xuất: chỉ số tổng hợp (band hiện tại, xu hướng), không xem chi tiết bài ngoài lớp.
4. **Giáo viên có được override band Listening/Reading** (chấm máy) không? Đề xuất: không, chỉ Writing/Speaking.
5. **Chế độ nhiều lần làm**: lấy *lần cuối* (đề xuất v1) hay *cao nhất*?
6. **Tên hiển thị**: học sinh thấy email các bạn cùng lớp? Đề xuất: chỉ tên + avatar.
7. Phase 3 nên ưu tiên gì trước: thông báo/email, AI Insight cho giáo viên, hay mời qua email/CSV?
8. Ngôn ngữ UI cho vùng giáo viên: giữ tiếng Anh như UI hiện tại, hay tiếng Việt / song ngữ?
