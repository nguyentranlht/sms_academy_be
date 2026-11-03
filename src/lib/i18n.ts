// Dịch thông báo lỗi sang tiếng Anh khi người dùng chọn giao diện tiếng Anh (cookie "lang=en", do frontend đặt).
// Mã nguồn vẫn viết lỗi bằng tiếng Việt; middleware bên dưới dịch trường "error" ngay trước khi trả về.
import type { NextFunction, Request, Response } from "express";

export type Lang = "vi" | "en";
export const langOf = (req: Request): Lang => (req.cookies?.lang === "en" ? "en" : "vi");

const exact: Record<string, string> = {
  "Không tìm thấy.": "Not found.",
  "Dữ liệu gửi lên không hợp lệ.": "The submitted data is invalid.",
  "Dữ liệu đã tồn tại.": "This data already exists.",
  "Lỗi máy chủ. Vui lòng thử lại.": "Server error. Please try again.",
  "Bạn cần đăng nhập.": "You need to sign in.",
  "Chỉ quản trị viên được thực hiện.": "Only administrators can do this.",
  "Không tìm thấy khóa học.": "Course not found.",
  "Không tìm thấy khóa học": "Course not found.",
  "Bạn chưa được ghi danh vào khóa học này.": "You're not enrolled in this course.",
  "Không tìm thấy bài học": "Lesson not found.",
  "Bài học này đang bị khóa. Hãy hoàn thành các bài trước.": "This lesson is locked. Complete the previous lessons first.",
  "Bạn chưa mở bài học này.": "You haven't opened this lesson yet.",
  "Không tìm thấy lượt thi": "Quiz attempt not found.",
  "Lượt thi này đã nộp.": "This attempt has already been submitted.",
  "Đề thi vừa được cập nhật. Hãy bắt đầu lại bài kiểm tra (lượt này không bị tính).":
    "The quiz was just updated. Please start again (this attempt won't count).",
  "Bạn cần hoàn thành tất cả bài học trước khi làm bài kiểm tra.": "Complete all lessons before taking the quiz.",
  "Bạn đã hết lượt thi.": "You have no attempts left.",
  "Bạn cần hoàn thành các bài trước theo thứ tự.": "Complete the previous lessons in order first.",
  "Bạn cần đọc đến cuối tài liệu.": "Read to the end of the document first.",
  "Chưa ghi nhận được thời lượng video. Hãy phát video.": "Video length not detected yet. Please play the video.",
  "Họ và tên không được để trống.": "Full name can't be empty.",
  "Số điện thoại không đúng. Nhập 10 số, ví dụ 0901234567.": "Invalid phone number. Enter 10 digits, e.g. 0901234567.",
  "Tài khoản của bạn đăng nhập bằng số điện thoại nên không thể để trống.": "Your account signs in with a phone number, so it can't be empty.",
  "Số điện thoại này đã thuộc về tài khoản khác.": "This phone number belongs to another account.",
  "Mật khẩu hiện tại không đúng.": "Current password is incorrect.",
  "Mật khẩu cần ít nhất 8 ký tự.": "Password must be at least 8 characters.",
  "Mật khẩu cần có cả chữ và số.": "Password must contain both letters and numbers.",
  "Thử quá nhiều lần. Vui lòng đợi 15 phút.": "Too many attempts. Please wait 15 minutes.",
  "Bạn đã thử quá nhiều lần. Hãy đợi 15 phút.": "Too many attempts. Please wait 15 minutes.",
  "Bạn đã thử quá nhiều lần.": "Too many attempts.",
  "Thử lại sau.": "Please try again later.",
  "Mã kích hoạt không đúng hoặc đã bị khóa.": "The activation code is invalid or has been disabled.",
  "Mã kích hoạt đã hết hạn.": "The activation code has expired.",
  "Mã kích hoạt đã dùng hết số lượt.": "The activation code has no uses left.",
  "Bạn đã có tất cả khóa học của mã này.": "You already have all courses from this code.",
  "Số điện thoại/email hoặc mật khẩu không đúng.": "Incorrect phone number/email or password.",
  "Hãy nhập họ và tên.": "Please enter your full name.",
  "Hãy nhập số điện thoại (hoặc email) để đăng nhập.": "Please enter a phone number (or email) to sign in with.",
  "Email không hợp lệ.": "Invalid email.",
  "Bạn cần đồng ý với điều khoản sử dụng.": "You need to agree to the terms of use.",
  "Số điện thoại này đã có tài khoản. Hãy đăng nhập.": "This phone number already has an account. Please sign in.",
  "Email này đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu.": "This email already has an account. Sign in or use Forgot password.",
  "Bạn đã yêu cầu quá nhiều lần. Hãy thử lại sau 1 giờ.": "Too many requests. Please try again in 1 hour.",
  "Hãy đợi 1 phút rồi gửi lại.": "Please wait 1 minute before resending.",
  "Mã đã hết hạn. Hãy gửi lại mã mới.": "The code has expired. Please request a new one.",
  "Nhập sai quá 5 lần. Hãy gửi lại mã mới.": "Too many wrong attempts. Please request a new code.",
  "Mã xác nhận không đúng.": "Incorrect verification code.",
  "Dữ liệu không hợp lệ.": "Invalid data.",
  "Nhập tên công ty.": "Enter a company name.",
  "Chọn công ty.": "Choose a company.",
  "Chọn ít nhất 1 khóa học.": "Choose at least 1 course.",
  "Số lượt dùng phải từ 1 trở lên.": "Max uses must be 1 or more.",
  "Ngày hết hạn không hợp lệ.": "Invalid expiry date.",
  "Không tìm thấy mã.": "Code not found.",
  "Không tìm thấy học viên.": "Learner not found.",
  "Tra cứu quá nhiều lần. Thử lại sau 1 phút.": "Too many lookups. Try again in 1 minute.",
  "Không tìm thấy chứng nhận.": "Certificate not found.",
  "Khóa học cần có tên.": "The course needs a title.",
  "Khóa học cần có nhóm (ví dụ: An toàn thực phẩm).": "The course needs a category (e.g. Food safety).",
  "Khóa học cần ít nhất 1 bài học.": "The course needs at least 1 lesson.",
  "Cần ít nhất 1 câu hỏi trong ngân hàng câu hỏi.": "The question bank needs at least 1 question.",
  "Số câu mỗi lượt thi phải từ 1 trở lên.": "Questions per attempt must be 1 or more.",
  "Số lượt thi tối đa phải từ 1 đến 10.": "Max attempts must be between 1 and 10.",
};

