import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { createReportExport, ExportRow, ExportSheet } from "./report-export";

type Report = ReturnType<typeof createReportExport>;

function printable(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "-");
}

function rupiah(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Nominal PDF tidak aman.");
  return `Rp ${(value === 0 ? 0 : value).toLocaleString("id-ID")}`;
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const words = printable(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
    if (line) { lines.push(line); line = ""; }
    if (font.widthOfTextAtSize(word, size) <= width) { line = word; continue; }
    let part = "";
    for (const char of word) {
      if (part && font.widthOfTextAtSize(part + char, size) > width) {
        lines.push(part); part = "";
      }
      part += char;
    }
    line = part;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function createPdf(report: Report) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${report.businessName} - laporan keuangan draf ${report.asOf}`);
  pdf.setSubject("Laba rugi, posisi keuangan, dan CaLK draf");
  pdf.setCreator("Arus");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [pageWidth, pageHeight] = PageSizes.A4;
  const margin = 42;
  const currentRight = 427;
  const priorRight = pageWidth - margin;
  const ink = rgb(0.12, 0.19, 0.25);
  const muted = rgb(0.37, 0.43, 0.48);
  const light = rgb(0.91, 0.95, 0.96);
  let page: PDFPage;
  let y = 0;
  let currentSheet: ExportSheet;

  function rightText(value: string, right: number, baseline: number, font: PDFFont, size: number) {
    const safe = printable(value);
    page.drawText(safe, { x: right - font.widthOfTextAtSize(safe, size), y: baseline,
      size, font, color: ink });
  }

  function startPage(sheet: ExportSheet, continued = false) {
    page = pdf.addPage(PageSizes.A4);
    currentSheet = sheet;
    y = pageHeight - 44;
    const business = wrap(report.businessName, bold, 10, 390)[0];
    page.drawText(business, { x: margin, y, size: 10, font: bold, color: ink });
    rightText(report.status, priorRight, y, bold, 9);
    y -= 28;
    const title = continued ? `${sheet.title} (lanjutan)` : sheet.title;
    page.drawText(printable(title), { x: margin, y, size: 16, font: bold, color: ink });
    y -= 19;
    page.drawText(printable(`Per ${report.asOf} | ${report.currency} | Dibuat ${report.generatedAt} WIB`),
      { x: margin, y, size: 8, font: regular, color: muted });
    y -= 28;
    page.drawRectangle({ x: margin, y: y - 10, width: pageWidth - margin * 2,
      height: 25, color: light });
    page.drawText("Pos", { x: margin + 6, y, size: 8, font: bold, color: ink });
    rightText(sheet.currentLabel, currentRight, y, bold, 7);
    rightText(sheet.priorLabel, priorRight - 5, y, bold, 7);
    y -= 27;
  }

  function space(height: number) {
    if (y - height < 54) startPage(currentSheet, true);
  }

  function drawMoney(row: Extract<ExportRow, { kind: "money" }>) {
    const font = row.strong ? bold : regular;
    const labelLines = wrap(row.label, font, 9, 256);
    const height = Math.max(1, labelLines.length) * 12 + 7;
    space(height);
    if (row.strong) page.drawRectangle({ x: margin, y: y - height + 4,
      width: pageWidth - margin * 2, height, color: light });
    labelLines.forEach((line, index) => page.drawText(line, {
      x: margin + 5, y: y - index * 12, size: 9, font, color: ink,
    }));
    rightText(rupiah(row.current), currentRight, y, font, 9);
    rightText(rupiah(row.prior), priorRight - 5, y, font, 9);
    y -= height;
  }

  function drawSection(label: string) {
    space(27);
    y -= 3;
    page.drawRectangle({ x: margin, y: y - 11, width: pageWidth - margin * 2,
      height: 20, color: light });
    page.drawText(wrap(label, bold, 9, 490)[0], { x: margin + 5, y,
      size: 9, font: bold, color: ink });
    y -= 24;
  }

  function drawParagraph(value: string) {
    const lines = wrap(value, regular, 9, pageWidth - margin * 2 - 10);
    for (const line of lines) {
      space(15);
      page.drawText(line, { x: margin + 5, y, size: 9, font: regular, color: ink });
      y -= 13;
    }
    y -= 7;
  }

  for (const sheet of report.sheets) {
    startPage(sheet);
    for (const row of sheet.rows) {
      if (row.kind === "money") drawMoney(row);
      else if (row.kind === "section") drawSection(row.label);
      else drawParagraph(row.label);
    }
  }
  pdf.getPages().forEach((item, index) => {
    item.drawLine({ start: { x: margin, y: 42 }, end: { x: pageWidth - margin, y: 42 },
      thickness: 0.5, color: light });
    item.drawText("Arus | Laporan draf - tinjau saldo pembuka dan kebijakan usaha", {
      x: margin, y: 28, size: 7, font: regular, color: muted,
    });
    const label = `Halaman ${index + 1} / ${pdf.getPageCount()}`;
    item.drawText(label, { x: pageWidth - margin - regular.widthOfTextAtSize(label, 7),
      y: 28, size: 7, font: regular, color: muted });
  });
  return pdf.save();
}
