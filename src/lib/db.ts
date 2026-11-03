// Lớp dữ liệu dùng SQLite tích hợp sẵn trong Node 22+ (node:sqlite).
// Khi lên production: thay file này bằng PostgreSQL (vd. Prisma hoặc pg) — giữ nguyên các hàm export.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { seedCourses, type SeedCourse } from "./seed";
import { hashPassword } from "./crypto";

export const PASS_RATIO = 0.7; // đạt khi đúng ≥ 70%
export const VIDEO_REQUIRED = 0.95; // phải xem ≥ 95% thời lượng video
const READING_WPM = 200; // tốc độ đọc dùng để tính thời gian đọc tối thiểu

export type Course = {
  id: number;
  title: string;
  category: string;
  level: string;
  description: string;
  quiz_size: number;
  max_attempts: number;
  lessonCount?: number;
  questionCount?: number;
};
export type Lesson = {
  id: number;
  course_id: number;
  position: number;
  kind: "video" | "reading";
  title: string;
  youtube_id: string;
  content: string;
  body: string;
  min_seconds: number;
};
export type Question = {
  id: number;
  course_id: number;
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
};

const g = globalThis as unknown as { __smsDb?: DatabaseSync };
export const getDb = () => open();
// node:sqlite trả về object không có prototype; sao chép thành object thường để truyền sang Client Component.
const plain = <T,>(rows: unknown[]) => rows.map((r) => ({ ...(r as object) })) as T[];

export function readingSeconds(body: string) {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(30, Math.round((words / READING_WPM) * 60));
}

