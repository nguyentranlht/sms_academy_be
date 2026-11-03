// /api/auth – đăng nhập, đăng ký bằng mã kích hoạt, đăng xuất, quên mật khẩu.
import { Router } from "express";
import { getDb } from "../lib/db";
import { hashPassword, normalizePhone, passwordProblem, randomDigits, sha256, verifyPassword } from "../lib/crypto";
import { createSession, destroySession, findUserByLogin, getUser, rateLimited } from "../lib/auth";
import { sendMail, showCodesOnScreen } from "../lib/mail";

const r = Router();

// Đăng nhập bằng số điện thoại hoặc email.
r.post("/login", (req, res) => {
  const { login, email, password, remember } = req.body ?? {};
  const id = String(login ?? email ?? "").trim().toLowerCase();
  if (rateLimited("login:" + id.replace(/\s/g, ""))) return res.status(429).json({ error: "Bạn đã thử quá nhiều lần. Hãy đợi 15 phút." });
  const u = findUserByLogin(id);
  if (!u || !verifyPassword(String(password ?? ""), u.password_hash))
    return res.status(401).json({ error: "Số điện thoại/email hoặc mật khẩu không đúng." });
  createSession(req, res, u.id, Boolean(remember));
  res.json({ ok: true });
});

r.post("/logout", (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

// Người dùng hiện tại (frontend dùng để biết đã đăng nhập chưa).
r.get("/me", (req, res) => {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: "Bạn cần đăng nhập." });
  res.json({ user: u });
});

// ---------- Đăng ký bằng mã kích hoạt ----------
type Code = { code: string; company_id: number; course_ids: string; max_uses: number; used: number; expires_at: string | null; active: number; company: string };

function findCode(raw: string): { code?: Code; error?: string } {
  const c = getDb()
    .prepare("SELECT a.*, co.name AS company FROM activation_codes a JOIN companies co ON co.id = a.company_id WHERE a.code = ?")
    .get(raw.trim().toUpperCase()) as Code | undefined;
  if (!c || !c.active) return { error: "Mã kích hoạt không đúng hoặc đã bị khóa." };
  if (c.expires_at && new Date(c.expires_at + "T23:59:59") < new Date()) return { error: "Mã kích hoạt đã hết hạn." };
  if (c.used >= c.max_uses) return { error: "Mã kích hoạt đã dùng hết số lượt." };
  return { code: c };
}

