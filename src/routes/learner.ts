// API cho học viên: dữ liệu trang chủ, trang khóa học, học bài, bài kiểm tra, tài khoản, chứng nhận.
import { Router } from "express";
import {
  bestScores, completedLessonIds, completeLesson, enrolledCourseIds, exec, getCourse, listCourses, NOW, one,
  quizStatus, rows, beatLesson, startLesson, startQuiz, submitQuiz, tx, userCertificates,
} from "../lib/db";
import { currentTokenHash, me, rateLimited, requireUser } from "../lib/auth";
import { canAccess, courseOfLesson, courseOfQuizSession } from "../lib/access";
import { hashPassword, normalizePhone, passwordProblem, verifyPassword } from "../lib/crypto";

const r = Router();
r.use(requireUser);
const key = (id: number) => String(id); // khóa học viên trong bảng tiến độ

// ---------- Trang chủ ----------
r.get("/home", async (req, res) => {
  const user = me(req);
  const enrolled = await enrolledCourseIds(user.id);
  const done = await completedLessonIds(key(user.id));
  const scores = await bestScores(key(user.id));
  const courses = await Promise.all(
    (await listCourses())
      .filter((c) => user.role === "admin" || enrolled.has(c.id))
      .map(async (c) => {
        const lessons = (await getCourse(c.id))!.lessons;
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
      })
  );
  res.json({ user, courses, certificates: (await userCertificates(user.id)).length });
});

// ---------- Trang khóa học ----------
r.get("/courses/:id", async (req, res) => {
  const user = me(req);
  const data = await getCourse(Number(req.params.id));
  if (!data || !(await canAccess(user, data.course.id))) return res.status(404).json({ error: "Không tìm thấy khóa học." });
  const k = key(user.id);
  const cert = await one<{ code: string }>("SELECT code FROM certificates WHERE user_id = $1 AND course_id = $2", [user.id, data.course.id]);
  res.json({
    course: data.course,
    lessons: data.lessons,
    done: [...(await completedLessonIds(k))],
    quiz: {
      size: Math.min(data.course.quiz_size, data.questions.length),
      bank: data.questions.length,
      certificate: cert?.code ?? null,
      ...(await quizStatus(k, data.course.id)),
    },
  });
});

// Học viên mở một bài: ghi nhận thời điểm bắt đầu (và thời lượng video), trả về tiến độ đã lưu để học tiếp.
r.post("/lesson", async (req, res) => {
  const { courseId, lessonId, duration } = req.body ?? {};
  const user = me(req);
  if (!(await canAccess(user, Number(courseId)))) return res.status(403).json({ error: "Bạn chưa được ghi danh vào khóa học này." });
  const data = await getCourse(Number(courseId));
  const lesson = data?.lessons.find((l) => l.id === Number(lessonId));
  if (!data || !lesson) return res.status(404).json({ error: "Không tìm thấy bài học" });
  const done = await completedLessonIds(key(user.id));
  if (data.lessons.some((l) => l.position < lesson.position && !done.has(l.id)))
    return res.status(403).json({ error: "Bài học này đang bị khóa. Hãy hoàn thành các bài trước." });
  res.json(await startLesson(key(user.id), lesson.id, Number(duration) || 0));
});

// Nhịp báo đang học (khoảng 10 giây/lần): { lessonId, sec, pos, end } → tiến độ mới.
r.post("/lesson/beat", async (req, res) => {
  const b = req.body ?? {};
  const user = me(req);
  const courseId = await courseOfLesson(Number(b.lessonId));
  if (courseId == null || !(await canAccess(user, courseId))) return res.status(403).json({ error: "Bạn chưa được ghi danh vào khóa học này." });
  const view = await beatLesson(key(user.id), Number(b.lessonId), b);
  if (!view) return res.status(404).json({ error: "Bạn chưa mở bài học này." });
  res.json(view);
});

// Hoàn thành bài: máy chủ kiểm tra thứ tự, thời gian đọc, % video đã xem (kèm nhịp cuối cùng).
r.post("/progress", async (req, res) => {
  const b = req.body ?? {};
  const user = me(req);
  const courseId = await courseOfLesson(Number(b.lessonId));
  if (courseId == null || !(await canAccess(user, courseId))) return res.status(403).json({ error: "Bạn chưa được ghi danh vào khóa học này." });
  const err = await completeLesson(key(user.id), Number(b.lessonId), { sec: b.sec, pos: b.pos ?? b.watched, end: b.end });
  if (err) return res.status(400).json({ error: err });
  res.json({ ok: true });
});

// GET: tạo lượt thi mới (câu hỏi rút ngẫu nhiên, đáp án xáo trộn, không kèm đáp án đúng).
r.get("/quiz", async (req, res) => {
  const courseId = Number(req.query.courseId);
  const user = me(req);
  if (!(await canAccess(user, courseId))) return res.status(403).json({ error: "Bạn chưa được ghi danh vào khóa học này." });
  const q = await startQuiz(key(user.id), courseId);
  if ("error" in q) return res.status(403).json(q);
  res.json(q);
});

// POST: nộp bài, chấm phía máy chủ. Đạt lần đầu thì cấp chứng nhận.
r.post("/quiz", async (req, res) => {
  const { sessionId, answers } = req.body ?? {};
  const user = me(req);
  const courseId = await courseOfQuizSession(String(sessionId));
  if (courseId == null || !(await canAccess(user, courseId))) return res.status(403).json({ error: "Không tìm thấy lượt thi" });
  const out = await submitQuiz(key(user.id), String(sessionId), ((answers ?? []) as unknown[]).map((x) => (x == null ? -1 : Number(x))));
  if ("error" in out) return res.status(400).json(out);
  res.json(out);
});

