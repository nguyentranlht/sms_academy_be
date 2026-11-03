// Các hàm dữ liệu cho trang quản trị: soạn khóa học, công ty, mã kích hoạt, báo cáo.
import { exec, getCourse, NOW, one, readingSeconds, rows, tx } from "./db";
import { randomCode } from "./crypto";

// ---------- Soạn khóa học ----------
export type LessonInput = {
  id?: number;
  kind: "video" | "reading";
  title: string;
  youtubeId: string;
  content: string;
  body: string;
  minSeconds: number; // 0 = tự tính theo số chữ
};
export type QuestionInput = { id?: number; question: string; options: string[]; answer: number; explanation: string };
export type CourseInput = {
  title: string;
  category: string;
  level: string;
  description: string;
  quizSize: number;
  maxAttempts: number;
  lessons: LessonInput[];
  questions: QuestionInput[];
};

/** Lấy mã video YouTube từ link đầy đủ (youtu.be/…, watch?v=…, embed/…) hoặc mã 11 ký tự. */
export function youtubeIdFrom(s: string): string | null {
  const t = s.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** Kiểm tra dữ liệu khóa học. Trả về thông báo lỗi tiếng Việt hoặc null. */
export function courseProblem(c: CourseInput): string | null {
  if (!c.title?.trim()) return "Khóa học cần có tên.";
  if (!c.category?.trim()) return "Khóa học cần có nhóm (ví dụ: An toàn thực phẩm).";
  if (!Array.isArray(c.lessons) || c.lessons.length === 0) return "Khóa học cần ít nhất 1 bài học.";
  for (const [i, l] of c.lessons.entries()) {
    const n = `Bài ${i + 1}`;
    if (!l.title?.trim()) return `${n}: thiếu tên bài.`;
    if (l.kind === "video" && !youtubeIdFrom(l.youtubeId || "")) return `${n}: link hoặc mã video YouTube không hợp lệ.`;
    if (l.kind === "reading" && (l.body || "").trim().split(/\s+/).length < 20) return `${n}: tài liệu đọc quá ngắn (cần ít nhất 20 chữ).`;
  }
  if (!Array.isArray(c.questions) || c.questions.length === 0) return "Cần ít nhất 1 câu hỏi trong ngân hàng câu hỏi.";
  for (const [i, q] of c.questions.entries()) {
    const n = `Câu hỏi ${i + 1}`;
    if (!q.question?.trim()) return `${n}: thiếu nội dung câu hỏi.`;
    const opts = (q.options || []).map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) return `${n}: cần ít nhất 2 đáp án.`;
    if (!(q.answer >= 0 && q.answer < q.options.length) || !q.options[q.answer]?.trim()) return `${n}: hãy chọn đáp án đúng.`;
  }
  if (!(c.quizSize >= 1)) return "Số câu mỗi lượt thi phải từ 1 trở lên.";
  if (c.quizSize > c.questions.length) return `Số câu mỗi lượt thi (${c.quizSize}) lớn hơn số câu trong ngân hàng (${c.questions.length}).`;
  if (!(c.maxAttempts >= 1 && c.maxAttempts <= 10)) return "Số lượt thi tối đa phải từ 1 đến 10.";
  return null;
}

function clean(c: CourseInput) {
  return {
    ...c,
    lessons: c.lessons.map((l) => ({
      ...l,
      youtubeId: l.kind === "video" ? youtubeIdFrom(l.youtubeId)! : "",
      body: l.kind === "reading" ? l.body.trim() : "",
      minSeconds: l.kind === "reading" ? (Number(l.minSeconds) > 0 ? Math.round(Number(l.minSeconds)) : readingSeconds(l.body)) : 0,
    })),
    questions: c.questions.map((q) => {
      // Bỏ đáp án trống, giữ đúng vị trí đáp án đúng.
      const keep = q.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
      return { ...q, options: keep.map((x) => x.o), answer: keep.findIndex((x) => x.i === q.answer) };
    }),
  };
}

/**
 * Tạo mới (id = null) hoặc cập nhật khóa học. Bài học và câu hỏi giữ nguyên id khi sửa,
 * nên tiến độ của học viên ở các bài cũ không bị mất.
 */