// GET ?code=...: kiểm tra mã ngay khi học viên gõ (hiện tên công ty và khóa học).
r.get("/register", (req, res) => {
  const raw = String(req.query.code ?? "");
  if (rateLimited("code-check", 300, 60_000)) return res.status(429).json({ error: "Thử lại sau." });
  const f = findCode(raw);
  if (f.error) return res.json({ ok: false, error: f.error });
  const ids = JSON.parse(f.code!.course_ids) as number[];
  const titles = ids.length
    ? (getDb().prepare(`SELECT title FROM courses WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as { title: string }[]).map((x) => x.title)
    : [];
  res.json({ ok: true, company: f.code!.company, courses: titles });
});

r.post("/register", (req, res) => {
  const b = req.body ?? {};
  const email = String(b.email ?? "").trim().toLowerCase();
  const phoneRaw = String(b.phone ?? "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : "";
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (rateLimited("register:" + (phone || email), 5)) return res.status(429).json({ error: "Bạn đã thử quá nhiều lần." });
  const f = findCode(String(b.code ?? ""));
  if (f.error) return res.status(400).json({ error: f.error });
  if (!name) return res.status(400).json({ error: "Hãy nhập họ và tên." });
  if (phone === null) return res.status(400).json({ error: "Số điện thoại không đúng. Nhập 10 số, ví dụ 0901234567." });
  if (!phone && !email) return res.status(400).json({ error: "Hãy nhập số điện thoại (hoặc email) để đăng nhập." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Email không hợp lệ." });
  const pw = String(b.password ?? "");
  const prob = passwordProblem(pw);
  if (prob) return res.status(400).json({ error: prob });
  if (!b.agree) return res.status(400).json({ error: "Bạn cần đồng ý với điều khoản sử dụng." });
  const db = getDb();
  if (phone && db.prepare("SELECT 1 FROM users WHERE phone = ?").get(phone))
    return res.status(409).json({ error: "Số điện thoại này đã có tài khoản. Hãy đăng nhập." });
  if (email && db.prepare("SELECT 1 FROM users WHERE email = ?").get(email))
    return res.status(409).json({ error: "Email này đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu." });
  const c = f.code!;
  const id = Number(
    db.prepare("INSERT INTO users (email, password_hash, name, cert_name, phone, department, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      email || null, hashPassword(pw), name, name.toUpperCase(), phone, String(b.department ?? "").slice(0, 80), c.company_id
    ).lastInsertRowid
  );
  for (const cid of JSON.parse(c.course_ids) as number[])
    db.prepare("INSERT OR IGNORE INTO enrollments (user_id, course_id, code) VALUES (?, ?, ?)").run(id, cid, c.code);
  db.prepare("UPDATE activation_codes SET used = used + 1 WHERE code = ?").run(c.code);
  createSession(req, res, id, true);
  res.json({ ok: true });
});

// ---------- Quên mật khẩu (tài khoản có email) ----------
// Bước 1: gửi mã 6 số. Luôn trả "đã gửi" kể cả khi email không tồn tại (không để lộ ai có tài khoản).
r.post("/forgot", async (req, res) => {
  const e = String(req.body?.email ?? "").trim().toLowerCase();
  if (rateLimited("forgot:" + e, 5, 60 * 60 * 1000)) return res.status(429).json({ error: "Bạn đã yêu cầu quá nhiều lần. Hãy thử lại sau 1 giờ." });
  const db = getDb();
  const prev = db.prepare("SELECT sent_ms FROM password_resets WHERE email = ?").get(e) as { sent_ms: number } | undefined;
  if (prev && Date.now() - prev.sent_ms < 60_000) return res.status(429).json({ error: "Hãy đợi 1 phút rồi gửi lại." });
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(e);
  let devCode: string | undefined;
  if (user) {
    const code = randomDigits(6);
    db.prepare("INSERT OR REPLACE INTO password_resets (email, code_hash, expires_ms, attempts, sent_ms) VALUES (?, ?, ?, 0, ?)").run(
      e, sha256(code), Date.now() + 10 * 60_000, Date.now()
    );
    await sendMail(e, "Mã đặt lại mật khẩu SMS Academy", `Mã xác nhận của bạn là ${code}. Mã có hiệu lực 10 phút.`);
    if (showCodesOnScreen()) devCode = code;
  }
  res.json({ ok: true, devCode });
});

// Bước 2 + 3: kiểm tra mã (tối đa 5 lần sai) và đặt mật khẩu mới; đăng xuất mọi thiết bị khác.
r.post("/reset", (req, res) => {
  const { email, code, password, checkOnly } = req.body ?? {};
  const e = String(email ?? "").trim().toLowerCase();
  const db = getDb();
  const row = db.prepare("SELECT * FROM password_resets WHERE email = ?").get(e) as { code_hash: string; expires_ms: number; attempts: number } | undefined;
  if (!row || row.expires_ms < Date.now()) return res.status(400).json({ error: "Mã đã hết hạn. Hãy gửi lại mã mới." });
  if (row.attempts >= 5) return res.status(400).json({ error: "Nhập sai quá 5 lần. Hãy gửi lại mã mới." });
  if (sha256(String(code ?? "")) !== row.code_hash) {
    db.prepare("UPDATE password_resets SET attempts = attempts + 1 WHERE email = ?").run(e);
    return res.status(400).json({ error: "Mã xác nhận không đúng." });
  }
  if (checkOnly) return res.json({ ok: true });
  const prob = passwordProblem(String(password ?? ""));
  if (prob) return res.status(400).json({ error: prob });
  const u = db.prepare("SELECT id FROM users WHERE email = ?").get(e) as { id: number };
  db.prepare("UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?").run(hashPassword(password), u.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
  db.prepare("DELETE FROM password_resets WHERE email = ?").run(e);
  createSession(req, res, u.id, false);
  res.json({ ok: true });
});

export default r;
