// API cho học viên: dữ liệu trang chủ, trang khóa học, học bài, bài kiểm tra, tài khoản, chứng nhận.
import { Router } from "express";
import {
  bestScores, completedLessonIds, completeLesson, enrolledCourseIds, getCourse, getDb, listCourses,
  quizStatus, startLesson, startQuiz, submitQuiz, userCertificates, viewStart,
} from "../lib/db";
import { currentTokenHash, me, rateLimited, requireUser } from "../lib/auth";
import { canAccess, courseOfLesson, courseOfQuizSession } from "../lib/access";
import { hashPassword, normalizePhone, passwordProblem, verifyPassword } from "../lib/crypto";

const r = Router();
r.use(requireUser);
const key = (id: number) => String(id); // khóa học viên trong bảng tiến độ

// ---------- Trang chủ ----------
r.get("/home", (req, res) => {
  const user = me(req);
  const enrolled = enrolledCourseIds(user.id);
  const done = completedLessonIds(key(user.id));
  const scores = bestScores(key(user.id));
  const courses = listCourses()
    .filter((c) => user.role === "admin" || enrolled.has(c.id))
    .map((c) => {
      const lessons = getCourse(c.id)!.lessons;
      const completed = lessons.filter((l) => done.has(l.id)).length;
      const videos = lessons.filter((l) => l.kind === "video").length;
      return {
        course: c,
        completed,
        total: lessons.length,
        videos,
        readings: lessons.length - videos,
        pct: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
        score: scores.get(c.id) ?? null,
      };
    });
  res.json({ user, courses, certificates: userCertificates(user.id).length });
});

// ---------- Trang khóa học ----------
r.get("/courses/:id", (req, res) => {
  const user = me(req);
  const data = getCourse(Number(req.params.id));
  if (!data || !canAccess(user, data.course.id)) return res.status(404).json({ error: "Không tìm thấy khóa học." });
  const k = key(user.id);
  const cert = getDb().prepare("SELECT code FROM certificates WHERE user_id = ? AND course_id = ?").get(user.id, data.course.id) as { code: string } | undefined;
  res.json({
    course: data.course,
    lessons: data.lessons,
    done: [...completedLessonIds(k)],
    quiz: {
      size: Math.min(data.course.quiz_size, data.questions.length),
      bank: data.questions.length,
      certificate: cert?.code ?? null,
      ...quizStatus(k, data.course.id),
    },
  });
});

// Học viên mở một bài: ghi nhận thời điểm bắt đầu (và thời lượng video) phía máy chủ.
r.post("/lesson", (req, res) => {
  const { courseId, lessonId, duration } = req.body ?? {};
  const user = me(req);
  if (!canAccess(user, Number(courseId))) return res.status(403).json({ error: "Bạn chưa được ghi danh vào khóa học này." });
  const data = getCourse(Number(courseId));
  const lesson = data?.lessons.find((l) => l.id === Number(lessonId));
  if (!data || !lesson) return res.status(404).json({ error: "Không tìm thấy bài học" });
  const done = completedLessonIds(key(user.id));
  if (data.lessons.some((l) => l.position < lesson.position && !done.has(l.id)))
    return res.status(403).json({ error: "Bài học này đang bị khóa. Hãy hoàn thành các bài trước." });
  startLesson(key(user.id), lesson.id, Number(duration) || 0);
  res.json({ startedMs: viewStart(key(user.id), lesson.id), now: Date.now() });
});

// Hoàn thành bài: máy chủ kiểm tra thứ tự, thời gian, % video đã xem.
r.post("/progress", (req, res) => {
  const { lessonId, watched } = req.body ?? {};
  const user = me(req);
  const courseId = courseOfLesson(Number(lessonId));
  if (courseId == null || !canAccess(user, courseId)) return res.status(403).json({ error: "Bạn chưa được ghi danh vào khóa học này." });
  const err = completeLesson(key(user.id), Number(lessonId), Number(watched) || 0);
  if (err) return res.status(400).json({ error: err });
  res.json({ ok: true });
});

// GET: tạo lượt thi mới (câu hỏi rút ngẫu nhiên, đáp án xáo trộn, không kèm đáp án đúng).
r.get("/quiz", (req, res) => {
  const courseId = Number(req.query.courseId);
  const user = me(req);
  if (!canAccess(user, courseId)) return res.status(403).json({ error: "Bạn chưa được ghi danh vào khóa học này." });
  const q = startQuiz(key(user.id), courseId);
  if ("error" in q) return res.status(403).json(q);
  res.json(q);
});

// POST: nộp bài, chấm phía máy chủ. Đạt lần đầu thì cấp chứng nhận.
r.post("/quiz", (req, res) => {
  const { sessionId, answers } = req.body ?? {};
  const user = me(req);
  const courseId = courseOfQuizSession(String(sessionId));
  if (courseId == null || !canAccess(user, courseId)) return res.status(403).json({ error: "Không tìm thấy lượt thi" });
  const out = submitQuiz(key(user.id), String(sessionId), ((answers ?? []) as unknown[]).map((x) => (x == null ? -1 : Number(x))));
  if ("error" in out) return res.status(400).json(out);
  res.json(out);
});