function open(): DatabaseSync {
  if (g.__smsDb) return g.__smsDb;
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "elearning.db"));
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, category TEXT NOT NULL, level TEXT NOT NULL, description TEXT NOT NULL,
      quiz_size INTEGER NOT NULL DEFAULT 5, max_attempts INTEGER NOT NULL DEFAULT 3,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
      youtube_id TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '', min_seconds INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      question TEXT NOT NULL, options TEXT NOT NULL, answer_index INTEGER NOT NULL, explanation TEXT NOT NULL);
    -- Thời điểm học viên mở bài: dùng để chặn hoàn thành bài quá nhanh.
    CREATE TABLE IF NOT EXISTS lesson_views (
      learner TEXT NOT NULL, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      started_ms INTEGER NOT NULL, duration_sec REAL NOT NULL DEFAULT 0, PRIMARY KEY (learner, lesson_id));
    CREATE TABLE IF NOT EXISTS progress (
      learner TEXT NOT NULL, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      completed_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (learner, lesson_id));
    -- Mỗi lượt thi: câu hỏi được rút ngẫu nhiên và xáo trộn đáp án, lưu lại để chấm.
    CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY, learner TEXT NOT NULL,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      payload TEXT NOT NULL, submitted INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, learner TEXT NOT NULL,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      score INTEGER NOT NULL, total INTEGER NOT NULL, passed INTEGER NOT NULL,
      voided INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    -- Tài khoản, doanh nghiệp, mã kích hoạt, chứng nhận
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, tax_code TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, name TEXT NOT NULL, cert_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '', department TEXT NOT NULL DEFAULT '',
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      role TEXT NOT NULL DEFAULT 'learner', password_changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_ms INTEGER NOT NULL, user_agent TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS activation_codes (
      code TEXT PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT '', course_ids TEXT NOT NULL, max_uses INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0, expires_at TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS enrollments (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      code TEXT, enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, course_id));
    CREATE TABLE IF NOT EXISTS password_resets (
      email TEXT NOT NULL COLLATE NOCASE PRIMARY KEY, code_hash TEXT NOT NULL,
      expires_ms INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS certificates (
      code TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      holder_name TEXT NOT NULL, course_title TEXT NOT NULL, company_name TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL, total INTEGER NOT NULL, issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, course_id));
  `);
  migrate(db);
  g.__smsDb = db;
  const n = db.prepare("SELECT COUNT(*) AS n FROM courses").get() as { n: number };
  if (n.n === 0) seed(db);
  return db;
}

// Nâng cấp CSDL cũ: cho phép tài khoản không có email (công nhân đăng ký bằng số điện thoại).
function migrate(db: DatabaseSync) {
  const cols = db.prepare("PRAGMA table_info(users)").all() as { name: string; notnull: number }[];
  if (cols.find((c) => c.name === "email")?.notnull) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL, name TEXT NOT NULL, cert_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '', department TEXT NOT NULL DEFAULT '',
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        role TEXT NOT NULL DEFAULT 'learner', password_changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO users_new SELECT id, email, password_hash, name, cert_name, phone, department, company_id, role, password_changed_at, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
  // Số điện thoại dùng để đăng nhập nên không được trùng.
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_phone ON users(phone) WHERE phone != ''");
  } catch {
    // Dữ liệu cũ có số trùng: bỏ qua, kiểm tra trùng vẫn được làm khi đăng ký.
  }
}

// Dữ liệu ban đầu: khóa mẫu, 1 tài khoản quản trị, 1 công ty demo với mã kích hoạt, 1 học viên demo.
function seed(db: DatabaseSync) {
  const ids = seedCourses.map((c) => createCourse(c));
  const adminEmail = process.env.ADMIN_EMAIL || "admin@sms.vn";
  const adminPass = process.env.ADMIN_PASSWORD || "Admin@2026";
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')").run(adminEmail, hashPassword(adminPass), "Quản trị SMS");
  const co = Number(db.prepare("INSERT INTO companies (name, contact) VALUES (?, ?)").run("Công ty Demo", "Phòng nhân sự").lastInsertRowid);
  db.prepare("INSERT INTO activation_codes (code, company_id, label, course_ids, max_uses) VALUES (?, ?, ?, ?, ?)").run(
    "SMS-DEMO-2026", co, "Đợt demo", JSON.stringify(ids), 100
  );
  const u = Number(
    db.prepare("INSERT INTO users (email, password_hash, name, cert_name, department, company_id, phone) VALUES (?, ?, ?, ?, ?, ?, '0901234567')").run(
      "hocvien@demo.vn", hashPassword("Hocvien@2026"), "Nguyễn Thị Mai", "NGUYỄN THỊ MAI", "QA", co
    ).lastInsertRowid
  );
  for (const id of ids) db.prepare("INSERT INTO enrollments (user_id, course_id, code) VALUES (?, ?, ?)").run(u, id, "SMS-DEMO-2026");
  db.prepare("UPDATE activation_codes SET used = 1 WHERE code = 'SMS-DEMO-2026'").run();
}

// ---------- Khóa học ----------
export function listCourses(): Course[] {
  return plain<Course>(
    open()
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lessonCount,
                (SELECT COUNT(*) FROM questions q WHERE q.course_id = c.id) AS questionCount
         FROM courses c ORDER BY c.id`
      )
      .all()
  );
}

export function getCourse(id: number) {
  const db = open();
  const row = db.prepare("SELECT * FROM courses WHERE id = ?").get(id);
  if (!row) return null;
  const course = { ...row } as unknown as Course;
  const lessons = plain<Lesson>(db.prepare("SELECT * FROM lessons WHERE course_id = ? ORDER BY position").all(id));
  const questions = plain<any>(db.prepare("SELECT * FROM questions WHERE course_id = ? ORDER BY id").all(id)).map((q) => ({
    ...q,
    options: JSON.parse(q.options),
  })) as Question[];
  return { course, lessons, questions };
}

export function createCourse(c: SeedCourse): number {
  const db = open();
  const r = db
    .prepare("INSERT INTO courses (title, category, level, description, quiz_size, max_attempts) VALUES (?, ?, ?, ?, ?, ?)")
    .run(c.title, c.category, c.level, c.description, c.quizSize, c.maxAttempts);
  const id = Number(r.lastInsertRowid);
  const insL = db.prepare(
    "INSERT INTO lessons (course_id, position, kind, title, youtube_id, content, body, min_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  c.lessons.forEach((l, i) =>
    insL.run(
      id, i + 1, l.kind, l.title, l.youtubeId ?? "", l.content ?? "", l.body ?? "",
      l.kind === "reading" ? l.minSeconds || readingSeconds(l.body ?? "") : 0
    )
  );
  const insQ = db.prepare("INSERT INTO questions (course_id, question, options, answer_index, explanation) VALUES (?, ?, ?, ?, ?)");
  c.questions.forEach((q) => insQ.run(id, q.question, JSON.stringify(q.options), q.answer, q.explanation));
  return id;
}

