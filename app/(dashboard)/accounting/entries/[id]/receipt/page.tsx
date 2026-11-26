import Link from "next/link";
import { connection } from "next/server";
import { PrintableDocumentActions } from "@/components/invoice-actions";
import { PageHeading } from "@/components/page-heading";
import { ThermalPrintStyle } from "@/components/thermal-print-style";
import { formatDemoDate } from "@/lib/demo-calculations";
import { formatRupiah } from "@/lib/format";
import { loadCashReceipt } from "@/lib/supabase/cash-receipt";

export default async function CashReceiptPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paper?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { paper: requestedPaper } = await searchParams;
  const paper = requestedPaper === "58" ? 58 : 80;
  const result = await loadCashReceipt(id);
  if (!result.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{result.message}</p>;
  const item = result.receipt;
  const pdfUrl = `/accounting/entries/${id}/receipt/pdf?paper=${paper}`;
  return <>
    <PageHeading eyebrow="Kas & bank · Struk" title={`Struk ${item.receiptNo}`}
      description="Bukti penjualan tunai dari jurnal yang telah dibukukan. Pemilik dapat melihat seluruh struk, pengelola hanya struk yang dibuatnya." />
    <div className="mb-4 flex flex-wrap gap-4 text-sm font-semibold text-primary"><Link href="/transactions" className="underline">Kembali ke buku kas</Link><Link href={`/accounting/entries/${id}/receipt?paper=58`} className={paper === 58 ? "underline" : ""}>Kertas 58 mm</Link><Link href={`/accounting/entries/${id}/receipt?paper=80`} className={paper === 80 ? "underline" : ""}>Kertas 80 mm</Link></div>
    <PrintableDocumentActions kind="struk" pdfUrl={pdfUrl} documentNo={item.receiptNo} businessName={item.businessName} />
    <article className="invoice-paper mx-auto border border-border bg-white p-5 text-black shadow-sm" style={{ width: `${paper}mm`, maxWidth: "100%" }}>
      <h2 className="text-center text-lg font-bold">{item.businessName}</h2><p className="mt-1 text-center text-xs font-semibold uppercase tracking-wide">Struk penjualan tunai</p>
      <div className="my-4 border-t border-dashed border-black/50" />
      <p className="break-all text-xs font-semibold">{item.receiptNo}</p><p className="mt-1 text-xs">{formatDemoDate(item.date)}</p><p className="mt-1 text-xs">Diterima di {item.cashName}</p>
      <div className="my-4 border-t border-dashed border-black/50" />
      <p className="break-words text-xs">{item.description}</p>
      <div className="my-4 border-t border-dashed border-black/50" />
      <p className="flex justify-between gap-2 text-xs font-bold"><span>Total dibayar</span><span className="tabular-nums">{formatRupiah(item.amount)}</span></p>
      {item.corrected && <p className="mt-4 border border-black p-2 text-center text-xs font-bold">DIKOREKSI · Jangan gunakan sebagai bukti transaksi aktif</p>}
      <div className="my-4 border-t border-dashed border-black/50" /><p className="text-center text-[10px]">Dibukukan di Arus.</p>
    </article>
    <ThermalPrintStyle paper={paper} />
  </>;
}