// ---------- Chứng nhận ----------
r.get("/certificates", (req, res) => {
  const user = me(req);
  const certs = userCertificates(user.id);
  const done = completedLessonIds(key(user.id));
  const has = new Set(certs.map((c) => c.course_id));
  const enrolled = enrolledCourseIds(user.id);
  const pending = listCourses()
    .filter((c) => enrolled.has(c.id) && !has.has(c.id))
    .map((c) => ({ id: c.id, title: c.title, left: getCourse(c.id)!.lessons.filter((l) => !done.has(l.id)).length }));
  res.json({ certificates: certs, pending });
});

// ---------- Tài khoản ----------
r.get("/account", (req, res) => {
  const user = me(req);
  const k = key(user.id);
  const db = getDb();
  const enrolled = enrolledCourseIds(user.id);
  const done = completedLessonIds(k);
  const scores = bestScores(k);
  const certs = new Map(userCertificates(user.id).map((c) => [c.course_id, c]));
  const enrolledAt = new Map(
    (db.prepare("SELECT course_id, enrolled_at FROM enrollments WHERE user_id = ?").all(user.id) as { course_id: number; enrolled_at: string }[]).map((x) => [x.course_id, x.enrolled_at])
  );
  const sessions = (db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_ms > ?").get(user.id, Date.now()) as { n: number }).n;
  const history = listCourses()
    .filter((c) => enrolled.has(c.id))
    .map((c) => {
      const ls = getCourse(c.id)!.lessons;
      const n = ls.filter((l) => done.has(l.id)).length;
      const cert = certs.get(c.id);
      return {
        id: c.id,
        title: c.title,
        enrolledAt: enrolledAt.get(c.id) ?? null,
        pct: ls.length ? Math.round((n / ls.length) * 100) : 0,
        score: scores.get(c.id) ?? null,
        certificate: cert ? { code: cert.code, score: cert.score, total: cert.total } : null,
      };
    });
  res.json({ user, sessions, history });
});

r.patch("/account", (req, res) => {
  const u = me(req);
  const b = req.body ?? {};
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: "Họ và tên không được để trống." });
  const raw = String(b.phone ?? "").trim();
  const phone = raw ? normalizePhone(raw) : "";
  if (phone === null) return res.status(400).json({ error: "Số điện thoại không đúng. Nhập 10 số, ví dụ 0901234567." });
  if (!phone && !u.email) return res.status(400).json({ error: "Tài khoản của bạn đăng nhập bằng số điện thoại nên không thể để trống." });
  const db = getDb();
  if (phone && db.prepare("SELECT 1 FROM users WHERE phone = ? AND id != ?").get(phone, u.id))
    return res.status(409).json({ error: "Số điện thoại này đã thuộc về tài khoản khác." });
  db.prepare("UPDATE users SET name = ?, cert_name = ?, phone = ?, department = ? WHERE id = ?")
    .run(name, String(b.cert_name || name).trim().toUpperCase().slice(0, 80), phone, String(b.department ?? "").slice(0, 80), u.id);
  res.json({ ok: true });
});

r.post("/account/password", (req, res) => {
  const u = me(req);
  const { current, next } = req.body ?? {};
  const db = getDb();
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(u.id) as { password_hash: string };
  if (!verifyPassword(String(current ?? ""), row.password_hash)) return res.status(400).json({ error: "Mật khẩu hiện tại không đúng." });
  const prob = passwordProblem(String(next ?? ""));
  if (prob) return res.status(400).json({ error: prob });
  db.prepare("UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?").run(hashPassword(next), u.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(u.id, currentTokenHash(req));
  res.json({ ok: true });
});

// Đăng xuất tất cả thiết bị khác.
r.delete("/account/sessions", (req, res) => {
  const out = getDb().prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(me(req).id, currentTokenHash(req));
  res.json({ ok: true, removed: Number(out.changes) });
});

// Học viên đã có tài khoản nhập thêm mã kích hoạt để mở khóa học mới.
r.post("/account/redeem", (req, res) => {
  const u = me(req);
  if (rateLimited(`redeem:${u.id}`)) return res.status(429).json({ error: "Thử quá nhiều lần. Vui lòng đợi 15 phút." });
  const code = String(req.body?.code ?? "").trim().toUpperCase();
  const db = getDb();
  const c = db.prepare("SELECT * FROM activation_codes WHERE code = ?").get(code) as
    | { code: string; company_id: number; course_ids: string; max_uses: number; used: number; expires_at: string | null; active: number }
    | undefined;
  if (!c || !c.active) return res.status(400).json({ error: "Mã kích hoạt không đúng hoặc đã bị khóa." });
  if (c.expires_at && new Date(c.expires_at + "T23:59:59") < new Date()) return res.status(400).json({ error: "Mã kích hoạt đã hết hạn." });
  if (c.used >= c.max_uses) return res.status(400).json({ error: "Mã kích hoạt đã dùng hết số lượt." });
  const before = (db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE user_id = ?").get(u.id) as { n: number }).n;
  for (const id of JSON.parse(c.course_ids) as number[])
    db.prepare("INSERT OR IGNORE INTO enrollments (user_id, course_id, code) VALUES (?, ?, ?)").run(u.id, id, c.code);
  const added = (db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE user_id = ?").get(u.id) as { n: number }).n - before;
  if (added === 0) return res.status(400).json({ error: "Bạn đã có tất cả khóa học của mã này." });
  db.prepare("UPDATE activation_codes SET used = used + 1 WHERE code = ?").run(c.code);
  if (!u.company_id) db.prepare("UPDATE users SET company_id = ? WHERE id = ?").run(c.company_id, u.id);
  res.json({ ok: true, added });
});

export default r;
