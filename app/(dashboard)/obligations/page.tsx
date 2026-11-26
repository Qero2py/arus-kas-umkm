"use client";

import { AgingSummary } from "@/components/aging-summary";
import { useDemoLedger } from "@/components/demo-ledger-provider";
import { ObligationsView } from "@/components/obligations-view";

export default function ObligationsPage() {
  const { accountingActive } = useDemoLedger();
  return accountingActive ? <AgingSummary compact /> : <ObligationsView />;
}
