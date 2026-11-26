import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CashReceipt } from "./supabase/cash-receipt";

function printable(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "-");
}

export async function createCashReceiptPdf(receipt: CashReceipt, paper: 58 | 80) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Struk ${receipt.receiptNo} - ${receipt.businessName}`);
  pdf.setCreator("Arus");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = paper === 58 ? 164.4 : 226.8;
  const page = pdf.addPage([width, 380]);
  const margin = 10;
  const ink = rgb(0.12, 0.18, 0.16);
  let y = 355;
  function draw(value: string, emphasis = false, size = 8) {
    const font = emphasis ? bold : regular;
    const max = width - margin * 2;
    let line = "";
    for (const char of printable(value)) {
      if (line && font.widthOfTextAtSize(line + char, size) > max) {
        page.drawText(line.trimEnd(), { x: margin, y, font, size, color: ink }); y -= 12;
        line = "";
      }
      line += char;
    }
    if (line) { page.drawText(line, { x: margin, y, font, size, color: ink }); y -= 13; }
  }
  function rule() { y -= 3; page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.6, color: ink }); y -= 13; }
  draw(receipt.businessName, true, 11);
  draw("STRUK PENJUALAN TUNAI", true);
  rule();
  draw(receipt.receiptNo, true);
  draw(`Tanggal: ${receipt.date}`);
  draw(`Diterima di: ${receipt.cashName}`);
  rule();
  draw(receipt.description);
  rule();
  draw(`TOTAL: Rp ${receipt.amount.toLocaleString("id-ID")}`, true, 10);
  if (receipt.corrected) { rule(); draw("DIKOREKSI - jangan gunakan sebagai bukti transaksi aktif", true); }
  rule();
  draw("Dibukukan di Arus.", false, 7);
  if (y < 10) throw new Error("Isi struk terlalu panjang untuk ukuran kertas.");
  return pdf.save();
}