// ---------- Chứng nhận ----------
r.get("/certificates", async (req, res) => {
  const user = me(req);
  const certs = await userCertificates(user.id);
  const done = await completedLessonIds(key(user.id));
  const has = new Set(certs.map((c) => c.course_id));
  const enrolled = await enrolledCourseIds(user.id);
  const pending = await Promise.all(
    (await listCourses())
      .filter((c) => enrolled.has(c.id) && !has.has(c.id))
      .map(async (c) => ({ id: c.id, title: c.title, left: (await getCourse(c.id))!.lessons.filter((l) => !done.has(l.id)).length }))
  );
  res.json({ certificates: certs, pending });
});

// ---------- Tài khoản ----------
r.get("/account", async (req, res) => {
  const user = me(req);
  const k = key(user.id);
  const enrolled = await enrolledCourseIds(user.id);
  const done = await completedLessonIds(k);
  const scores = await bestScores(k);
  const certs = new Map((await userCertificates(user.id)).map((c) => [c.course_id, c]));
  const enrolledAt = new Map(
    (await rows<{ course_id: number; enrolled_at: string }>("SELECT course_id, enrolled_at FROM enrollments WHERE user_id = $1", [user.id])).map((x) => [x.course_id, x.enrolled_at])
  );
  const sessions = (await one<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE user_id = $1 AND expires_ms > $2", [user.id, Date.now()]))!.n;
  const history = await Promise.all(
    (await listCourses())
      .filter((c) => enrolled.has(c.id))
      .map(async (c) => {
        const ls = (await getCourse(c.id))!.lessons;
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
      })
  );
  res.json({ user, sessions, history });
});

r.patch("/account", async (req, res) => {
  const u = me(req);
  const b = req.body ?? {};
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: "Họ và tên không được để trống." });
  const raw = String(b.phone ?? "").trim();
  const phone = raw ? normalizePhone(raw) : "";
  if (phone === null) return res.status(400).json({ error: "Số điện thoại không đúng. Nhập 10 số, ví dụ 0901234567." });
  if (!phone && !u.email) return res.status(400).json({ error: "Tài khoản của bạn đăng nhập bằng số điện thoại nên không thể để trống." });
  if (phone && (await one("SELECT 1 FROM users WHERE phone = $1 AND id <> $2", [phone, u.id])))
    return res.status(409).json({ error: "Số điện thoại này đã thuộc về tài khoản khác." });
  await exec("UPDATE users SET name = $1, cert_name = $2, phone = $3, department = $4 WHERE id = $5", [
    name, String(b.cert_name || name).trim().toUpperCase().slice(0, 80), phone, String(b.department ?? "").slice(0, 80), u.id,
  ]);
  res.json({ ok: true });
});

r.post("/account/password", async (req, res) => {
  const u = me(req);
  const { current, next } = req.body ?? {};
  const row = (await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [u.id]))!;
  if (!verifyPassword(String(current ?? ""), row.password_hash)) return res.status(400).json({ error: "Mật khẩu hiện tại không đúng." });
  const prob = passwordProblem(String(next ?? ""));
  if (prob) return res.status(400).json({ error: prob });
  await tx(async (db) => {
    await exec(`UPDATE users SET password_hash = $1, password_changed_at = ${NOW} WHERE id = $2`, [hashPassword(next), u.id], db);
    await exec("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [u.id, currentTokenHash(req)], db);
  });
  res.json({ ok: true });
});

// Đăng xuất tất cả thiết bị khác.
r.delete("/account/sessions", async (req, res) => {
  const removed = await exec("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [me(req).id, currentTokenHash(req)]);
  res.json({ ok: true, removed });
});

// Lỗi nghiệp vụ khi nhập mã: hủy giao dịch (bỏ các ghi danh vừa thêm) rồi báo cho học viên.
class Redeem extends Error {}

// Học viên đã có tài khoản nhập thêm mã kích hoạt để mở khóa học mới.
r.post("/account/redeem", async (req, res) => {
  const u = me(req);
  if (rateLimited(`redeem:${u.id}`)) return res.status(429).json({ error: "Thử quá nhiều lần. Vui lòng đợi 15 phút." });
  const code = String(req.body?.code ?? "").trim().toUpperCase();
  const c = await one<{ code: string; company_id: number; course_ids: number[]; max_uses: number; used: number; expires_at: string | null; active: number }>(
    "SELECT * FROM activation_codes WHERE code = $1",
    [code]
  );
  if (!c || !c.active) return res.status(400).json({ error: "Mã kích hoạt không đúng hoặc đã bị khóa." });
  if (c.expires_at && new Date(c.expires_at + "T23:59:59") < new Date()) return res.status(400).json({ error: "Mã kích hoạt đã hết hạn." });
  if (c.used >= c.max_uses) return res.status(400).json({ error: "Mã kích hoạt đã dùng hết số lượt." });
  const out = await tx(async (db) => {
    let added = 0;
    for (const id of c.course_ids)
      added += await exec("INSERT INTO enrollments (user_id, course_id, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [u.id, id, c.code], db);
    if (added === 0) throw new Redeem("Bạn đã có tất cả khóa học của mã này.");
    if (!(await exec("UPDATE activation_codes SET used = used + 1 WHERE code = $1 AND used < max_uses", [c.code], db)))
      throw new Redeem("Mã kích hoạt đã dùng hết số lượt.");
    if (!u.company_id) await exec("UPDATE users SET company_id = $1 WHERE id = $2", [c.company_id, u.id], db);
    return added;
  }).catch((e) => (e instanceof Redeem ? e : Promise.reject(e)));
  if (out instanceof Redeem) return res.status(400).json({ error: out.message });
  res.json({ ok: true, added: out });
});

export default r;