// Thông báo có số/tên chèn vào.
const patterns: [RegExp, (...m: string[]) => string][] = [
  [/^Bạn cần đọc tối thiểu (\d+) giây \(mới (\d+) giây\)\.$/, (a, b) => `You need to read for at least ${a} seconds (so far ${b}).`],
  [/^Bạn cần xem tối thiểu (\d+)% video\.$/, (p) => `You need to watch at least ${p}% of the video.`],
  [/^Số câu mỗi lượt thi \((\d+)\) lớn hơn số câu trong ngân hàng \((\d+)\)\.$/, (a, b) => `Questions per attempt (${a}) exceeds the question bank size (${b}).`],
  [/^Bài (\d+): thiếu tên bài\.$/, (n) => `Lesson ${n}: missing title.`],
  [/^Bài (\d+): link hoặc mã video YouTube không hợp lệ\.$/, (n) => `Lesson ${n}: invalid YouTube link or video ID.`],
  [/^Bài (\d+): tài liệu đọc quá ngắn \(cần ít nhất 20 chữ\)\.$/, (n) => `Lesson ${n}: reading is too short (at least 20 words).`],
  [/^Câu hỏi (\d+): thiếu nội dung câu hỏi\.$/, (n) => `Question ${n}: missing question text.`],
  [/^Câu hỏi (\d+): cần ít nhất 2 đáp án\.$/, (n) => `Question ${n}: needs at least 2 answers.`],
  [/^Câu hỏi (\d+): hãy chọn đáp án đúng\.$/, (n) => `Question ${n}: choose the correct answer.`],
];

export function translateError(msg: string, lang: Lang): string {
  if (lang === "vi") return msg;
  if (exact[msg]) return exact[msg];
  for (const [re, fn] of patterns) {
    const m = msg.match(re);
    if (m) return fn(...m.slice(1));
  }
  return msg;
}

/** Bọc res.json: dịch trường "error" theo ngôn ngữ của người dùng. */
export function translateErrors(req: Request, res: Response, next: NextFunction) {
  const lang = langOf(req);
  if (lang !== "vi") {
    const json = res.json.bind(res);
    res.json = (body?: unknown) => {
      if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
        body = { ...body, error: translateError((body as { error: string }).error, lang) };
      }
      return json(body);
    };
  }
  next();
}
