// Dữ liệu khóa học mẫu cho bản demo. Có thể sửa/thêm ở trang /admin.
// Bài học có 2 loại:
//   - "video":   video YouTube, phải xem tối thiểu 95% thời lượng, không tua nhanh được.
//   - "reading": tài liệu đọc, phải cuộn đến cuối và ở lại đủ thời gian đọc tối thiểu.
// Văn bản tài liệu: mỗi đoạn cách nhau 1 dòng trống, dòng bắt đầu bằng "## " là tiêu đề mục, "- " là gạch đầu dòng.
export type SeedLesson = {
  kind: "video" | "reading";
  title: string;
  youtubeId?: string;
  content: string; // tóm tắt ngắn
  body?: string; // nội dung tài liệu đọc
  minSeconds?: number; // thời gian đọc tối thiểu (bỏ trống = tự tính theo số chữ)
};
export type SeedQuestion = { question: string; options: string[]; answer: number; explanation: string };
export type SeedCourse = {
  title: string;
  category: string;
  level: string;
  description: string;
  quizSize: number; // số câu rút ngẫu nhiên mỗi lượt thi
  maxAttempts: number; // số lượt thi tối đa trước khi phải học lại
  lessons: SeedLesson[];
  questions: SeedQuestion[]; // ngân hàng câu hỏi
};