export function saveCourse(id: number | null, input: CourseInput): Promise<number> {
  const c = clean(input);
  return tx(async (db) => {
    let courseId = id;
    const head = [c.title.trim(), c.category.trim(), c.level.trim(), c.description.trim(), c.quizSize, c.maxAttempts];
    if (courseId == null) {
      courseId = (await one<{ id: number }>(
        "INSERT INTO courses (title, category, level, description, quiz_size, max_attempts) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        head,
        db
      ))!.id;
    } else {
      await exec("UPDATE courses SET title = $1, category = $2, level = $3, description = $4, quiz_size = $5, max_attempts = $6 WHERE id = $7", [...head, courseId], db);
    }
    const old = (await getCourse(courseId, db))!;
    const oldL = new Set(old.lessons.map((l) => l.id));
    const keepL = new Set<number>();
    for (const [i, l] of c.lessons.entries()) {
      if (l.id && oldL.has(l.id)) {
        keepL.add(l.id);
        await exec("UPDATE lessons SET position = $1, kind = $2, title = $3, youtube_id = $4, content = $5, body = $6, min_seconds = $7 WHERE id = $8", [
          i + 1, l.kind, l.title.trim(), l.youtubeId, l.content.trim(), l.body, l.minSeconds, l.id,
        ], db);
      } else {
        await exec("INSERT INTO lessons (course_id, position, kind, title, youtube_id, content, body, min_seconds) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [
          courseId, i + 1, l.kind, l.title.trim(), l.youtubeId, l.content.trim(), l.body, l.minSeconds,
        ], db);
      }
    }
    for (const lid of oldL) if (!keepL.has(lid)) await exec("DELETE FROM lessons WHERE id = $1", [lid], db);

    const oldQ = new Set(old.questions.map((q) => q.id));
    const keepQ = new Set<number>();
    for (const q of c.questions) {
      if (q.id && oldQ.has(q.id)) {
        keepQ.add(q.id);
        await exec("UPDATE questions SET question = $1, options = $2, answer_index = $3, explanation = $4 WHERE id = $5", [
          q.question.trim(), JSON.stringify(q.options), q.answer, q.explanation.trim(), q.id,
        ], db);
      } else {
        await exec("INSERT INTO questions (course_id, question, options, answer_index, explanation) VALUES ($1, $2, $3, $4, $5)", [
          courseId, q.question.trim(), JSON.stringify(q.options), q.answer, q.explanation.trim(),
        ], db);
      }
    }
    for (const qid of oldQ) if (!keepQ.has(qid)) await exec("DELETE FROM questions WHERE id = $1", [qid], db);
    return courseId;
  });
}

// ---------- Tổng quan ----------
export async function dashboardStats() {
  const count = async (sql: string) => (await one<{ n: number }>(sql))!.n;
  const pass = (await one<{ n: number; p: number | null }>("SELECT COUNT(*) AS n, SUM(passed) AS p FROM quiz_attempts"))!;
  return {
    learners: await count("SELECT COUNT(*) AS n FROM users WHERE role = 'learner'"),
    active7: await count(
      `SELECT COUNT(DISTINCT learner) AS n FROM (
         SELECT learner FROM progress WHERE completed_at >= ${NOW} - interval '7 days'
         UNION SELECT learner FROM quiz_attempts WHERE created_at >= ${NOW} - interval '7 days') AS x`
    ),
    certificates: await count("SELECT COUNT(*) AS n FROM certificates"),
    companies: await count("SELECT COUNT(*) AS n FROM companies"),
    passRate: pass.n ? Math.round(((pass.p ?? 0) / pass.n) * 100) : null,
  };
}

/** Thống kê từng khóa: số học viên ghi danh, đang học, đã đạt. */
export function courseStats() {
  return rows<{ id: number; title: string; category: string; lessons: number; questions: number; enrolled: number; started: number; certified: number }>(
    `SELECT c.id, c.title, c.category,
       (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lessons,
       (SELECT COUNT(*) FROM questions q WHERE q.course_id = c.id) AS questions,
       (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrolled,
       (SELECT COUNT(DISTINCT p.learner) FROM progress p JOIN lessons l ON l.id = p.lesson_id WHERE l.course_id = c.id) AS started,
       (SELECT COUNT(*) FROM certificates x WHERE x.course_id = c.id) AS certified
     FROM courses c ORDER BY c.id`
  );
}

// ---------- Báo cáo học viên ----------
export type ReportRow = {
  user_id: number; name: string; email: string | null; phone: string; department: string; company: string;
  course_id: number; course: string; lessons_total: number; lessons_done: number;
  attempts: number; best_score: number | null; best_total: number | null;
  cert_code: string | null; cert_date: string | null; enrolled_at: string; last_activity: string | null;
};

