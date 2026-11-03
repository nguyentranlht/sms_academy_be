// /api/admin – chỉ quản trị viên: tổng quan, soạn khóa học, công ty & mã kích hoạt, báo cáo, cấp lại mật khẩu.
import { Router } from "express";
import {
  courseProblem, courseStats, createCode, createCompany, dashboardStats, listCodes, listCompanies,
  reportRows, rowStatus, saveCourse, setCodeActive, type CourseInput,
} from "../lib/admin";
import { deleteCourse, exec, getCourse, listCourses, NOW, one, rows, tx } from "../lib/db";
import { requireAdmin } from "../lib/auth";
import { langOf } from "../lib/i18n";
import { hashPassword, randomDigits } from "../lib/crypto";

const r = Router();
r.use(requireAdmin);

const courseOptions = async () => (await listCourses()).map((c) => ({ id: c.id, title: c.title }));

// ---------- Tổng quan ----------
r.get("/dashboard", async (_req, res) => {
  const recent = await rows("SELECT code, holder_name, course_title, company_name, score, total, issued_at FROM certificates ORDER BY issued_at DESC LIMIT 6");
  res.json({ stats: await dashboardStats(), courses: await courseStats(), recent });
});

// ---------- Khóa học ----------
r.get("/courses/:id", async (req, res) => {
  const data = await getCourse(Number(req.params.id));
  if (!data) return res.status(404).json({ error: "Không tìm thấy khóa học." });
  res.json(data);
});

r.post("/courses", async (req, res) => {
  const body = req.body as CourseInput | undefined;
  if (!body) return res.status(400).json({ error: "Dữ liệu không hợp lệ." });
  const problem = courseProblem(body);
  if (problem) return res.status(400).json({ error: problem });
  res.json({ ok: true, id: await saveCourse(null, body) });
});

r.put("/courses/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!(await getCourse(id))) return res.status(404).json({ error: "Không tìm thấy khóa học." });
  const body = req.body as CourseInput | undefined;
  if (!body) return res.status(400).json({ error: "Dữ liệu không hợp lệ." });
  const problem = courseProblem(body);
  if (problem) return res.status(400).json({ error: problem });
  await saveCourse(id, body);
  res.json({ ok: true, id });
});

r.delete("/courses/:id", async (req, res) => {
  await deleteCourse(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Công ty & mã kích hoạt ----------
r.get("/companies", async (_req, res) => {
  res.json({ companies: await listCompanies(), codes: await listCodes(), courses: await courseOptions() });
});

r.post("/companies", async (req, res) => {
  const b = req.body ?? {};
  if (!String(b.name ?? "").trim()) return res.status(400).json({ error: "Nhập tên công ty." });
  res.json({ ok: true, id: await createCompany(String(b.name), String(b.taxCode ?? ""), String(b.contact ?? "")) });
});

r.post("/codes", async (req, res) => {
  const b = req.body ?? {};
  const companyId = Number(b.companyId);
  if (!Number.isSafeInteger(companyId) || !(await one("SELECT id FROM companies WHERE id = $1", [companyId])))
    return res.status(400).json({ error: "Chọn công ty." });
  const wanted = ((b.courseIds ?? []) as unknown[]).map(Number).filter(Number.isSafeInteger);
  const ids = (await rows<{ id: number }>("SELECT id FROM courses WHERE id = ANY($1::int[]) ORDER BY id", [wanted])).map((x) => x.id);
  if (ids.length === 0) return res.status(400).json({ error: "Chọn ít nhất 1 khóa học." });
  const max = Math.round(Number(b.maxUses));
  if (!(max >= 1 && max <= 100000)) return res.status(400).json({ error: "Số lượt dùng phải từ 1 trở lên." });
  if (b.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(b.expiresAt)) return res.status(400).json({ error: "Ngày hết hạn không hợp lệ." });
  res.json({ ok: true, code: await createCode(companyId, String(b.label ?? ""), ids, max, b.expiresAt || null) });
});

// Khóa / mở lại mã.
r.patch("/codes", async (req, res) => {
  const { code, active } = req.body ?? {};
  if (!code || !(await setCodeActive(String(code), !!active))) return res.status(404).json({ error: "Không tìm thấy mã." });
  res.json({ ok: true });
});

// ---------- Báo cáo ----------
const num = (v: unknown) => (v ? Number(v) : null);

r.get("/reports", async (req, res) => {
  const list = (await reportRows(num(req.query.company), num(req.query.course))).map((x) => ({ ...x, status: rowStatus(x) }));
  res.json({ rows: list, companies: await listCompanies(), courses: await courseOptions() });
});

// Xuất CSV (mở trực tiếp bằng Excel, giữ đúng tiếng Việt nhờ BOM UTF-8).
const csvHead = {
  vi: ["Công ty", "Họ tên", "Số điện thoại", "Email", "Bộ phận", "Khóa học", "Ngày ghi danh", "Bài đã học", "Tổng số bài", "Số lượt thi", "Điểm cao nhất", "Trạng thái", "Mã chứng nhận", "Ngày cấp", "Hoạt động gần nhất"],
  en: ["Company", "Name", "Phone", "Email", "Department", "Course", "Enrolled", "Lessons done", "Total lessons", "Attempts", "Best score", "Status", "Certificate code", "Issued", "Last activity"],
};
const statusEn: Record<string, string> = { "Đạt": "Passed", "Chưa bắt đầu": "Not started", "Đang học": "In progress", "Chờ thi / chưa đạt": "Awaiting quiz / not passed" };
const cell = (v: unknown) => {
  const s = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // chặn công thức Excel (CSV injection)
  return `"${safe.replace(/"/g, '""')}"`;
};
r.get("/reports/export", async (req, res) => {
  const list = await reportRows(num(req.query.company), num(req.query.course));
  const lang = langOf(req);
  const head = csvHead[lang];
  const vn = (s: string | null) => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleDateString(lang === "en" ? "en-GB" : "vi-VN") : "");
  const status = (x: Parameters<typeof rowStatus>[0]) => (lang === "en" ? statusEn[rowStatus(x)] : rowStatus(x));
  const lines = list.map((x) =>
    [x.company, x.name, x.phone, x.email ?? "", x.department, x.course, vn(x.enrolled_at), x.lessons_done, x.lessons_total, x.attempts,
      x.best_score != null ? `${x.best_score}/${x.best_total}` : "", status(x), x.cert_code ?? "", vn(x.cert_date), vn(x.last_activity)]
      .map(cell).join(",")
  );
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${lang === "en" ? "learner-report" : "bao-cao-hoc-vien"}-${date}.csv"`);
  res.send("﻿" + [head.map(cell).join(","), ...lines].join("\r\n"));
});

// Cấp mật khẩu tạm cho học viên quên mật khẩu (công nhân đăng ký bằng số điện thoại, không nhận được email).
r.post("/users", async (req, res) => {
  const userId = Number(req.body?.userId);
  const u = Number.isSafeInteger(userId) ? await one<{ id: number; role: string }>("SELECT id, role FROM users WHERE id = $1", [userId]) : undefined;
  if (!u || u.role !== "learner") return res.status(404).json({ error: "Không tìm thấy học viên." });
  const temp = "sms" + randomDigits(5); // dễ đọc qua điện thoại: chữ thường + số
  await tx(async (db) => {
    await exec(`UPDATE users SET password_hash = $1, password_changed_at = ${NOW} WHERE id = $2`, [hashPassword(temp), u.id], db);
    await exec("DELETE FROM sessions WHERE user_id = $1", [u.id], db);
  });
  res.json({ ok: true, password: temp });
});

export default r;
