import { createInvoicePdf } from "@/lib/invoice-pdf";
import { loadInvoice } from "@/lib/supabase/invoice";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper: 58 | 80 = new URL(request.url).searchParams.get("paper") === "58" ? 58 : 80;
  const result = await loadInvoice(id);
  if (!result.ok) return new Response(result.message, { status: result.message.startsWith("Hanya pemilik") ? 403 : 404,
    headers: { "Cache-Control": "private, no-store" } });
  try {
    const bytes = await createInvoicePdf(result.invoice, paper);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="arus-invoice-${result.invoice.documentNo.replace(/[^A-Z0-9._-]/gi, "-")}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("PDF invoice belum dapat dibuat.", { status: 500,
      headers: { "Cache-Control": "private, no-store" } });
  }
}
