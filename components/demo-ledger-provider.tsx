"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { addLiveEntry, addLiveObligation, loadLiveWorkspace, recordLivePayment, updateLiveEntry, updateLiveObligation } from "@/app/actions/workspace";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import type { LiveWorkspace } from "@/lib/supabase/workspace";
import { DEMO_DATE, demoBusiness, demoObligations, demoTransactions, type CashEntry, type Obligation } from "@/lib/demo-data";
import { daysBetweenDates, formatDemoDate, isValidDemoDate, isValidIsoDate } from "@/lib/demo-calculations";

type EntryInput = Omit<CashEntry, "id" | "dateLabel" | "linkedObligationId">;
type ObligationInput = Pick<Obligation, "kind" | "party" | "description" | "date" | "dueDate" | "amount">;
type Ledger = { entries: CashEntry[]; obligations: Obligation[] };
type DemoLedgerContextValue = Ledger & {
  ready: boolean;
  storageError: "invalid" | "unavailable" | "remote" | null;
  live: boolean;
  asOf: string;
  businessName: string;
  ownerEmail: string;
  role: "owner" | "manager";
  resetDemo: () => boolean;
  addEntry: (entry: EntryInput) => Promise<boolean>;
  updateEntry: (id: string, entry: EntryInput) => Promise<boolean>;
  addObligation: (item: ObligationInput) => Promise<boolean>;
  updateObligation: (id: string, item: Omit<ObligationInput, "kind">) => Promise<boolean>;
  recordPayment: (id: string, amount: number, method: string) => Promise<boolean>;
};

const initialLedger: Ledger = { entries: demoTransactions, obligations: demoObligations };
const DemoLedgerContext = createContext<DemoLedgerContextValue | null>(null);
const storageKey = "arus-demo-ledger-v1";

function isStoredLedger(value: unknown): value is Ledger {
  if (!value || typeof value !== "object") return false;
  const stored = value as Partial<Ledger>;
  return Array.isArray(stored.entries) && Array.isArray(stored.obligations)
    && stored.entries.every((entry) => entry && typeof entry.id === "string" && isValidDemoDate(entry.date)
      && typeof entry.dateLabel === "string" && typeof entry.title === "string" && typeof entry.category === "string"
      && (entry.type === "in" || entry.type === "out") && Number.isSafeInteger(entry.amount) && entry.amount > 0
      && typeof entry.method === "string" && (entry.linkedObligationId === undefined || typeof entry.linkedObligationId === "string"))
    && stored.obligations.every((item) => item && typeof item.id === "string"
      && (item.kind === "utang" || item.kind === "piutang") && typeof item.party === "string"
      && typeof item.description === "string" && (item.date === undefined || isValidIsoDate(item.date)) && isValidIsoDate(item.dueDate)
      && typeof item.dueLabel === "string" && Number.isSafeInteger(item.dueInDays)
      && Number.isSafeInteger(item.amount) && item.amount > 0
      && Number.isSafeInteger(item.settled) && item.settled >= 0 && item.settled <= item.amount);
}

