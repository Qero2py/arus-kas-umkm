import type { ReactNode } from "react";

export function StatusPill({ tone, children }: { tone: "green" | "amber" | "red" | "neutral"; children: ReactNode }) {
  const styles = {
    green: "bg-[#e7f0e9] text-[#356548] ring-[#c8ddce]",
    amber: "bg-[#f7efde] text-[#80652e] ring-[#e9d9b5]",
    red: "bg-[#f8e9e5] text-[#a14432] ring-[#ebc9c0]",
    neutral: "bg-secondary text-muted-foreground ring-border",
  }[tone];

  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${styles}`}>{children}</span>;
}
