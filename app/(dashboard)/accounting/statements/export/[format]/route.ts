import { createPdf } from "@/lib/report-pdf";
import { createReportExport } from "@/lib/report-export";
import { createXlsx } from "@/lib/report-xlsx";
import { loadFinancialStatements } from "@/lib/supabase/financial-statements";
import { todayInJakarta } from "@/lib/supabase/workspace";

export async function GET(request: Request, context: { params: Promise<{ format: string }> }) {
  const { format } = await context.params;
  if (format !== "pdf" && format !== "xlsx") return new Response("Format tidak tersedia.", { status: 404 });
  const asOf = new URL(request.url).searchParams.get("asOf") ?? todayInJakarta();
  const result = await loadFinancialStatements(asOf);
  if (!result.ok) return new Response(result.message, { status: result.message.startsWith("Hanya pemilik") ? 403 : 400,
    headers: { "Cache-Control": "private, no-store" } });
  const report = createReportExport(result, new Date());
  try {
    const bytes = format === "pdf" ? await createPdf(report) : createXlsx(report);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="arus-laporan-${asOf}.${format}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Berkas laporan belum dapat dibuat.", { status: 500,
      headers: { "Cache-Control": "private, no-store" } });
  }
}
