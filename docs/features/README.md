# Feature plans

Thư mục này chứa kế hoạch chi tiết (plan) cho từng tính năng lớn của hệ thống IELTS Master,
được viết **trước khi code** để review và chốt phạm vi. Mỗi tính năng có một thư mục riêng.

| Tính năng | Trạng thái | Tài liệu |
|---|---|---|
| Vai trò Giáo viên & Lớp học (Teacher & Classroom) | Draft – chờ review | [teacher-classroom/PLAN.md](./teacher-classroom/PLAN.md) · [research.md](./teacher-classroom/research.md) |

## Quy ước

- `PLAN.md`: mục tiêu, phạm vi, mô hình dữ liệu, API, phân quyền, UI, lộ trình triển khai, test plan, rủi ro, câu hỏi mở.
- `research.md`: khảo sát các sản phẩm tương tự và bài học rút ra.
- Khi plan được duyệt, các quyết định được chuyển vào `docs/architecture.md`, `docs/database.md`,
  `docs/api-reference.md` và migration tương ứng trong `db/migrations/`.
