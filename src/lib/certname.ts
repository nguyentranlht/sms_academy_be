// Tên in trên chứng nhận: chữ in hoa, không dấu (vd "Nguyễn Thị Mai" → "NGUYEN THI MAI").
export const certName = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/\s+/g, " ").trim().toUpperCase().slice(0, 80);
