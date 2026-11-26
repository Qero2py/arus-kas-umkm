"use client";

import { useState } from "react";

function whatsappNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("62") && digits.length >= 10) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return `62${digits.slice(1)}`;
  if (digits.startsWith("8") && digits.length >= 9) return `62${digits}`;
  return "";
}

export function PrintableDocumentActions({ pdfUrl, phone = "", documentNo, businessName, kind }: {
  pdfUrl: string; phone?: string; documentNo: string; businessName: string; kind: "invoice" | "struk";
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const recipient = kind === "invoice" ? whatsappNumber(phone) : "";
  const safeDocumentNo = documentNo.replace(/[^A-Z0-9._-]/gi, "-");
  const waUrl = recipient ? `https://wa.me/${recipient}?text=${encodeURIComponent(`Halo, berikut invoice ${documentNo} dari ${businessName}. PDF invoice akan kami lampirkan.`)}` : "";

  async function share() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(pdfUrl, { credentials: "same-origin" });
      if (!response.ok) throw new Error("PDF belum dapat diunduh.");
      const file = new File([await response.blob()], `${kind}-${safeDocumentNo}.pdf`, { type: "application/pdf" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${kind === "invoice" ? "Invoice" : "Struk"} ${documentNo}`,
          text: `${kind === "invoice" ? "Invoice" : "Struk"} ${documentNo} dari ${businessName}` });
        setNotice("Pilih WhatsApp pada menu berbagi untuk mengirim PDF.");
      } else {
        setNotice("Browser ini belum dapat berbagi berkas langsung. Unduh PDF, lalu lampirkan saat membuka WhatsApp.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(`${kind === "invoice" ? "Invoice" : "Struk"} belum dapat dibagikan. Coba unduh PDF lebih dulu.`);
    } finally {
      setBusy(false);
    }
  }

  return <div className="invoice-control mb-6 flex flex-wrap items-center gap-3 text-sm">
    <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">Cetak {kind}</button>
    <a href={pdfUrl} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 font-semibold text-primary">Unduh PDF</a>
    <button type="button" disabled={busy} onClick={() => void share()} className="min-h-11 rounded-lg border border-border bg-card px-4 font-semibold text-primary disabled:opacity-60">{busy ? "Menyiapkan PDF…" : "Bagikan PDF"}</button>
    {waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 font-semibold text-primary">Buka WhatsApp</a>}
    <p className="w-full text-xs text-muted-foreground">{kind === "invoice" ? "Pengiriman dilakukan oleh Anda dari menu berbagi atau percakapan WhatsApp. Membuka percakapan saja tidak mengirim PDF." : "Gunakan menu berbagi perangkat untuk mengirim PDF struk. Penerima dipilih oleh Anda."}</p>
    {notice && <p role="status" className="w-full text-xs font-medium text-primary">{notice}</p>}
  </div>;
}
