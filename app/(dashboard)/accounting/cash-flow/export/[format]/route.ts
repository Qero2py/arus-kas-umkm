import { createCashFlowExport } from "@/lib/cash-flow-export";
import { createPdf } from "@/lib/report-pdf";
import { createXlsx } from "@/lib/report-xlsx";
import { loadCashFlowReport } from "@/lib/supabase/cash-flow";
import { todayInJakarta } from "@/lib/supabase/workspace";

export async function GET(request: Request, context: { params: Promise<{ format: string }> }) {
  const { format } = await context.params;
  if (format !== "pdf" && format !== "xlsx") return new Response("Format tidak tersedia.", { status: 404 });
  const url = new URL(request.url);
  const end = url.searchParams.get("end") ?? todayInJakarta();
  const start = url.searchParams.get("start") ?? `${end.slice(0, 7)}-01`;
  const result = await loadCashFlowReport(start, end);
  if (!result.ok) return new Response(result.message, { status: result.message.startsWith("Hanya pemilik") ? 403 : 400,
    headers: { "Cache-Control": "private, no-store" } });
  try {
    const report = createCashFlowExport(result, new Date());
    const bytes = format === "pdf" ? await createPdf(report) : createXlsx(report);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="arus-arus-kas-${start}-${end}.${format}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Berkas arus kas belum dapat dibuat.", { status: 500,
      headers: { "Cache-Control": "private, no-store" } });
  }
}
