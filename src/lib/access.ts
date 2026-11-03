import { enrolledCourseIds, one } from "./db";
import type { User } from "./auth";

/** Học viên chỉ học được khóa đã ghi danh (qua mã kích hoạt). Quản trị viên xem được mọi khóa. */
export async function canAccess(u: User, courseId: number) {
  return u.role === "admin" || (await enrolledCourseIds(u.id)).has(courseId);
}

export async function courseOfLesson(lessonId: number): Promise<number | null> {
  if (!Number.isSafeInteger(lessonId)) return null;
  const r = await one<{ course_id: number }>("SELECT course_id FROM lessons WHERE id = $1", [lessonId]);
  return r?.course_id ?? null;
}
export async function courseOfQuizSession(id: string): Promise<number | null> {
  const r = await one<{ course_id: number }>("SELECT course_id FROM quiz_sessions WHERE id = $1", [id]);
  return r?.course_id ?? null;
}
