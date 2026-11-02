# classroom-service (port 5005)

Owns teacher classes, membership, assignments, the gradebook read model and class posts.
Routes are reached through the gateway as `/api/classes/**` and `/api/teacher/**`.

| Method & path | Roles | Notes |
|---|---|---|
| `GET /teacher/dashboard` | teacher, admin | totals + classes + due-soon |
| `POST /classes` | teacher (approved), admin (`teacherId` in body) | generates a 6-char join code |
| `GET /classes` | learner (joined), teacher (own), admin (all) | `status`, `search`, `teacherId`, paging |
| `GET /classes/my-assignments` | learner | upcoming work across classes |
| `POST /classes/join` `{code}` | learner | `open` → active, `approval` → pending |
| `GET/PATCH /classes/:id` | members / owner | learners never receive `joinCode` |
| `POST /classes/:id/join-code/rotate` | owner | |
| `DELETE /classes/:id` | admin | archived classes without submissions only |
| `GET /classes/:id/members?status=` | owner (all) / learner (active, names only) | |
| `PATCH /classes/:id/members/:learnerId` | owner | approve (`active`) / `removed` / note |
| `POST /classes/:id/leave` | learner | |
| `GET /classes/:id/students/:learnerId/progress` | owner | analytics + in-class submissions |
| `POST/GET /classes/:id/assignments` | owner / members | learner rows include `mySubmission` |
| `GET/PATCH/DELETE /classes/:id/assignments/:aid` | owner / members | delete blocked once students started |
| `POST …/assignments/:aid/release` | owner | manual result policy |
| `POST …/assignments/:aid/sync` | owner | rebuild submissions from test-service |
| `GET …/assignments/:aid/submissions` | owner | per student incl. `missing` |
| `GET /classes/:id/gradebook[.csv]?skill=` | owner | students × assignments matrix |
| `GET /classes/:id/submissions/:sid` | owner, owning learner | learner sees scores only when `resultsVisible` |
| `PUT /classes/:id/submissions/:sid/review` | owner | Writing/Speaking band override + rubric + feedback |
| `GET/POST/PATCH/DELETE /classes/:id/posts[/:pid]` | members / owner | announcements & materials |
| `GET /internal/access`, `/internal/assignments/count`, `/internal/assignments/:aid/eligibility` | system | called by test-service |

Events consumed from `ielts.classroom`: `classroom.attempt.submitted`, `classroom.attempt.graded`.
Pure rules (status derivation, eligibility, late mapping, result visibility) live in `classroom.rules.ts`
and are unit-tested in `classroom.rules.spec.ts`.
