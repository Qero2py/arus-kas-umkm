import { createCashReceiptPdf } from "@/lib/cash-receipt-pdf";
import { loadCashReceipt } from "@/lib/supabase/cash-receipt";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper: 58 | 80 = new URL(request.url).searchParams.get("paper") === "58" ? 58 : 80;
  const result = await loadCashReceipt(id);
  if (!result.ok) return new Response(result.message, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  try {
    const bytes = await createCashReceiptPdf(result.receipt, paper);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="arus-struk-${result.receipt.receiptNo}.pdf"`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("PDF struk belum dapat dibuat.", { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
