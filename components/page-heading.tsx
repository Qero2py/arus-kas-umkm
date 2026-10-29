import type { ReactNode } from "react";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-5 border-b border-border/80 pb-7 sm:mb-9 sm:flex-row sm:items-end sm:justify-between sm:pb-8">
      <div className="max-w-2xl">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        <h1 className="font-serif text-[32px] font-medium leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[40px]">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-sm">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
