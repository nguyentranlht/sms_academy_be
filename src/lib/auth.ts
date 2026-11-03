// Đăng nhập bằng phiên (session) lưu trong CSDL, cookie httpOnly chứa token ngẫu nhiên.
import type { NextFunction, Request, Response } from "express";
import { getDb } from "./db";
import { normalizePhone, randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "sms_session";
const LONG = 30 * 24 * 3600 * 1000; // "Ghi nhớ đăng nhập": 30 ngày
const SHORT = 12 * 3600 * 1000; // không ghi nhớ: 12 giờ

export type User = {
  id: number;
  email: string | null;
  name: string;
  cert_name: string;
  phone: string;
  department: string;
  company_id: number | null;
  company_name: string | null;
  role: "learner" | "admin";
  password_changed_at: string;
};

// Gắn user vào request sau khi kiểm tra phiên.
declare module "express-serve-static-core" {
  interface Request {
    user?: User | null;
  }
}

const secure = () => process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIE !== "1";

export function createSession(req: Request, res: Response, userId: number, remember: boolean) {
  const token = randomToken();
  const ttl = remember ? LONG : SHORT;
  const ua = (req.get("user-agent") ?? "").slice(0, 200);
  getDb().prepare("INSERT INTO sessions (token_hash, user_id, expires_ms, user_agent) VALUES (?, ?, ?, ?)").run(sha256(token), userId, Date.now() + ttl, ua);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", ...(remember ? { maxAge: ttl } : {}) });
}

export function destroySession(req: Request, res: Response) {
  const t = req.cookies?.[SESSION_COOKIE];
  if (t) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(t));
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function currentTokenHash(req: Request): string | null {
  const t = req.cookies?.[SESSION_COOKIE];
  return t ? sha256(t) : null;
}

export function getUser(req: Request): User | null {
  if (req.user !== undefined) return req.user;
  const th = currentTokenHash(req);
  let user: User | null = null;
  if (th) {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT u.id, u.email, u.name, u.cert_name, u.phone, u.department, u.company_id, u.role, u.password_changed_at,
                c.name AS company_name, s.expires_ms
         FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN companies c ON c.id = u.company_id
         WHERE s.token_hash = ?`
      )
      .get(th) as (User & { expires_ms: number }) | undefined;
    if (row && row.expires_ms < Date.now()) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(th);
    else if (row) {
      const { expires_ms: _e, ...u } = row;
      user = { ...u };
    }
  }
  req.user = user;
  return user;
}

/** Middleware: bắt buộc đăng nhập (401 nếu chưa). */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!getUser(req)) return res.status(401).json({ error: "Bạn cần đăng nhập." });
  next();
}
/** Middleware: chỉ quản trị viên (403 nếu không phải). */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: "Bạn cần đăng nhập." });
  if (u.role !== "admin") return res.status(403).json({ error: "Chỉ quản trị viên được thực hiện." });
  next();
}
/** Lấy user trong route đã qua requireUser. */
export const me = (req: Request) => req.user as User;

// Giới hạn số lần thử (chống dò mật khẩu): mặc định 10 lần / 15 phút cho mỗi khóa.
const rate = new Map<string, number[]>();
export function rateLimited(key: string, max = 10, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const list = (rate.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  rate.set(key, list);
  return list.length > max;
}

/** Tìm tài khoản theo email hoặc số điện thoại (học viên là công nhân thường không có email). */
export function findUserByLogin(id: string): { id: number; password_hash: string; email: string | null } | undefined {
  const raw = String(id ?? "").trim();
  if (!raw) return undefined;
  const db = getDb();
  if (raw.includes("@")) return db.prepare("SELECT id, password_hash, email FROM users WHERE email = ?").get(raw.toLowerCase()) as never;
  const phone = normalizePhone(raw);
  return phone ? (db.prepare("SELECT id, password_hash, email FROM users WHERE phone = ?").get(phone) as never) : undefined;
}
