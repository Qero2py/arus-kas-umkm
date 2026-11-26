"use client";

import { AccountingCashbookView } from "@/components/accounting-cashbook-view";
import { TransactionsView } from "@/components/transactions-view";
import { useDemoLedger } from "@/components/demo-ledger-provider";

export default function TransactionsPage() {
  const { accountingActive } = useDemoLedger();
  return accountingActive ? <AccountingCashbookView /> : <TransactionsView />;
}
