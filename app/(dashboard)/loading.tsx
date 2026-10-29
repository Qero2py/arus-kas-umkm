export default function DashboardLoading() {
  return (
    <section className="animate-pulse" aria-busy="true" aria-live="polite" aria-label="Memuat halaman">
      <span className="sr-only">Memuat data usaha…</span>
      <div className="mb-8 border-b border-border/80 pb-8">
        <div className="h-3 w-36 rounded bg-secondary" />
        <div className="mt-4 h-10 w-72 max-w-full rounded bg-secondary" />
        <div className="mt-4 h-4 w-[min(32rem,90%)] rounded bg-secondary" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((item) => <div key={item} className="h-28 rounded-xl border border-border bg-card p-5"><div className="h-3 w-24 rounded bg-secondary" /><div className="mt-4 h-7 w-40 rounded bg-secondary" /></div>)}
      </div>
      <div className="mt-6 h-72 rounded-xl border border-border bg-card" />
    </section>
  );
}
