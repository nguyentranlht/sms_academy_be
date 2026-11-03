// /api/auth – đăng nhập, đăng ký bằng mã kích hoạt, đăng xuất, quên mật khẩu.
import { Router } from "express";
import { exec, NOW, one, rows, tx } from "../lib/db";
import { hashPassword, normalizePhone, passwordProblem, randomDigits, sha256, verifyPassword } from "../lib/crypto";
import { createSession, destroySession, findUserByLogin, getUser, rateLimited } from "../lib/auth";
import { sendMail, showCodesOnScreen } from "../lib/mail";

const r = Router();

// Đăng nhập bằng số điện thoại hoặc email.
r.post("/login", async (req, res) => {
  const { login, email, password, remember } = req.body ?? {};
  const id = String(login ?? email ?? "").trim().toLowerCase();
  if (rateLimited("login:" + id.replace(/\s/g, ""))) return res.status(429).json({ error: "Bạn đã thử quá nhiều lần. Hãy đợi 15 phút." });
  const u = await findUserByLogin(id);
  if (!u || !verifyPassword(String(password ?? ""), u.password_hash))
    return res.status(401).json({ error: "Số điện thoại/email hoặc mật khẩu không đúng." });
  await createSession(req, res, u.id, Boolean(remember));
  res.json({ ok: true });
});

r.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

// Người dùng hiện tại (frontend dùng để biết đã đăng nhập chưa).
r.get("/me", async (req, res) => {
  const u = await getUser(req);
  if (!u) return res.status(401).json({ error: "Bạn cần đăng nhập." });
  res.json({ user: u });
});

// ---------- Đăng ký bằng mã kích hoạt ----------
type Code = { code: string; company_id: number; course_ids: number[]; max_uses: number; used: number; expires_at: string | null; active: number; company: string };

async function findCode(raw: string): Promise<{ code?: Code; error?: string }> {
  const c = await one<Code>(
    "SELECT a.*, co.name AS company FROM activation_codes a JOIN companies co ON co.id = a.company_id WHERE a.code = $1",
    [raw.trim().toUpperCase()]
  );
  if (!c || !c.active) return { error: "Mã kích hoạt không đúng hoặc đã bị khóa." };
  if (c.expires_at && new Date(c.expires_at + "T23:59:59") < new Date()) return { error: "Mã kích hoạt đã hết hạn." };
  if (c.used >= c.max_uses) return { error: "Mã kích hoạt đã dùng hết số lượt." };
  return { code: c };
}

// GET ?code=...: kiểm tra mã ngay khi học viên gõ (hiện tên công ty và khóa học).
r.get("/register", async (req, res) => {
  const raw = String(req.query.code ?? "");
  if (rateLimited("code-check", 300, 60_000)) return res.status(429).json({ error: "Thử lại sau." });
  const f = await findCode(raw);
  if (f.error) return res.json({ ok: false, error: f.error });
  const titles = (await rows<{ title: string }>("SELECT title FROM courses WHERE id = ANY($1::int[]) ORDER BY id", [f.code!.course_ids])).map((x) => x.title);
  res.json({ ok: true, company: f.code!.company, courses: titles });
});