export function deleteCourse(id: number) {
  open().prepare("DELETE FROM courses WHERE id = ?").run(id);
}

// ---------- Tiến độ ----------
export function completedLessonIds(learner: string): Set<number> {
  const rows = plain<{ lesson_id: number }>(open().prepare("SELECT lesson_id FROM progress WHERE learner = ?").all(learner));
  return new Set(rows.map((r) => r.lesson_id));
}

/** Ghi nhận học viên mở bài (lần đầu) và thời lượng video nếu có. */
export function startLesson(learner: string, lessonId: number, durationSec: number) {
  const db = open();
  db.prepare("INSERT OR IGNORE INTO lesson_views (learner, lesson_id, started_ms) VALUES (?, ?, ?)").run(learner, lessonId, Date.now());
  if (durationSec > 0)
    db.prepare("UPDATE lesson_views SET duration_sec = ? WHERE learner = ? AND lesson_id = ? AND duration_sec = 0").run(
      durationSec, learner, lessonId
    );
}

/**
 * Hoàn thành bài học — kiểm tra phía máy chủ:
 *  1. Các bài trước phải xong (học tuần tự).
 *  2. Đã mở bài đủ lâu: tài liệu ≥ thời gian đọc tối thiểu, video ≥ 90% thời lượng (dung sai mạng).
 *  3. Video: vị trí đã xem liên tục phải ≥ 95% thời lượng.
 */
export function completeLesson(learner: string, lessonId: number, watchedSec: number): string | null {
  const db = open();
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(lessonId) as unknown as Lesson | undefined;
  if (!lesson) return "Không tìm thấy bài học";
  const data = getCourse(lesson.course_id)!;
  const done = completedLessonIds(learner);
  const prev = data.lessons.filter((l) => l.position < lesson.position);
  if (prev.some((l) => !done.has(l.id))) return "Bạn cần hoàn thành các bài trước theo thứ tự.";
  const view = db.prepare("SELECT * FROM lesson_views WHERE learner = ? AND lesson_id = ?").get(learner, lessonId) as
    | { started_ms: number; duration_sec: number }
    | undefined;
  if (!view) return "Bạn chưa mở bài học này.";
  const elapsed = (Date.now() - view.started_ms) / 1000;
  if (lesson.kind === "reading") {
    if (elapsed < lesson.min_seconds) return `Bạn cần đọc tối thiểu ${lesson.min_seconds} giây (mới ${Math.floor(elapsed)} giây).`;
  } else {
    const dur = view.duration_sec;
    if (!dur) return "Chưa ghi nhận được thời lượng video. Hãy phát video.";
    if (watchedSec < dur * VIDEO_REQUIRED) return `Bạn cần xem tối thiểu ${Math.round(VIDEO_REQUIRED * 100)}% video.`;
    if (elapsed < dur * 0.9) return "Thời gian xem chưa đủ so với thời lượng video.";
  }
  db.prepare("INSERT OR IGNORE INTO progress (learner, lesson_id) VALUES (?, ?)").run(learner, lessonId);
  return null;
}

export function viewStart(learner: string, lessonId: number): number | null {
  const v = open().prepare("SELECT started_ms FROM lesson_views WHERE learner = ? AND lesson_id = ?").get(learner, lessonId) as
    | { started_ms: number }
    | undefined;
  return v ? v.started_ms : null;
}

