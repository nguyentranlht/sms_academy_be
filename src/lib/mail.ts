// Gửi email. Bản này chưa nối dịch vụ email thật:
//  - Mã xác nhận được in ra cửa sổ chạy server (terminal).
//  - Khi DEMO_SHOW_CODES=1 (mặc định ở chế độ dev), mã còn hiện ngay trên màn hình để thử nhanh.
// Khi triển khai thật: thay hàm sendMail bằng SMTP (nodemailer) hoặc dịch vụ như SendGrid, Amazon SES.
export async function sendMail(to: string, subject: string, text: string) {
  console.log(`\n[EMAIL] Tới: ${to}\nTiêu đề: ${subject}\n${text}\n`);
}

export const showCodesOnScreen = () =>
  process.env.DEMO_SHOW_CODES === "1" || (process.env.NODE_ENV !== "production" && process.env.DEMO_SHOW_CODES !== "0");
