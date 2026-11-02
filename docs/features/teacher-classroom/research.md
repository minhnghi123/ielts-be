# Khảo sát: vai trò Giáo viên / Lớp học trên các nền tảng tương tự

Mục đích: xem các sản phẩm phổ biến giải quyết bài toán "giáo viên tạo lớp – giao đề – theo dõi học sinh"
như thế nào, để thiết kế tính năng cho IELTS Master **hợp lý, quen thuộc với người dùng** và không
phải "phát minh lại".

> Ghi chú về nguồn: nội dung dưới đây tổng hợp từ tài liệu trợ giúp công khai / trang giới thiệu của các
> sản phẩm (Google Classroom Help, Testportal, ClassMarker, Wayground/Quizizz Support, Moodle Docs,
> Edmodo – đã ngừng hoạt động 2022 nhưng mô hình vẫn là chuẩn tham chiếu) và kinh nghiệm sử dụng. Một số
> trang chặn crawler nên không trích dẫn nguyên văn.

## 1. Bảng so sánh nhanh

| Khả năng | Google Classroom | Quizizz / Wayground | Kahoot! | Testportal / ClassMarker | Moodle | IELTS Online Tests / STUDY4 | **Đề xuất cho IELTS Master** |
|---|---|---|---|---|---|---|---|
| Tạo lớp, mã tham gia (join code) | ✅ mã 6–7 ký tự, link mời | ✅ class code + link | ✅ groups (link) | ✅ nhóm "respondents" | ✅ enrolment key | ❌ (B2C, tự học) | ✅ mã 6 ký tự + link + QR |
| Mời học sinh bằng email / import | ✅ | ✅ import từ Google Classroom | ✅ | ✅ import CSV | ✅ CSV | ❌ | ✅ (Phase 3: mời email; CSV sau) |
| Giao bài (assignment) có hạn nộp | ✅ due date, "late" | ✅ assign với deadline | ✅ assign | ✅ cửa sổ mở/đóng | ✅ open/close | ❌ | ✅ open_at / due_at / close_at |
| Chế độ làm bài | – | Live vs Homework | Live vs Assigned | Thi nghiêm ngặt (time, camera) | Quiz settings | Practice vs Mock | ✅ `practice` / `mock` kế thừa attempt hiện có |
| Số lần làm bài | – | cấu hình | cấu hình | cấu hình | cấu hình | ∞ | ✅ `max_attempts` |
| Khi nào học sinh thấy điểm | Khi "return" | ngay / sau khi nộp | ngay | ngay / sau đóng / thủ công | cấu hình | ngay | ✅ `immediately` / `after_due` / `manual` |
| Gradebook (bảng điểm ma trận) | ✅ Grades tab | ✅ Reports | ✅ Reports | ✅ | ✅ Grader report | ❌ | ✅ học sinh × bài giao |
| Báo cáo theo câu hỏi (câu nào sai nhiều) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ Phase 2 |
| Giáo viên chấm / sửa điểm + feedback | ✅ grade & comment | ✅ manual grade | ❌ | ✅ open-ended | ✅ | ❌ (bán dịch vụ chấm) | ✅ override band Writing/Speaking + nhận xét |
| Thông báo / bảng tin lớp | ✅ Stream | ❌ | ❌ | ❌ | ✅ Forum | ❌ | ✅ Announcements (Phase 2) |
| Phân tích tiến bộ theo học sinh | ❌ (cơ bản) | ✅ | ✅ | ✅ | ✅ | ✅ cá nhân | ✅ tái sử dụng analytics-service hiện có |
| Cảnh báo học sinh "có nguy cơ" | ❌ | ❌ | ❌ | ❌ | ✅ plugin | ❌ | ✅ (điểm nổi bật) |
| Xuất CSV / Excel | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ Phase 2 |
| Đồng giáo viên (co-teacher) | ✅ | ✅ | ✅ | ✅ | ✅ | – | Phase 3 |
| Lưu trữ lớp (archive) | ✅ | ✅ | ✅ | ✅ | ✅ | – | ✅ |

## 2. Ghi chú theo sản phẩm

### Google Classroom
- Luồng chuẩn: *Teacher creates assignment → Students turn in → Teacher grades & returns → Students see grade & feedback → (optional) resubmit*.
- Tham gia lớp bằng **class code** hoặc được mời bằng email; mỗi lớp có **Stream** (thông báo), **Classwork**
  (bài tập), **People**, **Grades**.
- Có khái niệm **due date** và nhãn **Missing / Turned in late**; giáo viên có thể giao cho cả lớp hoặc một
  nhóm học sinh.