r.post("/register", async (req, res) => {
  const b = req.body ?? {};
  const email = String(b.email ?? "").trim().toLowerCase();
  const phoneRaw = String(b.phone ?? "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : "";
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (rateLimited("register:" + (phone || email), 5)) return res.status(429).json({ error: "Bạn đã thử quá nhiều lần." });
  const f = await findCode(String(b.code ?? ""));
  if (f.error) return res.status(400).json({ error: f.error });
  if (!name) return res.status(400).json({ error: "Hãy nhập họ và tên." });
  if (phone === null) return res.status(400).json({ error: "Số điện thoại không đúng. Nhập 10 số, ví dụ 0901234567." });
  if (!phone && !email) return res.status(400).json({ error: "Hãy nhập số điện thoại (hoặc email) để đăng nhập." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Email không hợp lệ." });
  const pw = String(b.password ?? "");
  const prob = passwordProblem(pw);
  if (prob) return res.status(400).json({ error: prob });
  if (!b.agree) return res.status(400).json({ error: "Bạn cần đồng ý với điều khoản sử dụng." });
  if (phone && (await one("SELECT 1 FROM users WHERE phone = $1", [phone])))
    return res.status(409).json({ error: "Số điện thoại này đã có tài khoản. Hãy đăng nhập." });
  if (email && (await one("SELECT 1 FROM users WHERE email = $1", [email])))
    return res.status(409).json({ error: "Email này đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu." });
  const c = f.code!;
  const id = await tx(async (db) => {
    // Trừ lượt dùng trước: nhiều người đăng ký cùng lúc cũng không vượt quá số lượt của mã.
    if (!(await exec("UPDATE activation_codes SET used = used + 1 WHERE code = $1 AND used < max_uses", [c.code], db))) return null;
    const uid = (await one<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, cert_name, phone, department, company_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
      [email || null, hashPassword(pw), name, name.toUpperCase(), phone, String(b.department ?? "").slice(0, 80), c.company_id],
      db
    ))!.id;
    for (const cid of c.course_ids)
      await exec("INSERT INTO enrollments (user_id, course_id, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [uid, cid, c.code], db);
    return uid;
  });
  if (id == null) return res.status(400).json({ error: "Mã kích hoạt đã dùng hết số lượt." });
  await createSession(req, res, id, true);
  res.json({ ok: true });
});

// ---------- Quên mật khẩu (tài khoản có email) ----------
// Bước 1: gửi mã 6 số. Luôn trả "đã gửi" kể cả khi email không tồn tại (không để lộ ai có tài khoản).
r.post("/forgot", async (req, res) => {
  const e = String(req.body?.email ?? "").trim().toLowerCase();
  if (rateLimited("forgot:" + e, 5, 60 * 60 * 1000)) return res.status(429).json({ error: "Bạn đã yêu cầu quá nhiều lần. Hãy thử lại sau 1 giờ." });
  const prev = await one<{ sent_ms: number }>("SELECT sent_ms FROM password_resets WHERE email = $1", [e]);
  if (prev && Date.now() - prev.sent_ms < 60_000) return res.status(429).json({ error: "Hãy đợi 1 phút rồi gửi lại." });
  const user = await one("SELECT id FROM users WHERE email = $1", [e]);
  let devCode: string | undefined;
  if (user) {
    const code = randomDigits(6);
    await exec(
      `INSERT INTO password_resets (email, code_hash, expires_ms, attempts, sent_ms) VALUES ($1, $2, $3, 0, $4)
       ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_ms = EXCLUDED.expires_ms, attempts = 0, sent_ms = EXCLUDED.sent_ms`,
      [e, sha256(code), Date.now() + 10 * 60_000, Date.now()]
    );
    await sendMail(e, "Mã đặt lại mật khẩu SMS Academy", `Mã xác nhận của bạn là ${code}. Mã có hiệu lực 10 phút.`);
    if (showCodesOnScreen()) devCode = code;
  }
  res.json({ ok: true, devCode });
});

// Bước 2 + 3: kiểm tra mã (tối đa 5 lần sai) và đặt mật khẩu mới; đăng xuất mọi thiết bị khác.
r.post("/reset", async (req, res) => {
  const { email, code, password, checkOnly } = req.body ?? {};
  const e = String(email ?? "").trim().toLowerCase();
  const row = await one<{ code_hash: string; expires_ms: number; attempts: number }>("SELECT * FROM password_resets WHERE email = $1", [e]);
  if (!row || row.expires_ms < Date.now()) return res.status(400).json({ error: "Mã đã hết hạn. Hãy gửi lại mã mới." });
  if (row.attempts >= 5) return res.status(400).json({ error: "Nhập sai quá 5 lần. Hãy gửi lại mã mới." });
  if (sha256(String(code ?? "")) !== row.code_hash) {
    await exec("UPDATE password_resets SET attempts = attempts + 1 WHERE email = $1", [e]);
    return res.status(400).json({ error: "Mã xác nhận không đúng." });
  }
  if (checkOnly) return res.json({ ok: true });
  const prob = passwordProblem(String(password ?? ""));
  if (prob) return res.status(400).json({ error: prob });
  const u = (await one<{ id: number }>("SELECT id FROM users WHERE email = $1", [e]))!;
  await tx(async (db) => {
    await exec(`UPDATE users SET password_hash = $1, password_changed_at = ${NOW} WHERE id = $2`, [hashPassword(password), u.id], db);
    await exec("DELETE FROM sessions WHERE user_id = $1", [u.id], db);
    await exec("DELETE FROM password_resets WHERE email = $1", [e], db);
  });
  await createSession(req, res, u.id, false);
  res.json({ ok: true });
});

export default r;
