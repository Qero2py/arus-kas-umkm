"use client";

import { useEffect, useState } from "react";
import { searchAccountingContacts } from "@/app/actions/accounting-credit";

type Contact = { id: string; name: string };

export function ContactPicker({ kind, value, onChange, label }: {
  kind: "sale" | "purchase"; value: string; onChange: (id: string) => void; label?: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [resultsQuery, setResultsQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const title = label ?? (kind === "sale" ? "Pelanggan" : "Pemasok");

  useEffect(() => {
    if (value || query.trim().length < 2) return;
    let active = true;
    const search = query.trim();
    const timer = setTimeout(async () => {
      setSearching(true); setError("");
      try {
        const response = await searchAccountingContacts(search, kind);
        if (!active) return;
        if (response.ok) setResults(response.contacts);
        else { setResults([]); setError(response.message); }
      } catch {
        if (active) { setResults([]); setError("Kontak belum dapat dicari. Coba lagi."); }
      } finally {
        if (active) { setResultsQuery(search); setSearching(false); }
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, kind, value]);

  return <div>
    <label className="block text-sm font-medium">Cari {title.toLocaleLowerCase("id-ID")}
      <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setResultsQuery(""); setResults([]); setSelectedName(""); onChange(""); }}
        onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
        maxLength={80} placeholder="Ketik sedikitnya dua huruf" autoComplete="off"
        className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
    </label>
    {value ? <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-secondary p-3 text-sm">
      <strong>{selectedName}</strong><button type="button" onClick={() => { setQuery(""); setSelectedName(""); onChange(""); }} className="min-h-10 font-semibold text-primary underline">Ubah</button>
    </div> : <div className="mt-2" aria-live="polite">
      {query.trim().length < 2 ? <p className="text-xs text-muted-foreground">Ketik sedikitnya dua huruf.</p>
        : searching || resultsQuery !== query.trim() ? <p className="text-sm text-muted-foreground">Mencari kontak…</p>
          : error ? <p role="alert" className="text-sm text-[#812e22]">{error}</p>
            : results.length ? <ul className="max-h-48 overflow-y-auto rounded-lg border border-border">{results.map((item) => <li key={item.id}>
              <button type="button" onClick={() => { setQuery(item.name); setSelectedName(item.name); onChange(item.id); }}
                className="min-h-11 w-full border-b border-border px-3 text-left text-sm hover:bg-secondary focus:bg-secondary">{item.name}</button>
            </li>)}</ul> : <p className="text-sm text-muted-foreground">{title} tidak ditemukan.</p>}
    </div>}
  </div>;
}