export const seedCourses: SeedCourse[] = [
  {
    title: "FSSC 22000 – Nhận thức cơ bản",
    category: "An toàn thực phẩm",
    level: "Cơ bản",
    description:
      "Tổng quan về chương trình chứng nhận FSSC 22000: cấu trúc ISO 22000 + PRP (ISO/TS 22002) + yêu cầu bổ sung, phạm vi áp dụng và lộ trình chứng nhận cho nhà máy thực phẩm, thức ăn chăn nuôi.",
    quizSize: 4,
    maxAttempts: 3,
    lessons: [
      {
        kind: "video",
        title: "FSSC 22000 là gì?",
        youtubeId: "NJvN9jSTuPQ",
        content:
          "FSSC 22000 là chương trình chứng nhận hệ thống quản lý an toàn thực phẩm được GFSI công nhận, gồm ISO 22000, chương trình tiên quyết theo ngành và các yêu cầu bổ sung của FSSC.",
      },
      {
        kind: "reading",
        title: "Tài liệu: Cấu trúc FSSC 22000 và yêu cầu bổ sung",
        content: "Đọc kỹ ba thành phần của FSSC 22000 và các yêu cầu bổ sung mà đánh giá viên thường hỏi.",
        body: `## 1. Ba thành phần của FSSC 22000

Chương trình FSSC 22000 không phải là một tiêu chuẩn đơn lẻ. Doanh nghiệp được đánh giá theo ba bộ yêu cầu cùng lúc, và chỉ được cấp chứng nhận khi đáp ứng đủ cả ba.

- ISO 22000:2018: hệ thống quản lý an toàn thực phẩm, áp dụng cấu trúc cấp cao giống ISO 9001 và kết hợp các nguyên tắc HACCP.
- Chương trình tiên quyết (PRP) theo ngành: ví dụ ISO/TS 22002-1 cho sản xuất thực phẩm, ISO/TS 22002-6 cho sản xuất thức ăn chăn nuôi, ISO/TS 22002-4 cho sản xuất bao bì.
- Các yêu cầu bổ sung của FSSC: những yêu cầu riêng mà tổ chức FSSC thêm vào để chương trình được GFSI công nhận.

## 2. Yêu cầu bổ sung đáng chú ý

Các yêu cầu bổ sung thường là nơi doanh nghiệp bị phát hiện điểm không phù hợp khi đánh giá lần đầu. Người học cần nhớ những nhóm sau:

- Quản lý dịch vụ và nguyên vật liệu mua vào, bao gồm phòng thí nghiệm bên ngoài phải có năng lực phù hợp (thường là ISO/IEC 17025).
- Ghi nhãn sản phẩm theo quy định của nước tiêu thụ.
- Phòng vệ thực phẩm (food defense) và giảm thiểu gian lận thực phẩm (food fraud), mỗi nội dung cần có đánh giá mối đe dọa và kế hoạch bằng văn bản.
- Quản lý chất gây dị ứng và chương trình giám sát môi trường.
- Văn hóa an toàn thực phẩm: lãnh đạo phải có mục tiêu, kế hoạch truyền thông và đo lường.
- Kiểm soát chất lượng và giảm thất thoát, lãng phí thực phẩm.

## 3. Đánh giá không báo trước

Trong mỗi chu kỳ chứng nhận ba năm, ít nhất một lần đánh giá giám sát phải là đánh giá không báo trước. Điều này có nghĩa là hệ thống phải được vận hành thực chất hằng ngày, không chỉ chuẩn bị khi biết ngày đánh giá.

## 4. Lưu ý khi chuẩn bị

Doanh nghiệp nên bắt đầu bằng đánh giá khoảng cách (gap assessment), sau đó xây dựng tài liệu, đào tạo, vận hành ít nhất vài tháng để có hồ sơ, đánh giá nội bộ và xem xét của lãnh đạo trước khi mời tổ chức chứng nhận đánh giá giai đoạn 1 và giai đoạn 2.`,
      },
      {
        kind: "video",
        title: "Lộ trình chứng nhận cho doanh nghiệp",
        youtubeId: "2vh73MPAR8M",
        content:
          "Các bước điển hình: đánh giá khoảng cách → xây dựng hệ thống tài liệu → đào tạo → vận hành và đánh giá nội bộ → xem xét của lãnh đạo → đánh giá chứng nhận giai đoạn 1 và 2.",
      },
    ],
    questions: [
      { question: "FSSC 22000 được tổ chức nào công nhận ở cấp toàn cầu?", options: ["GFSI", "ILO", "WHO", "ASEAN"], answer: 0, explanation: "FSSC 22000 là chương trình được GFSI (Global Food Safety Initiative) công nhận." },
      { question: "Thành phần nào KHÔNG thuộc FSSC 22000?", options: ["ISO 22000", "ISO/TS 22002-x (PRP)", "Yêu cầu bổ sung FSSC", "ISO 45001"], answer: 3, explanation: "ISO 45001 là tiêu chuẩn an toàn sức khỏe nghề nghiệp, không thuộc FSSC 22000." },
      { question: "Bước nào thường làm đầu tiên khi doanh nghiệp bắt đầu áp dụng FSSC 22000?", options: ["Đánh giá chứng nhận giai đoạn 2", "Đánh giá khoảng cách (gap)", "Xem xét của lãnh đạo", "Tái chứng nhận"], answer: 1, explanation: "Đánh giá khoảng cách giúp xác định hiện trạng trước khi xây dựng hệ thống." },
      { question: "Nhà máy thức ăn chăn nuôi áp dụng PRP theo tiêu chuẩn nào?", options: ["ISO/TS 22002-1", "ISO/TS 22002-4", "ISO/TS 22002-6", "ISO 9001"], answer: 2, explanation: "ISO/TS 22002-6 dành cho sản xuất thức ăn chăn nuôi." },
      { question: "Trong một chu kỳ chứng nhận 3 năm, FSSC yêu cầu ít nhất bao nhiêu lần đánh giá không báo trước?", options: ["Không có", "1 lần", "2 lần", "Mỗi năm 1 lần"], answer: 1, explanation: "Ít nhất một lần đánh giá giám sát trong chu kỳ phải là đánh giá không báo trước." },
      { question: "Phòng thí nghiệm bên ngoài mà doanh nghiệp thuê nên có năng lực theo tiêu chuẩn nào?", options: ["ISO/IEC 17025", "ISO 14001", "SA8000", "ISO 27001"], answer: 0, explanation: "Yêu cầu bổ sung về dịch vụ mua vào: phòng thí nghiệm nên đạt ISO/IEC 17025." },
      { question: "Yêu cầu bổ sung nào liên quan đến hành vi cố ý làm hại sản phẩm?", options: ["Ghi nhãn", "Phòng vệ thực phẩm (food defense)", "Giảm lãng phí thực phẩm", "Giám sát môi trường"], answer: 1, explanation: "Food defense xử lý các mối đe dọa cố ý; food fraud xử lý gian lận vì lợi ích kinh tế." },
    ],
  },
  {
    title: "Phòng ngừa lao động trẻ em trong chuỗi cung ứng",
    category: "Tuân thủ lao động",
    level: "Cơ bản",
    description:
      "Khóa nhận thức cho quản lý nhân sự và nhà cung cấp: khái niệm lao động trẻ em, lao động chưa thành niên, quy định của Bộ luật Lao động 2019 và công ước ILO, cách kiểm tra tuổi khi tuyển dụng.",
    quizSize: 4,
    maxAttempts: 3,
    lessons: [
      {
        kind: "video",
        title: "Lao động trẻ em: thực trạng toàn cầu",
        youtubeId: "3yahcMtUlcU",
        content:
          "Theo ILO, hàng trăm triệu trẻ em vẫn đang phải làm việc. Khách hàng và các bộ quy tắc ứng xử yêu cầu doanh nghiệp xuất khẩu chứng minh không sử dụng lao động trẻ em.",
      },
      {
        kind: "reading",
        title: "Tài liệu: Quy định pháp luật Việt Nam về lao động chưa thành niên",
        content: "Các mốc tuổi, công việc bị cấm và hồ sơ phải lưu theo Bộ luật Lao động 2019.",
        body: `## 1. Các mốc tuổi cần nhớ

Bộ luật Lao động 2019 (Điều 143) định nghĩa lao động chưa thành niên là người lao động chưa đủ 18 tuổi. Trong nhóm này, pháp luật chia thành ba mức với mức độ bảo vệ khác nhau:

- Từ đủ 15 đến dưới 18 tuổi: được làm việc nhưng không được làm công việc nặng nhọc, độc hại, nguy hiểm theo danh mục của Bộ Lao động – Thương binh và Xã hội.
- Từ đủ 13 đến dưới 15 tuổi: chỉ được làm các công việc nhẹ theo danh mục quy định.
- Dưới 13 tuổi: chỉ được làm một số công việc nghệ thuật, thể dục thể thao và phải bảo đảm không ảnh hưởng đến phát triển thể lực, trí lực.

Đối với nhà máy sản xuất, thực tế các khách hàng quốc tế thường yêu cầu tuổi tối thiểu tuyển dụng là đủ 15 tuổi, nhiều thương hiệu yêu cầu đủ 18 tuổi cho dây chuyền sản xuất.

## 2. Thời giờ làm việc

Lao động từ đủ 15 đến dưới 18 tuổi không được làm việc quá 8 giờ một ngày và 40 giờ một tuần. Chỉ được làm thêm giờ, làm việc ban đêm trong một số nghề, công việc theo danh mục cho phép.

## 3. Hồ sơ doanh nghiệp phải có

Khi đánh giá tuân thủ, đánh giá viên sẽ yêu cầu xem các hồ sơ sau:

- Sổ theo dõi riêng lao động chưa thành niên, ghi họ tên, ngày sinh, công việc, kết quả khám sức khỏe định kỳ.
- Bản sao giấy tờ tùy thân đã đối chiếu với bản gốc khi tuyển dụng.
- Quy trình tuyển dụng có bước kiểm tra tuổi và người chịu trách nhiệm.
- Quy trình khắc phục khi phát hiện lao động trẻ em: không sa thải ngay mà đưa trẻ đến trường, tiếp tục hỗ trợ thu nhập cho gia đình theo thỏa thuận cho đến khi đủ tuổi.

## 4. Dấu hiệu cần cảnh giác

Giấy tờ có ảnh không giống người thật, nhiều người khai cùng ngày sinh, lao động được giới thiệu theo nhóm qua cai thầu, hoặc người lao động không nhớ ngày sinh của mình là những dấu hiệu cần kiểm tra thêm.`,
      },
      {
        kind: "video",
        title: "Công ước ILO số 182 về các hình thức lao động trẻ em tồi tệ nhất",
        youtubeId: "k5SSil8Xb_Y",
        content: "Công ước 182 yêu cầu xóa bỏ các hình thức lao động trẻ em tồi tệ nhất. Việt Nam đã phê chuẩn Công ước 138 (tuổi tối thiểu) và 182.",
      },
    ],
    questions: [
      { question: "Theo Bộ luật Lao động 2019, người lao động chưa thành niên là người:", options: ["Dưới 15 tuổi", "Dưới 16 tuổi", "Dưới 18 tuổi", "Dưới 21 tuổi"], answer: 2, explanation: "Điều 143 BLLĐ 2019: lao động chưa thành niên là người lao động chưa đủ 18 tuổi." },
      { question: "Khi tuyển dụng, biện pháp kiểm soát tuổi hiệu quả nhất là:", options: ["Hỏi tuổi bằng miệng", "Đối chiếu giấy tờ tùy thân bản gốc và lưu bản sao", "Nhìn ngoại hình", "Tin theo lời giới thiệu"], answer: 1, explanation: "Đối chiếu giấy tờ bản gốc và lưu hồ sơ là bằng chứng khi bị đánh giá." },
      { question: "Công ước ILO nào nói về các hình thức lao động trẻ em tồi tệ nhất?", options: ["Công ước 29", "Công ước 87", "Công ước 138", "Công ước 182"], answer: 3, explanation: "Công ước số 182 (1999) về các hình thức lao động trẻ em tồi tệ nhất." },
      { question: "Lao động từ đủ 15 đến dưới 18 tuổi được làm việc tối đa bao nhiêu giờ một tuần?", options: ["40 giờ", "44 giờ", "48 giờ", "Không giới hạn"], answer: 0, explanation: "Không quá 8 giờ/ngày và 40 giờ/tuần." },
      { question: "Khi phát hiện lao động trẻ em, cách xử lý đúng là:", options: ["Sa thải ngay và không trả lương", "Che giấu khi đánh giá", "Đưa trẻ đến trường và hỗ trợ thu nhập theo kế hoạch khắc phục", "Chuyển sang làm ca đêm"], answer: 2, explanation: "Quy trình khắc phục phải đặt lợi ích của trẻ lên trước, không sa thải bỏ mặc." },
      { question: "Dấu hiệu nào cần kiểm tra thêm khi tuyển dụng?", options: ["Ứng viên có CCCD gắn chip", "Nhiều người cùng nhóm cai thầu khai cùng ngày sinh", "Ứng viên có sổ BHXH", "Ứng viên đã từng làm ở công ty khác"], answer: 1, explanation: "Nhiều hồ sơ trùng ngày sinh qua cùng một cai thầu là dấu hiệu giấy tờ có thể không thật." },
      { question: "Hồ sơ nào doanh nghiệp phải lập riêng cho lao động chưa thành niên?", options: ["Sổ theo dõi lao động chưa thành niên", "Sổ quỹ tiền mặt", "Sổ nhập xuất kho", "Không cần hồ sơ riêng"], answer: 0, explanation: "Phải có sổ theo dõi riêng gồm ngày sinh, công việc, khám sức khỏe." },
    ],
  },
  {
    title: "HACCP – 7 nguyên tắc",
    category: "An toàn thực phẩm",
    level: "Cơ bản",
    description:
      "Nắm vững 7 nguyên tắc HACCP theo Codex: phân tích mối nguy, xác định CCP, giới hạn tới hạn, giám sát, hành động khắc phục, thẩm tra và lưu hồ sơ.",
    quizSize: 3,
    maxAttempts: 3,
    lessons: [
      {
        kind: "video",
        title: "HACCP là gì? Tổng quan 7 nguyên tắc",
        youtubeId: "qimxhiWMf94",
        content: "HACCP là hệ thống phòng ngừa, tập trung kiểm soát các mối nguy sinh học, hóa học, vật lý (và chất gây dị ứng) tại các điểm kiểm soát tới hạn.",
      },
      {
        kind: "reading",
        title: "Tài liệu: 7 nguyên tắc HACCP theo Codex",
        content: "Đọc và ghi nhớ thứ tự 7 nguyên tắc, kèm ví dụ tại nhà máy.",
        body: `## Trước khi áp dụng 7 nguyên tắc

Codex quy định 5 bước chuẩn bị: lập đội HACCP, mô tả sản phẩm, xác định mục đích sử dụng, xây dựng sơ đồ quy trình và thẩm tra sơ đồ tại hiện trường. Sau đó mới đến 7 nguyên tắc.

## Nguyên tắc 1 – Phân tích mối nguy

Liệt kê mối nguy sinh học, hóa học, vật lý và chất gây dị ứng ở từng công đoạn, đánh giá mức độ nghiêm trọng và khả năng xảy ra, rồi xác định biện pháp kiểm soát.

## Nguyên tắc 2 – Xác định điểm kiểm soát tới hạn (CCP)

Dùng cây quyết định để tìm các công đoạn mà tại đó việc kiểm soát là thiết yếu để loại bỏ hoặc giảm mối nguy đến mức chấp nhận được. Ví dụ: công đoạn nấu, dò kim loại.

## Nguyên tắc 3 – Thiết lập giới hạn tới hạn

Mỗi CCP cần một giá trị đo được để phân biệt chấp nhận và không chấp nhận, ví dụ nhiệt độ tâm sản phẩm ít nhất 75°C, mẫu thử Fe 1,5 mm phải bị máy dò phát hiện.

## Nguyên tắc 4 – Thiết lập hệ thống giám sát

Quy định ai đo, đo gì, bằng thiết bị nào, tần suất bao lâu và ghi vào biểu mẫu nào.

## Nguyên tắc 5 – Hành động khắc phục

Khi giám sát cho thấy vượt giới hạn tới hạn: cô lập sản phẩm bị ảnh hưởng, đánh giá và xử lý, tìm nguyên nhân và đưa CCP về trạng thái kiểm soát.

## Nguyên tắc 6 – Thẩm tra

Kiểm tra lại hệ thống có hoạt động hiệu quả không: xem xét hồ sơ, hiệu chuẩn thiết bị, lấy mẫu kiểm nghiệm, đánh giá nội bộ.

## Nguyên tắc 7 – Lưu hồ sơ và tài liệu

Hồ sơ giám sát, hành động khắc phục và thẩm tra là bằng chứng duy nhất cho thấy sản phẩm đã được sản xuất an toàn.`,
      },
    ],
    questions: [
      { question: "Nguyên tắc 1 của HACCP là gì?", options: ["Lưu hồ sơ", "Phân tích mối nguy", "Thẩm tra", "Hành động khắc phục"], answer: 1, explanation: "Nguyên tắc 1: tiến hành phân tích mối nguy." },
      { question: "CCP là viết tắt của:", options: ["Critical Control Point", "Common Control Plan", "Corrective Control Procedure", "Critical Check Point"], answer: 0, explanation: "CCP = Critical Control Point – điểm kiểm soát tới hạn." },
      { question: "Khi kết quả giám sát vượt giới hạn tới hạn, việc đầu tiên cần làm là:", options: ["Tiếp tục sản xuất", "Cô lập sản phẩm bị ảnh hưởng", "Sửa số liệu trên biểu mẫu", "Chờ đánh giá nội bộ"], answer: 1, explanation: "Nguyên tắc 5: cô lập sản phẩm, đánh giá, xử lý và đưa CCP về kiểm soát." },
      { question: "Hiệu chuẩn thiết bị đo thuộc nguyên tắc nào?", options: ["Nguyên tắc 2", "Nguyên tắc 3", "Nguyên tắc 6 – Thẩm tra", "Nguyên tắc 7"], answer: 2, explanation: "Hiệu chuẩn là một hoạt động thẩm tra." },
      { question: "Codex quy định bao nhiêu bước chuẩn bị trước 7 nguyên tắc?", options: ["3", "5", "7", "12"], answer: 1, explanation: "5 bước chuẩn bị + 7 nguyên tắc = 12 bước áp dụng HACCP." },
    ],
  },
];
