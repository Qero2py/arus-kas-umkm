import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Invoice } from "./supabase/invoice";

function printable(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "-");
}

function lines(value: string, font: PDFFont, size: number, width: number) {
  const words = printable(value).split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let current = "";
  for (const word of words) {
    if (font.widthOfTextAtSize(current ? `${current} ${word}` : word, size) <= width) {
      current = current ? `${current} ${word}` : word;
      continue;
    }
    if (current) result.push(current);
    current = "";
    for (const char of word) {
      if (current && font.widthOfTextAtSize(current + char, size) > width) {
        result.push(current);
        current = "";
      }
      current += char;
    }
  }
  if (current) result.push(current);
  return result.length ? result : [""];
}

export async function createInvoicePdf(invoice: Invoice, paper: 58 | 80) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${invoice.documentNo} - ${invoice.businessName}`);
  pdf.setCreator("Arus");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = paper === 58 ? 164.4 : 226.8;
  const page = pdf.addPage([width, 580]);
  const margin = 10;
  const maxWidth = width - margin * 2;
  let y = 558;
  const ink = rgb(0.12, 0.18, 0.16);
  const divider = () => { page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.6, color: ink }); y -= 13; };
  const draw = (value: string, font = regular, size = 8, gap = 12) => {
    for (const line of lines(value, font, size, maxWidth)) {
      page.drawText(line, { x: margin, y, font, size, color: ink });
      y -= gap;
    }
  };
  const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
  draw(invoice.businessName, bold, 11, 15);
  draw("INVOICE PENJUALAN", bold, 8);
  divider();
  draw(`No: ${invoice.documentNo}`, bold);
  draw(`Tanggal: ${invoice.issueDate}`);
  draw(`Jatuh tempo: ${invoice.dueDate}`);
  y -= 3;
  draw(`Pelanggan: ${invoice.customerName}`, bold);
  if (invoice.address) draw(invoice.address);
  if (invoice.phone) draw(`Kontak: ${invoice.phone}`);
  y -= 3;
  divider();
  draw(invoice.description);
  y -= 3;
  divider();
  draw(`Total: ${money(invoice.amount)}`, bold);
  draw(`Dibayar: ${money(invoice.paid)}`);
  draw(`Sisa: ${money(invoice.outstanding)}`, bold);
  y -= 4;
  divider();
  draw("Dibuat dari dokumen yang dibukukan di Arus.", regular, 7, 10);
  return pdf.save();
}
