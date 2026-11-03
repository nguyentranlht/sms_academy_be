import crypto from "node:crypto";

// Băm mật khẩu bằng scrypt (có sẵn trong Node, không cần thư viện ngoài).
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const randomToken = () => crypto.randomBytes(32).toString("base64url");
export const randomDigits = (n: number) => Array.from({ length: n }, () => crypto.randomInt(10)).join("");
export function randomCode(len: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bỏ ký tự dễ nhầm (0/O, 1/I)
  return Array.from({ length: len }, () => chars[crypto.randomInt(chars.length)]).join("");
}

export function passwordProblem(pw: string): string | null {
  // Dễ gõ trên điện thoại: không bắt buộc chữ hoa, chỉ cần có cả chữ và số.
  if (pw.length < 8) return "Mật khẩu cần ít nhất 8 ký tự.";
  if (!/\p{L}/u.test(pw) || !/[0-9]/.test(pw)) return "Mật khẩu cần có cả chữ và số.";
  return null;
}

/** Chuẩn hóa số điện thoại Việt Nam về dạng 0xxxxxxxxx. Trả về null nếu không hợp lệ. */
export function normalizePhone(raw: string): string | null {
  let d = String(raw ?? "").replace(/[^0-9+]/g, "");
  if (d.startsWith("+84")) d = "0" + d.slice(3);
  else if (d.startsWith("84") && d.length === 11) d = "0" + d.slice(2);
  return /^0\d{9}$/.test(d) ? d : null;
}
