import Link from "next/link";
import { connection } from "next/server";
import { PrintableDocumentActions } from "@/components/invoice-actions";
import { PageHeading } from "@/components/page-heading";
import { ThermalPrintStyle } from "@/components/thermal-print-style";
import { formatDemoDate } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";
import { loadInvoice } from "@/lib/supabase/invoice";

export default async function InvoicePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paper?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { paper: requestedPaper } = await searchParams;
  const paper = requestedPaper === "58" ? 58 : 80;
  const result = await loadInvoice(id);
  if (!result.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{result.message}</p>;
  const item = result.invoice;
  const pdfUrl = `/accounting/credit/${id}/invoice/pdf?paper=${paper}`;
  return <>
    <PageHeading eyebrow="Kasir · Bon tempo" title={`Bon / invoice ${item.documentNo}`}
      description="Pratinjau dari dokumen penjualan yang telah dibukukan. Pembayaran dan sisa tagihan mengikuti data terbaru." />
    <div className="invoice-control mb-4 flex flex-wrap gap-4 text-sm font-semibold text-primary"><Link href="/accounting/credit" className="underline">Kembali ke tagihan</Link><Link href={`/accounting/credit/${id}/invoice?paper=58`} className={paper === 58 ? "underline" : ""}>Kertas 58 mm</Link><Link href={`/accounting/credit/${id}/invoice?paper=80`} className={paper === 80 ? "underline" : ""}>Kertas 80 mm</Link></div>
    <PrintableDocumentActions kind="invoice" pdfUrl={pdfUrl} phone={item.phone} documentNo={item.documentNo} businessName={item.businessName} />
    <article className="invoice-paper mx-auto border border-border bg-white p-5 text-black shadow-sm" style={{ width: `${paper}mm`, maxWidth: "100%" }}>
      <h2 className="text-center text-lg font-bold">{item.businessName}</h2><p className="mt-1 text-center text-xs font-semibold uppercase tracking-wide">Bon / invoice penjualan</p>
      <div className="my-4 border-t border-dashed border-black/50" />
      <dl className="space-y-1 text-xs"><div className="flex justify-between gap-2"><dt>No.</dt><dd className="text-right font-semibold">{item.documentNo}</dd></div><div className="flex justify-between gap-2"><dt>Tanggal</dt><dd>{formatDemoDate(item.issueDate)}</dd></div><div className="flex justify-between gap-2"><dt>Jatuh tempo</dt><dd>{formatDemoDate(item.dueDate)}</dd></div></dl>
      <div className="my-4 border-t border-dashed border-black/50" />
      <p className="text-xs font-semibold">{item.customerName}</p>{item.address && <p className="mt-1 break-words text-xs">{item.address}</p>}{item.phone && <p className="mt-1 text-xs">{item.phone}</p>}
      <div className="my-4 border-t border-dashed border-black/50" />
      <p className="break-words text-xs">{item.description}</p>
      <div className="my-4 border-t border-dashed border-black/50" />
      <dl className="space-y-2 text-xs"><div className="flex justify-between gap-2 font-bold"><dt>Total tagihan</dt><dd className="tabular-nums">{formatRupiah(item.amount)}</dd></div><div className="flex justify-between gap-2"><dt>Sudah dibayar</dt><dd className="tabular-nums">{formatRupiah(item.paid)}</dd></div><div className="flex justify-between gap-2 font-bold"><dt>Sisa tagihan</dt><dd className="tabular-nums">{formatRupiah(item.outstanding)}</dd></div></dl>
      <div className="my-4 border-t border-dashed border-black/50" /><p className="text-center text-[10px]">Dibuat dari dokumen yang dibukukan di Arus.</p>
    </article>
    <ThermalPrintStyle paper={paper} />
  </>;
}