/** Mỗi dòng = 1 học viên × 1 khóa ghi danh. companyId = null: tất cả công ty. */
export function reportRows(companyId: number | null, courseId: number | null = null): Promise<ReportRow[]> {
  return rows<ReportRow>(
    `SELECT u.id AS user_id, u.name, u.email, u.phone, u.department, COALESCE(co.name, '') AS company,
       c.id AS course_id, c.title AS course, e.enrolled_at,
       (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lessons_total,
       (SELECT COUNT(*) FROM progress p JOIN lessons l ON l.id = p.lesson_id
          WHERE l.course_id = c.id AND p.learner = CAST(u.id AS TEXT)) AS lessons_done,
       (SELECT COUNT(*) FROM quiz_attempts a WHERE a.course_id = c.id AND a.learner = CAST(u.id AS TEXT)) AS attempts,
       (SELECT a.score FROM quiz_attempts a WHERE a.course_id = c.id AND a.learner = CAST(u.id AS TEXT)
          ORDER BY CAST(a.score AS REAL) / a.total DESC LIMIT 1) AS best_score,
       (SELECT a.total FROM quiz_attempts a WHERE a.course_id = c.id AND a.learner = CAST(u.id AS TEXT)
          ORDER BY CAST(a.score AS REAL) / a.total DESC LIMIT 1) AS best_total,
       x.code AS cert_code, x.issued_at AS cert_date,
       (SELECT MAX(t) FROM (
          SELECT MAX(p.completed_at) AS t FROM progress p JOIN lessons l ON l.id = p.lesson_id
            WHERE l.course_id = c.id AND p.learner = CAST(u.id AS TEXT)
          UNION ALL SELECT MAX(a.created_at) FROM quiz_attempts a WHERE a.course_id = c.id AND a.learner = CAST(u.id AS TEXT)) AS y) AS last_activity
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN companies co ON co.id = u.company_id
     LEFT JOIN certificates x ON x.user_id = u.id AND x.course_id = c.id
     WHERE ($1::int IS NULL OR u.company_id = $1) AND ($2::int IS NULL OR c.id = $2)
     ORDER BY co.name, u.name, c.id`,
    [companyId, courseId]
  );
}

export function rowStatus(r: ReportRow) {
  if (r.cert_code) return "Đạt";
  if (r.lessons_done === 0 && r.attempts === 0) return "Chưa bắt đầu";
  if (r.lessons_done < r.lessons_total) return "Đang học";
  return "Chờ thi / chưa đạt";
}

// ---------- Công ty & mã kích hoạt ----------
export type Company = { id: number; name: string; tax_code: string; contact: string; learners: number; codes: number };
export function listCompanies(): Promise<Company[]> {
  return rows<Company>(
    `SELECT co.*, (SELECT COUNT(*) FROM users u WHERE u.company_id = co.id) AS learners,
            (SELECT COUNT(*) FROM activation_codes a WHERE a.company_id = co.id) AS codes
     FROM companies co ORDER BY co.name`
  );
}
export async function createCompany(name: string, taxCode: string, contact: string) {
  return (await one<{ id: number }>("INSERT INTO companies (name, tax_code, contact) VALUES ($1, $2, $3) RETURNING id", [name.trim(), taxCode.trim(), contact.trim()]))!.id;
}

export type ActivationCode = {
  code: string; company_id: number; company: string; label: string; course_ids: number[];
  max_uses: number; used: number; expires_at: string | null; active: number; created_at: string;
};
export function listCodes(): Promise<ActivationCode[]> {
  return rows<ActivationCode>("SELECT a.*, co.name AS company FROM activation_codes a JOIN companies co ON co.id = a.company_id ORDER BY a.created_at DESC");
}

/** Tạo mã kích hoạt dạng SMS-XXXX-XXXX (bỏ ký tự dễ nhầm). */
export async function createCode(companyId: number, label: string, courseIds: number[], maxUses: number, expiresAt: string | null) {
  for (;;) {
    const code = `SMS-${randomCode(4)}-${randomCode(4)}`;
    const added = await exec(
      "INSERT INTO activation_codes (code, company_id, label, course_ids, max_uses, expires_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (code) DO NOTHING",
      [code, companyId, label.trim(), JSON.stringify(courseIds), maxUses, expiresAt || null]
    );
    if (added) return code;
  }
}
export async function setCodeActive(code: string, active: boolean) {
  return (await exec("UPDATE activation_codes SET active = $1 WHERE code = $2", [active ? 1 : 0, code])) > 0;
}
