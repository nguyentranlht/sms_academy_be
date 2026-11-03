// SMS Academy – Backend API (Node.js + Express + PostgreSQL).
// Frontend (Next.js) gọi các API dưới /api. Mặc định chạy ở cổng 4000.
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { initDb } from "./lib/db";
import { translateErrors } from "./lib/i18n";
import auth from "./routes/auth";
import verify from "./routes/verify";
import admin from "./routes/admin";
import learner from "./routes/learner";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(translateErrors); // lỗi trả về theo ngôn ngữ giao diện (cookie "lang")

// CORS: chỉ cần khi frontend/app điện thoại gọi thẳng từ tên miền khác (đặt CORS_ORIGIN, cách nhau dấu phẩy).
const origins = (process.env.CORS_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const o = req.get("origin");
  if (o && origins.includes(o)) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") return res.sendStatus(204);
  }
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", auth);
app.use("/api/verify", verify);
app.use("/api/admin", admin);
app.use("/api", learner); // cần đăng nhập

app.use((_req, res) => res.status(404).json({ error: "Không tìm thấy." }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if ((err as { type?: string }).type === "entity.parse.failed") return res.status(400).json({ error: "Dữ liệu gửi lên không hợp lệ." });
  // Lỗi PostgreSQL do dữ liệu gửi lên: sai kiểu số/ngày, số quá lớn (22xxx) hoặc trùng dữ liệu (23505).
  const code = (err as { code?: string }).code;
  if (code === "23505") return res.status(409).json({ error: "Dữ liệu đã tồn tại." });
  if (code?.startsWith("22")) return res.status(400).json({ error: "Dữ liệu gửi lên không hợp lệ." });
  console.error(err);
  res.status(500).json({ error: "Lỗi máy chủ. Vui lòng thử lại." });
});

const port = Number(process.env.PORT) || 4000;
// Tạo bảng + dữ liệu mẫu trước khi nhận yêu cầu.
initDb()
  .then(() => app.listen(port, () => console.log(`SMS Academy API đang chạy: http://localhost:${port}/api`)))
  .catch((e) => {
    console.error("Không kết nối được PostgreSQL (kiểm tra DATABASE_URL):", e.message || e.code || e);
    process.exit(1);
  });
