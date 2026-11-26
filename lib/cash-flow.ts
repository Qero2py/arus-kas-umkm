export type CashMovement = {
  journalId?: string; date: string; category: string; type: "in" | "out"; amount: number;
};

function checkedSum(left: number, right: number) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new Error("Nilai arus kas melebihi batas Rupiah yang aman.");
  return value;
}

export function buildCashFlow(openingBalance: number, movements: readonly CashMovement[], start: string, end: string) {
  if (!Number.isSafeInteger(openingBalance) || start > end) throw new Error("Periode arus kas tidak valid.");
  let opening = openingBalance;
  let incoming = 0;
  let outgoing = 0;
  let transfersIn = 0;
  let transfersOut = 0;
  const groups = new Map<string, { incoming: number; outgoing: number }>();
  const journalCash = new Map<string, { incoming: number; outgoing: number }>();
  for (const item of movements) {
    if (!item.journalId) continue;
    const sums = journalCash.get(item.journalId) ?? { incoming: 0, outgoing: 0 };
    if (item.type === "in") sums.incoming = checkedSum(sums.incoming, item.amount);
    else if (item.type === "out") sums.outgoing = checkedSum(sums.outgoing, item.amount);
    journalCash.set(item.journalId, sums);
  }
  const internalJournals = new Set([...journalCash].filter(([, sums]) => sums.incoming > 0 && sums.incoming === sums.outgoing).map(([id]) => id));
  for (const item of movements) {
    if (!Number.isSafeInteger(item.amount) || item.amount < 0 || (item.type !== "in" && item.type !== "out"))
      throw new Error("Mutasi kas tidak valid.");
    const signed = item.type === "in" ? item.amount : -item.amount;
    if (item.date < start) { opening = checkedSum(opening, signed); continue; }
    if (item.date > end) continue;
    if (item.category === "cash_transfer" || (item.journalId && internalJournals.has(item.journalId))) {
      if (item.type === "in") transfersIn = checkedSum(transfersIn, item.amount);
      else transfersOut = checkedSum(transfersOut, item.amount);
      continue;
    }
    if (item.type === "in") incoming = checkedSum(incoming, item.amount);
    else outgoing = checkedSum(outgoing, item.amount);
    const previous = groups.get(item.category) ?? { incoming: 0, outgoing: 0 };
    groups.set(item.category, {
      incoming: item.type === "in" ? checkedSum(previous.incoming, item.amount) : previous.incoming,
      outgoing: item.type === "out" ? checkedSum(previous.outgoing, item.amount) : previous.outgoing,
    });
  }
  if (transfersIn !== transfersOut) throw new Error("Transfer internal tidak seimbang pada periode ini.");
  const net = checkedSum(incoming, -outgoing);
  const closing = checkedSum(opening, net);
  return { opening, incoming, outgoing, net, closing, transfers: transfersIn,
    groups: [...groups.entries()].map(([source, amounts]) => ({ source, ...amounts }))
      .sort((a, b) => (b.incoming + b.outgoing) - (a.incoming + a.outgoing)),
  };
}
