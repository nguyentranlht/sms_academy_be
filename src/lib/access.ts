import { enrolledCourseIds, getDb } from "./db";
import type { User } from "./auth";

/** Học viên chỉ học được khóa đã ghi danh (qua mã kích hoạt). Quản trị viên xem được mọi khóa. */
export function canAccess(u: User, courseId: number) {
  return u.role === "admin" || enrolledCourseIds(u.id).has(courseId);
}

export function courseOfLesson(lessonId: number): number | null {
  const r = getDb().prepare("SELECT course_id FROM lessons WHERE id = ?").get(lessonId) as { course_id: number } | undefined;
  return r?.course_id ?? null;
}
export function courseOfQuizSession(id: string): number | null {
  const r = getDb().prepare("SELECT course_id FROM quiz_sessions WHERE id = ?").get(id) as { course_id: number } | undefined;
  return r?.course_id ?? null;
}