- Bài học: UI theo tab rất dễ hiểu; học sinh luôn biết "cần làm gì, hạn khi nào"; điểm chỉ hiển thị khi
  giáo viên "trả bài".

### Quizizz (nay là Wayground) / Kahoot!
- Lớp học (classes) + hai chế độ: chơi trực tiếp (live) và **giao về nhà (homework/assigned)** có deadline.
- Báo cáo rất mạnh: theo học sinh, theo câu hỏi (% trả lời đúng), xuất Excel; có cho phép **chỉnh điểm thủ
  công**.
- Có **chế độ tập trung / accommodations** (thêm thời gian cho học sinh cụ thể) – gợi ý cho IELTS Master:
  giáo viên có thể cấp thêm thời gian cho một học sinh trong bài giao.
- Bài học: báo cáo theo câu hỏi là thứ giáo viên IELTS cần nhất để biết dạng câu hỏi nào lớp yếu (TFNG,
  Matching Headings…).

### Testportal / ClassMarker / Exam.net (nền tảng thi)
- Tổ chức theo **nhóm người làm bài** + **link/mã truy cập bài thi**; cấu hình chặt: cửa sổ thời gian, số lần
  làm, xáo câu hỏi, chống gian lận (full-screen, chuyển tab).
- Cho phép chọn **khi nào công bố kết quả** và có **chấm câu tự luận thủ công**.
- Bài học: mô hình "bài giao = đề + nhóm + cấu hình thi" là mô hình chúng ta nên dùng; các cài đặt chống gian
  lận nhẹ (phát hiện chuyển tab, cảnh báo) hợp với chế độ `mock`.

### Moodle (LMS)
- **Grader report**: ma trận học sinh × hoạt động, có tổng điểm, bộ lọc, xuất CSV/Excel; **Gradebook
  setup** cho phép gộp/trọng số.
- Có **Completion tracking** và **Learning analytics** (cảnh báo học sinh có nguy cơ bỏ học).
- Bài học: gradebook ma trận + xuất CSV là tiêu chuẩn; cảnh báo nguy cơ là điểm cộng lớn cho luận văn
  (cá nhân hoá + hỗ trợ giáo viên).

### Edmodo (đã dừng 2022)
- Mạng xã hội học tập: lớp (group) + bài tập + quiz + thư viện tài liệu + **Snapshot** (đánh giá chuẩn đầu ra,
  theo dõi tiến bộ) + báo cáo cho phụ huynh.
- Bài học: tab "Materials" (tài liệu/đường link của giáo viên) rất hữu ích cho lớp IELTS; "Snapshot" ≈
  bài kiểm tra đầu vào/định kỳ – ta có thể dùng mock test định kỳ làm mốc tiến bộ.

### Các nền tảng IELTS (IELTS Online Tests, STUDY4, Prep…)
- Chủ yếu B2C: ngân hàng đề, chấm AI, thống kê cá nhân, bán dịch vụ chấm bởi giáo viên thật.
- Hầu như **không có mô hình lớp học cho giáo viên độc lập/trung tâm** → đây là khoảng trống mà IELTS
  Master có thể lấp: *AI chấm trước – giáo viên duyệt/điều chỉnh sau* (human-in-the-loop), và dùng chính
  điểm giáo viên để **đánh giá độ chính xác của LLM** (phần thực nghiệm trong đề cương).

## 3. Kết luận thiết kế rút ra

1. **Mô hình quen thuộc**: Lớp → Học sinh (join code) → Bài giao (đề + hạn + cấu hình) → Bảng điểm →
   Phân tích. Dùng tab như Google Classroom: *Bảng tin · Bài giao · Học sinh · Bảng điểm · Phân tích · Cài đặt*.
2. **Tái sử dụng tối đa**: đề thi, attempt (timer/autosave/auto-submit), chấm AI, analytics đã có. Lớp học chỉ
   là "lớp bao" (wrapper) gắn ngữ cảnh *ai giao – cho ai – đến khi nào*.
3. **Điểm khác biệt** so với đối thủ (phù hợp đề cương luận văn):
   - Giáo viên **review & override điểm AI** cho Writing/Speaking kèm nhận xét → học sinh thấy cả hai.
   - Mỗi lần override tạo một cặp (AI band, teacher band) → dataset để tính **MAE / QWK** cho chương thực nghiệm.
   - **Cảnh báo học sinh có nguy cơ** (bỏ bài, band tụt, dưới target) và **gợi ý can thiệp** do AI tóm tắt.
   - Phân tích theo **dạng câu hỏi IELTS** (TFNG, Matching Headings, Map labelling…) cho cả lớp.
4. **Không làm** (ngoài phạm vi): video call/live class, chat realtime, thanh toán, phụ huynh, LTI/SSO trường.
