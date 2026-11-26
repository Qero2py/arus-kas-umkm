"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createAccountingContact, updateAccountingContact } from "@/app/actions/accounting-credit";
import { PageHeading } from "@/components/page-heading";
import type { AccountingContact } from "@/lib/supabase/accounting-credit";

const kindNames = { customer: "Pelanggan", supplier: "Pemasok", both: "Pelanggan & pemasok" };
const fieldClass = "mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

export function AccountingContactsView({ contacts, businessName }: {
  contacts: AccountingContact[]; businessName: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<AccountingContact["kind"]>("customer");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState<AccountingContact | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function edit(contact: AccountingContact) {
    setEditing(contact);
    setName(contact.name);
    setPhone(contact.phone ?? "");
    setAddress(contact.address ?? "");
    setMessage("");
    setError("");
  }

  function reset() {
    setEditing(null);
    setName("");
    setPhone("");
    setAddress("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const result = editing
        ? await updateAccountingContact({ id: editing.id, name, phone, address })
        : await createAccountingContact({ kind, name, phone, address });
      if (!result.ok) setError(result.message);
      else {
        setMessage(editing ? "Kontak diperbarui." : "Kontak tersimpan.");
        reset();
        router.refresh();
      }
    } catch {
      setError("Kontak belum tersimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHeading eyebrow={`Akuntansi · ${businessName}`} title="Kontak pelanggan & pemasok"
      description="Simpan pihak yang terlibat dalam penjualan dan pembelian tempo. Nama pada dokumen tetap mengikuti saat dokumen dibuat." />
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.8fr)]">
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5"><h2 className="text-base font-semibold">Daftar kontak</h2>
          <p className="mt-1 text-xs text-muted-foreground">{contacts.length} kontak pada halaman ini</p></div>
        {contacts.length ? <div className="divide-y divide-border/70">
          {contacts.map((contact) => <div key={contact.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
            <div className="min-w-0"><p className="font-semibold">{contact.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{kindNames[contact.kind]}{contact.phone ? ` · ${contact.phone}` : ""}</p>
              {contact.address && <p className="mt-1 text-xs text-muted-foreground">{contact.address}</p>}
            </div>
            <button type="button" onClick={() => edit(contact)} className="min-h-11 rounded-lg border border-border px-3 text-xs font-semibold text-primary">Ubah</button>
          </div>)}
        </div> : <p className="p-5 text-sm text-muted-foreground">Belum ada kontak. Tambahkan pelanggan atau pemasok untuk membuat dokumen tempo.</p>}
      </section>
      <section className="h-fit rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">{editing ? "Ubah kontak" : "Tambah kontak"}</h2>
        {editing && <p className="mt-1 text-xs text-muted-foreground">Jenis kontak tetap setelah dibuat agar dokumen lama tidak berubah makna.</p>}
        <form onSubmit={submit} className="mt-5 space-y-4">
          {!editing && <label className="block text-sm font-medium">Jenis kontak<select value={kind} onChange={(event) => setKind(event.target.value as AccountingContact["kind"])} className={fieldClass}>
            {Object.entries(kindNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          </select></label>}
          <label className="block text-sm font-medium">Nama<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} className={fieldClass} /></label>
          <label className="block text-sm font-medium">Nomor HP / WhatsApp (opsional)<input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} className={fieldClass} /></label>
          <label className="block text-sm font-medium">Alamat (opsional)<textarea value={address} onChange={(event) => setAddress(event.target.value)} maxLength={250} rows={3} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></label>
          <div className="flex flex-wrap gap-2"><button disabled={saving} type="submit" className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? "Menyimpan…" : "Simpan kontak"}</button>
            {editing && <button type="button" onClick={reset} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">Batal</button>}</div>
          {message && <p role="status" className="text-sm text-[#356548]">{message}</p>}
          {error && <p role="alert" className="text-sm text-[#812e22]">{error}</p>}
        </form>
      </section>
    </div>
  </>;
}