// ---------- Bài kiểm tra ----------
export function quizStatus(learner: string, courseId: number) {
  const db = open();
  const c = db.prepare("SELECT max_attempts FROM courses WHERE id = ?").get(courseId) as { max_attempts: number };
  const rows = plain<{ score: number; total: number; passed: number; voided: number }>(
    db.prepare("SELECT score, total, passed, voided FROM quiz_attempts WHERE learner = ? AND course_id = ? ORDER BY id").all(learner, courseId)
  );
  const active = rows.filter((r) => !r.voided);
  const fails = active.filter((r) => !r.passed).length;
  const best = rows.reduce<{ score: number; total: number } | null>(
    (b, r) => (!b || r.score / r.total > b.score / b.total ? { score: r.score, total: r.total } : b),
    null
  );
  return { passed: rows.some((r) => r.passed), attemptsLeft: Math.max(0, c.max_attempts - fails), maxAttempts: c.max_attempts, best };
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Tạo một lượt thi: rút ngẫu nhiên câu hỏi từ ngân hàng và xáo trộn thứ tự đáp án. */
export function startQuiz(learner: string, courseId: number) {
  const data = getCourse(courseId);
  if (!data) return { error: "Không tìm thấy khóa học" };
  const done = completedLessonIds(learner);
  if (data.lessons.some((l) => !done.has(l.id))) return { error: "Bạn cần hoàn thành tất cả bài học trước khi làm bài kiểm tra." };
  const st = quizStatus(learner, courseId);
  if (st.attemptsLeft <= 0) return { error: "Bạn đã hết lượt thi." };
  const picked = shuffle(data.questions).slice(0, Math.min(data.course.quiz_size, data.questions.length));
  const items = picked.map((q) => ({ qid: q.id, order: shuffle(q.options.map((_, i) => i)) }));
  const id = crypto.randomUUID();
  open().prepare("INSERT INTO quiz_sessions (id, learner, course_id, payload) VALUES (?, ?, ?, ?)").run(id, learner, courseId, JSON.stringify(items));
  return {
    sessionId: id,
    questions: items.map((it) => {
      const q = picked.find((p) => p.id === it.qid)!;
      return { question: q.question, options: it.order.map((i) => q.options[i]) };
    }),
  };
}

/**
 * Chấm bài. Khi trượt: chỉ báo câu nào sai, KHÔNG tiết lộ đáp án đúng (chống học vẹt).
 * Trượt hết số lượt cho phép → xóa tiến độ khóa học, học viên phải học lại từ đầu.
 */
export function submitQuiz(learner: string, sessionId: string, answers: number[]) {
  const db = open();
  const s = db.prepare("SELECT * FROM quiz_sessions WHERE id = ? AND learner = ?").get(sessionId, learner) as
    | { course_id: number; payload: string; submitted: number }
    | undefined;
  if (!s) return { error: "Không tìm thấy lượt thi" };
  if (s.submitted) return { error: "Lượt thi này đã nộp." };
  const items = JSON.parse(s.payload) as { qid: number; order: number[] }[];
  const data = getCourse(s.course_id)!;
  if (items.some((it) => !data.questions.some((x) => x.id === it.qid))) {
    // Quản trị viên vừa sửa ngân hàng câu hỏi: hủy lượt này, không tính lượt thi.
    db.prepare("UPDATE quiz_sessions SET submitted = 1 WHERE id = ?").run(sessionId);
    return { error: "Đề thi vừa được cập nhật. Hãy bắt đầu lại bài kiểm tra (lượt này không bị tính)." };
  }
  const results = items.map((it, i) => {
    const q = data.questions.find((x) => x.id === it.qid)!;
    const chosenOriginal = answers[i] == null ? -1 : it.order[answers[i]];
    return { correct: chosenOriginal === q.answer_index, answer: it.order.indexOf(q.answer_index), explanation: q.explanation };
  });
  const score = results.filter((r) => r.correct).length;
  const passed = score / results.length >= PASS_RATIO;
  db.prepare("UPDATE quiz_sessions SET submitted = 1 WHERE id = ?").run(sessionId);
  db.prepare("INSERT INTO quiz_attempts (learner, course_id, score, total, passed) VALUES (?, ?, ?, ?, ?)").run(
    learner, s.course_id, score, results.length, passed ? 1 : 0
  );
  let certificate: string | null = null;
  if (passed) certificate = issueCertificate(Number(learner), s.course_id, score, results.length);
  let reset = false;
  if (!passed && quizStatus(learner, s.course_id).attemptsLeft <= 0) {
    // Hết lượt: hủy tiến độ để buộc học lại.
    const ids = data.lessons.map((l) => l.id);
    for (const id of ids) {
      db.prepare("DELETE FROM progress WHERE learner = ? AND lesson_id = ?").run(learner, id);
      db.prepare("DELETE FROM lesson_views WHERE learner = ? AND lesson_id = ?").run(learner, id);
    }
    db.prepare("UPDATE quiz_attempts SET voided = 1 WHERE learner = ? AND course_id = ?").run(learner, s.course_id);
    reset = true;
  }
  return {
    score,
    total: results.length,
    passed,
    reset,
    certificate,
    attemptsLeft: quizStatus(learner, s.course_id).attemptsLeft,
    results: results.map((r) => (passed ? r : { correct: r.correct })),
  };
}

export function bestScores(learner: string): Map<number, { score: number; total: number; passed: boolean }> {
  const rows = plain<{ course_id: number; score: number; total: number; passed: number }>(
    open()
      .prepare(
        `SELECT course_id, score, total, passed FROM quiz_attempts a WHERE learner = ?
         AND id = (SELECT id FROM quiz_attempts b WHERE b.learner = a.learner AND b.course_id = a.course_id
                   ORDER BY CAST(score AS REAL) / total DESC, id LIMIT 1)`
      )
      .all(learner)
  );
  return new Map(rows.map((r) => [Number(r.course_id), { score: r.score, total: r.total, passed: !!r.passed }]));
}

export function learnerReport() {
  return plain<{ learner: string; lessons_done: number; attempts: number; passed: number }>(
    open()
      .prepare(
        `SELECT learner, COUNT(*) AS lessons_done,
          (SELECT COUNT(*) FROM quiz_attempts q WHERE q.learner = p.learner) AS attempts,
          (SELECT COUNT(DISTINCT course_id) FROM quiz_attempts q WHERE q.learner = p.learner AND q.passed = 1) AS passed
         FROM progress p GROUP BY learner ORDER BY lessons_done DESC`
      )
      .all()
  );
}

// ---------- Chứng nhận ----------
/** Cấp chứng nhận khi đạt lần đầu; đạt lại với điểm cao hơn thì cập nhật điểm. Trả về mã tra cứu. */
export function issueCertificate(userId: number, courseId: number, score: number, total: number): string {
  const db = open();
  const old = db.prepare("SELECT code, score, total FROM certificates WHERE user_id = ? AND course_id = ?").get(userId, courseId) as
    | { code: string; score: number; total: number }
    | undefined;
  if (old) {
    if (score / total > old.score / old.total)
      db.prepare("UPDATE certificates SET score = ?, total = ? WHERE code = ?").run(score, total, old.code);
    return old.code;
  }
  const u = db.prepare("SELECT u.name, u.cert_name, c.name AS company FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.id = ?").get(userId) as
    | { name: string; cert_name: string; company: string | null }
    | undefined;
  const course = db.prepare("SELECT title FROM courses WHERE id = ?").get(courseId) as { title: string };
  const yy = String(new Date().getFullYear()).slice(2);
  const seq = (db.prepare("SELECT COUNT(*) AS n FROM certificates").get() as { n: number }).n + 1;
  const code = `SMS-${yy}${String(courseId).padStart(2, "0")}-${String(seq).padStart(4, "0")}${crypto.randomInt(10, 99)}`;
  db.prepare(
    "INSERT INTO certificates (code, user_id, course_id, holder_name, course_title, company_name, score, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(code, userId, courseId, (u?.cert_name || u?.name || "").toUpperCase(), course.title, u?.company ?? "", score, total);
  return code;
}

export type Certificate = {
  code: string; user_id: number; course_id: number; holder_name: string; course_title: string;
  company_name: string; score: number; total: number; issued_at: string;
};
export function getCertificate(code: string): Certificate | null {
  const r = open().prepare("SELECT * FROM certificates WHERE code = ?").get(code.trim().toUpperCase());
  return r ? ({ ...r } as unknown as Certificate) : null;
}
export function userCertificates(userId: number): Certificate[] {
  return plain<Certificate>(open().prepare("SELECT * FROM certificates WHERE user_id = ? ORDER BY issued_at DESC").all(userId));
}

// ---------- Ghi danh ----------
export function enrolledCourseIds(userId: number): Set<number> {
  const rows = plain<{ course_id: number }>(open().prepare("SELECT course_id FROM enrollments WHERE user_id = ?").all(userId));
  return new Set(rows.map((r) => r.course_id));
}
