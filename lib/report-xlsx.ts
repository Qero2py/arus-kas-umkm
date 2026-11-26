import { strToU8, zipSync } from "fflate";
import type { createReportExport, ExportRow } from "./report-export";

type Report = ReturnType<typeof createReportExport>;

const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const spreadsheetNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function escapeXml(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function textCell(ref: string, value: string, style = 0) {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function numberCell(ref: string, value: number, style = 1) {
  if (!Number.isSafeInteger(value)) throw new Error("Nominal ekspor Excel tidak aman.");
  return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
}

function sheetXml(report: Report, index: number) {
  const sheet = report.sheets[index];
  const rows: string[] = [
    `<row r="1">${textCell("A1", report.businessName, 3)}</row>`,
    `<row r="2">${textCell("A2", sheet.title, 2)}</row>`,
    `<row r="3">${textCell("A3", `Status: ${report.status} | Satuan: ${report.currency}`)}</row>`,
    `<row r="4">${textCell("A4", `Dibuat: ${report.generatedAt} WIB`)}</row>`,
    `<row r="5">${textCell("A5", `Tanggal laporan: ${report.asOf}`)}</row>`,
    `<row r="7">${textCell("A7", "Pos", 4)}${textCell("B7", sheet.currentLabel, 4)}${textCell("C7", sheet.priorLabel, 4)}</row>`,
  ];
  sheet.rows.forEach((row: ExportRow, index: number) => {
    const n = index + 8;
    if (row.kind === "money") rows.push(`<row r="${n}">${textCell(`A${n}`, row.label, row.strong ? 2 : 0)}${numberCell(`B${n}`, row.current, row.strong ? 5 : 1)}${numberCell(`C${n}`, row.prior, row.strong ? 5 : 1)}</row>`);
    else {
      const height = row.kind === "section" ? 23 : Math.min(100, Math.max(21, Math.ceil(row.label.length / 74) * 16));
      rows.push(`<row r="${n}" ht="${height}" customHeight="1">${textCell(`A${n}`, row.label, row.kind === "section" ? 4 : 6)}</row>`);
    }
  });
  return `${header}<worksheet xmlns="${spreadsheetNs}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:C${Math.max(7, sheet.rows.length + 7)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="76" customWidth="1"/><col min="2" max="3" width="24" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const styles = `${header}<styleSheet xmlns="${spreadsheetNs}"><fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="16"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF1F4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"/><xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function createXlsx(report: Report) {
  const contentTypes = `${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${report.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const rootRels = `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `${header}<workbook xmlns="${spreadsheetNs}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${report.sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  const workbookRels = `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${report.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${report.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
    "xl/styles.xml": strToU8(styles),
  };
  report.sheets.forEach((_, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(report, i)); });
  return zipSync(files, { level: 6 });
}
