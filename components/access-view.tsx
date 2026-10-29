"use client";

import { useCallback, useEffect, useState } from "react";
import { createManagerInvite, listBusinessAccess, removeBusinessManager, revokeManagerInvite } from "@/app/actions/workspace";
import { PageHeading } from "@/components/page-heading";

type AccessData = Extract<Awaited<ReturnType<typeof listBusinessAccess>>, { ok: true }>;

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

export function AccessView() {
  const [data, setData] = useState<AccessData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newCode, setNewCode] = useState("");

  const refresh = useCallback(async () => {
    try {
      const result = await listBusinessAccess();
      if (!result.ok) { setError(result.message); return; }
      setData(result);
      setError("");
    } catch {
      setError("Daftar akses belum bisa dimuat. Coba lagi.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const onWorkspace = () => { void refresh(); };
    window.addEventListener("arus:workspace-updated", onWorkspace);
    return () => { window.clearTimeout(timer); window.removeEventListener("arus:workspace-updated", onWorkspace); };
  }, [refresh]);

  async function makeInvite() {
    setBusy(true);
    setError("");
    try {
      const result = await createManagerInvite();
      if (!result.ok) setError(result.message);
      else { setNewCode(result.code); await refresh(); }
    } catch { setError("Kode undangan belum bisa dibuat."); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (!window.confirm("Batalkan kode undangan ini? Kode tidak akan bisa dipakai lagi.")) return;
    setBusy(true);
    try {
      const result = await revokeManagerInvite(id);
      if (!result.ok) setError("Kode belum bisa dibatalkan.");
      else await refresh();
    } catch { setError("Kode belum bisa dibatalkan."); }
    finally { setBusy(false); }
  }

  async function remove(userId: string, email: string) {
    if (!window.confirm(`Cabut akses ${email}? Akun ini tidak akan bisa melihat data usaha lagi.`)) return;
    setBusy(true);
    try {
      const result = await removeBusinessManager(userId);
      if (!result.ok) setError("Akses belum bisa dicabut.");
      else await refresh();
    } catch { setError("Akses belum bisa dicabut."); }
    finally { setBusy(false); }
  }

  return <div className="max-w-3xl space-y-8">
    <PageHeading eyebrow="Pemilik usaha" title="Akses usaha" description="Undang pengelola untuk mencatat transaksi dan kewajiban. Hanya pemilik yang dapat mengatur akses, saldo awal, dan proyeksi." />
    {error && <p role="alert" className="rounded-lg border border-[#dba99f] bg-[#fff3f0] p-4 text-sm text-[#812e22]">{error} <button type="button" onClick={() => void refresh()} className="font-semibold underline">Coba lagi</button></p>}

    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Undang pengelola</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Buat kode, lalu berikan langsung kepada orang yang Anda percaya. Mereka perlu membuat akun Arus dan memasukkan kode saat menyiapkan usaha. Kode berlaku satu kali selama tujuh hari.</p>
      <button type="button" disabled={busy} onClick={() => void makeInvite()} className="mt-4 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">Buat kode undangan</button>
      {newCode && <div className="mt-5 rounded-lg border border-border bg-secondary p-4">
        <p className="text-sm font-semibold">Kode baru</p>
        <p className="mt-2 break-all font-mono text-base font-semibold tracking-wide text-foreground">{newCode}</p>
        <p className="mt-2 text-sm text-muted-foreground">Salin sekarang. Demi keamanan, kode ini tidak ditampilkan lagi setelah halaman ditutup.</p>
        <button type="button" onClick={() => void navigator.clipboard.writeText(newCode)} className="mt-3 min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-semibold">Salin kode</button>
      </div>}
    </section>

    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Pengelola yang punya akses</h2>
      {!data ? <p role="status" className="mt-3 text-sm text-muted-foreground">Memuat daftar akses…</p>
        : data.members.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Belum ada pengelola yang bergabung.</p>
        : <ul className="mt-4 divide-y divide-border">{data.members.map((member) => <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><p className="font-medium">{member.member_email}</p><p className="text-xs text-muted-foreground">Bergabung {dateLabel(member.joined_at)}</p></div>
          <button type="button" disabled={busy} onClick={() => void remove(member.user_id, member.member_email)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-[#812e22] disabled:opacity-60">Cabut akses</button>
        </li>)}</ul>}
    </section>

    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Kode undangan</h2>
      {!data ? <p role="status" className="mt-3 text-sm text-muted-foreground">Memuat kode…</p>
        : data.invites.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Belum ada kode undangan.</p>
        : <ul className="mt-4 divide-y divide-border">{data.invites.map((invite) => {
          const active = !invite.used_at && !invite.revoked_at && new Date(invite.expires_at) > new Date();
          const status = invite.used_at ? "Sudah digunakan" : invite.revoked_at ? "Dibatalkan" : active ? "Aktif" : "Kedaluwarsa";
          return <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><p className="font-medium">{status}</p><p className="text-xs text-muted-foreground">Dibuat {dateLabel(invite.created_at)} · Berlaku sampai {dateLabel(invite.expires_at)}</p></div>
            {active && <button type="button" disabled={busy} onClick={() => void revoke(invite.id)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-[#812e22] disabled:opacity-60">Batalkan</button>}
          </li>;
        })}</ul>}
    </section>
  </div>;
}
