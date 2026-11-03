// /api/admin – chỉ quản trị viên: tổng quan, soạn khóa học, công ty & mã kích hoạt, báo cáo, cấp lại mật khẩu.
import { Router } from "express";
import {
  courseProblem, courseStats, createCode, createCompany, dashboardStats, listCodes, listCompanies,
  reportRows, rowStatus, saveCourse, setCodeActive, type CourseInput,
} from "../lib/admin";
import { deleteCourse, getCourse, getDb, listCourses } from "../lib/db";
import { requireAdmin } from "../lib/auth";
import { hashPassword, randomDigits } from "../lib/crypto";

const r = Router();
r.use(requireAdmin);

// ---------- Tổng quan ----------
r.get("/dashboard", (_req, res) => {
  const recent = getDb()
    .prepare("SELECT code, holder_name, course_title, company_name, score, total, issued_at FROM certificates ORDER BY issued_at DESC LIMIT 6")
    .all()
    .map((x) => ({ ...(x as object) }));
  res.json({ stats: dashboardStats(), courses: courseStats(), recent });
});

// ---------- Khóa học ----------
r.get("/courses/:id", (req, res) => {
  const data = getCourse(Number(req.params.id));
  if (!data) return res.status(404).json({ error: "Không tìm thấy khóa học." });
  res.json(data);
});

r.post("/courses", (req, res) => {
  const body = req.body as CourseInput | undefined;
  if (!body) return res.status(400).json({ error: "Dữ liệu không hợp lệ." });
  const problem = courseProblem(body);
  if (problem) return res.status(400).json({ error: problem });
  res.json({ ok: true, id: saveCourse(null, body) });
});

r.put("/courses/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!getCourse(id)) return res.status(404).json({ error: "Không tìm thấy khóa học." });
  const body = req.body as CourseInput | undefined;
  if (!body) return res.status(400).json({ error: "Dữ liệu không hợp lệ." });
  const problem = courseProblem(body);
  if (problem) return res.status(400).json({ error: problem });
  saveCourse(id, body);
  res.json({ ok: true, id });
});

r.delete("/courses/:id", (req, res) => {
  deleteCourse(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Công ty & mã kích hoạt ----------
r.get("/companies", (_req, res) => {
  res.json({ companies: listCompanies(), codes: listCodes(), courses: listCourses().map((c) => ({ id: c.id, title: c.title })) });
});

r.post("/companies", (req, res) => {
  const b = req.body ?? {};
  if (!String(b.name ?? "").trim()) return res.status(400).json({ error: "Nhập tên công ty." });
  res.json({ ok: true, id: createCompany(String(b.name), String(b.taxCode ?? ""), String(b.contact ?? "")) });
});

r.post("/codes", (req, res) => {
  const b = req.body ?? {};
  const db = getDb();
  if (!db.prepare("SELECT id FROM companies WHERE id = ?").get(Number(b.companyId))) return res.status(400).json({ error: "Chọn công ty." });
  const ids = ((b.courseIds ?? []) as unknown[]).map(Number).filter((id) => db.prepare("SELECT 1 FROM courses WHERE id = ?").get(id));
  if (ids.length === 0) return res.status(400).json({ error: "Chọn ít nhất 1 khóa học." });
  const max = Math.round(Number(b.maxUses));
  if (!(max >= 1 && max <= 100000)) return res.status(400).json({ error: "Số lượt dùng phải từ 1 trở lên." });
  if (b.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(b.expiresAt)) return res.status(400).json({ error: "Ngày hết hạn không hợp lệ." });
  res.json({ ok: true, code: createCode(Number(b.companyId), String(b.label ?? ""), ids, max, b.expiresAt || null) });
});

// Khóa / mở lại mã.
r.patch("/codes", (req, res) => {
  const { code, active } = req.body ?? {};
  if (!code || !setCodeActive(String(code), !!active)) return res.status(404).json({ error: "Không tìm thấy mã." });
  res.json({ ok: true });
});

// ---------- Báo cáo ----------
const num = (v: unknown) => (v ? Number(v) : null);

r.get("/reports", (req, res) => {
  const rows = reportRows(num(req.query.company), num(req.query.course)).map((x) => ({ ...x, status: rowStatus(x) }));
  res.json({ rows, companies: listCompanies(), courses: listCourses().map((c) => ({ id: c.id, title: c.title })) });
});

// Xuất CSV (mở trực tiếp bằng Excel, giữ đúng tiếng Việt nhờ BOM UTF-8).
const vn = (s: string | null) => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleDateString("vi-VN") : "");
const cell = (v: unknown) => {
  const s = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // chặn công thức Excel (CSV injection)
  return `"${safe.replace(/"/g, '""')}"`;
};
r.get("/reports/export", (req, res) => {
  const rows = reportRows(num(req.query.company), num(req.query.course));
  const head = ["Công ty", "Họ tên", "Số điện thoại", "Email", "Bộ phận", "Khóa học", "Ngày ghi danh", "Bài đã học", "Tổng số bài", "Số lượt thi", "Điểm cao nhất", "Trạng thái", "Mã chứng nhận", "Ngày cấp", "Hoạt động gần nhất"];
  const lines = rows.map((x) =>
    [x.company, x.name, x.phone, x.email ?? "", x.department, x.course, vn(x.enrolled_at), x.lessons_done, x.lessons_total, x.attempts,
      x.best_score != null ? `${x.best_score}/${x.best_total}` : "", rowStatus(x), x.cert_code ?? "", vn(x.cert_date), vn(x.last_activity)]
      .map(cell).join(",")
  );
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="bao-cao-hoc-vien-${date}.csv"`);
  res.send("﻿" + [head.map(cell).join(","), ...lines].join("\r\n"));
});

// Cấp mật khẩu tạm cho học viên quên mật khẩu (công nhân đăng ký bằng số điện thoại, không nhận được email).
r.post("/users", (req, res) => {
  const db = getDb();
  const u = db.prepare("SELECT id, role FROM users WHERE id = ?").get(Number(req.body?.userId)) as { id: number; role: string } | undefined;
  if (!u || u.role !== "learner") return res.status(404).json({ error: "Không tìm thấy học viên." });
  const temp = "sms" + randomDigits(5); // dễ đọc qua điện thoại: chữ thường + số
  db.prepare("UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?").run(hashPassword(temp), u.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
  res.json({ ok: true, password: temp });
});

export default r;