export function DemoLedgerProvider({ children, live = false }: { children: ReactNode; live?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const loadingLive = useRef(false);
  const rerunLive = useRef(false);
  const [ledger, setLedger] = useState<Ledger>(live ? { entries: [], obligations: [] } : initialLedger);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<"invalid" | "unavailable" | "remote" | null>(null);
  const [asOf, setAsOf] = useState(DEMO_DATE);
  const [businessName, setBusinessName] = useState(demoBusiness.name);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [role, setRole] = useState<"owner" | "manager">("owner");
  const [businessId, setBusinessId] = useState("");

  const applyLiveWorkspace = useCallback((workspace: LiveWorkspace) => {
    setLedger(workspace.ledger);
    setAsOf(workspace.asOf);
    setBusinessName(workspace.businessName);
    setOwnerEmail(workspace.ownerEmail);
    setRole(workspace.role);
    setBusinessId(workspace.businessId);
    setStorageError(null);
    setReady(true);
    window.dispatchEvent(new CustomEvent("arus:workspace-updated", { detail: workspace }));
  }, []);

  const refreshLive = useCallback(async () => {
    if (loadingLive.current) { rerunLive.current = true; return; }
    loadingLive.current = true;
    do {
      rerunLive.current = false;
      try {
        const result = await loadLiveWorkspace();
        if (result.status === "unauthorized") { router.replace("/login"); break; }
        if (result.status === "onboarding") { router.replace("/onboarding"); break; }
        if (result.status !== "ok") { setStorageError("remote"); setReady(true); break; }
        applyLiveWorkspace(result.workspace);
      } catch {
        setStorageError("remote");
        setReady(true);
        break;
      }
    } while (rerunLive.current);
    loadingLive.current = false;
  }, [applyLiveWorkspace, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (live) { void refreshLive(); return; }
      let stored: string | null;
      try {
        stored = window.localStorage.getItem(storageKey);
      } catch {
        setStorageError("unavailable");
        setReady(true);
        return;
      }
      if (stored) {
        try {
          const parsed: unknown = JSON.parse(stored);
          if (isStoredLedger(parsed)) setLedger({ ...parsed, obligations: parsed.obligations.map((item) => ({ ...item, date: item.date ?? DEMO_DATE })) });
          else setStorageError("invalid");
        } catch {
          setStorageError("invalid");
        }
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [live, refreshLive]);

  useEffect(() => {
    if (!live || previousPath.current === pathname) return;
    previousPath.current = pathname;
    const timer = window.setTimeout(() => { void refreshLive(); }, 0);
    return () => window.clearTimeout(timer);
  }, [live, pathname, refreshLive]);

  useEffect(() => {
    if (!live || !businessId) return;
    const supabase = createBrowserClient();
    const refresh = () => { void refreshLive(); };
    const channel = supabase.channel(`arus-business-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "businesses", filter: `id=eq.${businessId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `business_id=eq.${businessId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "obligations", filter: `business_id=eq.${businessId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "business_members", filter: `business_id=eq.${businessId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "business_invites", filter: `business_id=eq.${businessId}` }, refresh)
      .subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 15_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [businessId, live, refreshLive]);

  function commit(next: Ledger) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setLedger(next);
      return true;
    } catch {
      return false;
    }
  }

  function resetDemo() {
    if (live) return false;
    const saved = commit(initialLedger);
    if (saved) setStorageError(null);
    return saved;
  }

  async function addEntry(input: EntryInput) {
    if (!input.title.trim() || !isValidDemoDate(input.date, asOf) || !Number.isSafeInteger(input.amount) || input.amount <= 0) return false;
    if (live) { const result = await addLiveEntry(input); if (!result.ok) return false; applyLiveWorkspace(result.workspace); return true; }
    const entry: CashEntry = { ...input, id: crypto.randomUUID(), dateLabel: formatDemoDate(input.date) };
    return commit({ ...ledger, entries: [entry, ...ledger.entries] });
  }

  async function updateEntry(id: string, input: EntryInput) {
    const current = ledger.entries.find((entry) => entry.id === id);
    if (!current || !input.title.trim() || !isValidDemoDate(input.date, asOf) || !Number.isSafeInteger(input.amount) || input.amount <= 0) return false;
    if (live) { const result = await updateLiveEntry(id, input); if (!result.ok) return false; applyLiveWorkspace(result.workspace); return true; }
    if (current.linkedObligationId) {
      const item = ledger.obligations.find((row) => row.id === current.linkedObligationId);
      if (!item || input.type !== current.type) return false;
      const correctedSettled = item.settled - current.amount + input.amount;
      if (correctedSettled < 0 || correctedSettled > item.amount) return false;
      return commit({
        entries: ledger.entries.map((entry) => entry.id === id ? { ...entry, amount: input.amount, date: input.date, method: input.method, dateLabel: formatDemoDate(input.date) } : entry),
        obligations: ledger.obligations.map((row) => row.id === item.id ? { ...row, settled: correctedSettled } : row),
      });
    }
    return commit({ ...ledger, entries: ledger.entries.map((entry) => entry.id === id ? { ...entry, ...input, dateLabel: formatDemoDate(input.date) } : entry) });
  }

  async function addObligation(input: ObligationInput) {
    if (!input.party.trim() || !input.description.trim() || !isValidDemoDate(input.date, asOf) || !isValidIsoDate(input.dueDate) || !Number.isSafeInteger(input.amount) || input.amount <= 0) return false;
    if (live) { const result = await addLiveObligation(input); if (!result.ok) return false; applyLiveWorkspace(result.workspace); return true; }
    const item: Obligation = {
      ...input,
      id: crypto.randomUUID(),
      dueLabel: formatDemoDate(input.dueDate),
      dueInDays: daysBetweenDates(asOf, input.dueDate),
      settled: 0,
    };
    return commit({ ...ledger, obligations: [item, ...ledger.obligations] });
  }

  async function updateObligation(id: string, input: Omit<ObligationInput, "kind">) {
    const current = ledger.obligations.find((item) => item.id === id);
    if (!current || !input.party.trim() || !input.description.trim() || !isValidDemoDate(input.date, asOf)
      || !isValidIsoDate(input.dueDate) || !Number.isSafeInteger(input.amount)
      || input.amount <= 0 || input.amount < current.settled) return false;
    if (live) { const result = await updateLiveObligation(id, input); if (!result.ok) return false; applyLiveWorkspace(result.workspace); return true; }
    return commit({ ...ledger, obligations: ledger.obligations.map((item) => item.id === id
      ? { ...item, ...input, dueLabel: formatDemoDate(input.dueDate), dueInDays: daysBetweenDates(asOf, input.dueDate) }
      : item) });
  }

  async function recordPayment(id: string, amount: number, method: string) {
    const item = ledger.obligations.find((row) => row.id === id);
    if (!item || !Number.isSafeInteger(amount) || amount <= 0 || amount > item.amount - item.settled) return false;
    if (live) { const result = await recordLivePayment(id, amount, method); if (!result.ok) return false; applyLiveWorkspace(result.workspace); return true; }
    const entry: CashEntry = {
      id: crypto.randomUUID(),
      date: DEMO_DATE,
      dateLabel: formatDemoDate(DEMO_DATE),
      title: `${item.kind === "utang" ? "Pembayaran ke" : "Penerimaan dari"} ${item.party}`,
      category: item.kind === "utang" ? "Pembayaran utang" : "Penerimaan piutang",
      type: item.kind === "utang" ? "out" : "in",
      amount,
      method,
      linkedObligationId: id,
    };
    return commit({
      entries: [entry, ...ledger.entries],
      obligations: ledger.obligations.map((row) => row.id === id ? { ...row, settled: row.settled + amount } : row),
    });
  }

  return <DemoLedgerContext.Provider value={{ ...ledger, ready, storageError, live, asOf, businessName, ownerEmail, role, resetDemo, addEntry, updateEntry, addObligation, updateObligation, recordPayment }}>{children}</DemoLedgerContext.Provider>;
}

export function useDemoLedger() {
  const value = useContext(DemoLedgerContext);
  if (!value) throw new Error("useDemoLedger must be used inside DemoLedgerProvider");
  return value;
}
