// Các hàm dữ liệu cho trang quản trị: soạn khóa học, công ty, mã kích hoạt, báo cáo.
import { getDb, getCourse, readingSeconds } from "./db";
import { randomCode } from "./crypto";

const plain = <T,>(rows: unknown[]) => rows.map((r) => ({ ...(r as object) })) as T[];

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
export function saveCourse(id: number | null, input: CourseInput): number {
  const c = clean(input);
  const db = getDb();
  db.exec("BEGIN");
  try {
    let courseId = id;
    if (courseId == null) {
      courseId = Number(
        db.prepare("INSERT INTO courses (title, category, level, description, quiz_size, max_attempts) VALUES (?, ?, ?, ?, ?, ?)")
          .run(c.title.trim(), c.category.trim(), c.level.trim(), c.description.trim(), c.quizSize, c.maxAttempts).lastInsertRowid
      );
    } else {
      db.prepare("UPDATE courses SET title = ?, category = ?, level = ?, description = ?, quiz_size = ?, max_attempts = ? WHERE id = ?")
        .run(c.title.trim(), c.category.trim(), c.level.trim(), c.description.trim(), c.quizSize, c.maxAttempts, courseId);
    }
    const old = getCourse(courseId)!;
    const oldL = new Set(old.lessons.map((l) => l.id));
    const keepL = new Set<number>();
    c.lessons.forEach((l, i) => {
      if (l.id && oldL.has(l.id)) {
        keepL.add(l.id);
        db.prepare("UPDATE lessons SET position = ?, kind = ?, title = ?, youtube_id = ?, content = ?, body = ?, min_seconds = ? WHERE id = ?")
          .run(i + 1, l.kind, l.title.trim(), l.youtubeId, l.content.trim(), l.body, l.minSeconds, l.id);
      } else {
        db.prepare("INSERT INTO lessons (course_id, position, kind, title, youtube_id, content, body, min_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .run(courseId, i + 1, l.kind, l.title.trim(), l.youtubeId, l.content.trim(), l.body, l.minSeconds);
      }
    });
    for (const lid of oldL) if (!keepL.has(lid)) db.prepare("DELETE FROM lessons WHERE id = ?").run(lid);

    const oldQ = new Set(old.questions.map((q) => q.id));
    const keepQ = new Set<number>();
    for (const q of c.questions) {
      if (q.id && oldQ.has(q.id)) {
        keepQ.add(q.id);
        db.prepare("UPDATE questions SET question = ?, options = ?, answer_index = ?, explanation = ? WHERE id = ?")
          .run(q.question.trim(), JSON.stringify(q.options), q.answer, q.explanation.trim(), q.id);
      } else {
        db.prepare("INSERT INTO questions (course_id, question, options, answer_index, explanation) VALUES (?, ?, ?, ?, ?)")
          .run(courseId, q.question.trim(), JSON.stringify(q.options), q.answer, q.explanation.trim());
      }
    }
    for (const qid of oldQ) if (!keepQ.has(qid)) db.prepare("DELETE FROM questions WHERE id = ?").run(qid);
    db.exec("COMMIT");
    return courseId;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// ---------- Tổng quan ----------
export function dashboardStats() {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    learners: one("SELECT COUNT(*) AS n FROM users WHERE role = 'learner'"),
    active7: one(
      `SELECT COUNT(DISTINCT learner) AS n FROM (
         SELECT learner FROM progress WHERE completed_at >= datetime('now', '-7 days')
         UNION SELECT learner FROM quiz_attempts WHERE created_at >= datetime('now', '-7 days'))`
    ),
    certificates: one("SELECT COUNT(*) AS n FROM certificates"),
    companies: one("SELECT COUNT(*) AS n FROM companies"),
    passRate: (() => {
      const r = db.prepare("SELECT COUNT(*) AS n, SUM(passed) AS p FROM quiz_attempts").get() as { n: number; p: number | null };
      return r.n ? Math.round(((r.p ?? 0) / r.n) * 100) : null;
    })(),
  };
}

/** Thống kê từng khóa: số học viên ghi danh, đang học, đã đạt. */
export function courseStats() {
  return plain<{ id: number; title: string; category: string; lessons: number; questions: number; enrolled: number; started: number; certified: number }>(
    getDb()
      .prepare(
        `SELECT c.id, c.title, c.category,
           (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lessons,
           (SELECT COUNT(*) FROM questions q WHERE q.course_id = c.id) AS questions,
           (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrolled,
           (SELECT COUNT(DISTINCT p.learner) FROM progress p JOIN lessons l ON l.id = p.lesson_id WHERE l.course_id = c.id) AS started,
           (SELECT COUNT(*) FROM certificates x WHERE x.course_id = c.id) AS certified
         FROM courses c ORDER BY c.id`
      )
      .all()
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
export function reportRows(companyId: number | null, courseId: number | null = null): ReportRow[] {
  return plain<ReportRow>(
    getDb()
      .prepare(
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
              UNION ALL SELECT MAX(a.created_at) FROM quiz_attempts a WHERE a.course_id = c.id AND a.learner = CAST(u.id AS TEXT))) AS last_activity
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
         JOIN courses c ON c.id = e.course_id
         LEFT JOIN companies co ON co.id = u.company_id
         LEFT JOIN certificates x ON x.user_id = u.id AND x.course_id = c.id
         WHERE (?1 IS NULL OR u.company_id = ?1) AND (?2 IS NULL OR c.id = ?2)
         ORDER BY co.name, u.name, c.id`
      )
      .all(companyId, courseId)
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
export function listCompanies(): Company[] {
  return plain<Company>(
    getDb()
      .prepare(
        `SELECT co.*, (SELECT COUNT(*) FROM users u WHERE u.company_id = co.id) AS learners,
                (SELECT COUNT(*) FROM activation_codes a WHERE a.company_id = co.id) AS codes
         FROM companies co ORDER BY co.name`
      )
      .all()
  );
}
export function createCompany(name: string, taxCode: string, contact: string) {
  return Number(getDb().prepare("INSERT INTO companies (name, tax_code, contact) VALUES (?, ?, ?)").run(name.trim(), taxCode.trim(), contact.trim()).lastInsertRowid);
}

export type ActivationCode = {
  code: string; company_id: number; company: string; label: string; course_ids: number[];
  max_uses: number; used: number; expires_at: string | null; active: number; created_at: string;
};
export function listCodes(): ActivationCode[] {
  return plain<ActivationCode & { course_ids: string }>(
    getDb()
      .prepare("SELECT a.*, co.name AS company FROM activation_codes a JOIN companies co ON co.id = a.company_id ORDER BY a.created_at DESC")
      .all()
  ).map((a) => ({ ...a, course_ids: JSON.parse(a.course_ids as unknown as string) as number[] }));
}

/** Tạo mã kích hoạt dạng SMS-XXXX-XXXX (bỏ ký tự dễ nhầm). */
export function createCode(companyId: number, label: string, courseIds: number[], maxUses: number, expiresAt: string | null) {
  const db = getDb();
  let code = "";
  do code = `SMS-${randomCode(4)}-${randomCode(4)}`;
  while (db.prepare("SELECT 1 FROM activation_codes WHERE code = ?").get(code));
  db.prepare("INSERT INTO activation_codes (code, company_id, label, course_ids, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    code, companyId, label.trim(), JSON.stringify(courseIds), maxUses, expiresAt || null
  );
  return code;
}
export function setCodeActive(code: string, active: boolean) {
  return Number(getDb().prepare("UPDATE activation_codes SET active = ? WHERE code = ?").run(active ? 1 : 0, code).changes) > 0;
}
