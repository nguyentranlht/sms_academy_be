// /api/verify – tra cứu chứng nhận công khai (không cần đăng nhập; mã QR trên chứng nhận dẫn tới đây).
import { Router } from "express";
import { getCertificate } from "../lib/db";
import { rateLimited } from "../lib/auth";

const r = Router();

r.get("/:code", async (req, res) => {
  if (rateLimited("verify:" + (req.ip ?? ""), 120, 60_000)) return res.status(429).json({ error: "Tra cứu quá nhiều lần. Thử lại sau 1 phút." });
  const cert = await getCertificate(String(req.params.code));
  if (!cert) return res.status(404).json({ error: "Không tìm thấy chứng nhận." });
  // Chỉ trả thông tin in trên giấy chứng nhận.
  const { user_id: _u, course_id: _c, ...pub } = cert;
  res.json({ certificate: pub });
});

export default r;
