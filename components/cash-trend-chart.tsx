import { formatRupiah } from "@/lib/format";

type TrendPoint = { date: string; label: string; value: number };

export function CashTrendChart({ points }: { points: TrendPoint[] }) {
  const width = 700;
  const height = 180;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const padding = Math.max((max - min) * 0.2, 500_000);
  const low = min - padding;
  const high = max + padding;
  const coords = points.map((point, index) => ({ x: 24 + index * (width - 48) / Math.max(points.length - 1, 1), y: 18 + ((high - point.value) / (high - low)) * (height - 36) }));
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return (
    <div>
      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground"><span>Terendah {formatRupiah(min)}</span><span>Tertinggi {formatRupiah(max)}</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Pergerakan saldo dari ${formatRupiah(points[0].value)} pada ${points[0].label} menjadi ${formatRupiah(points[points.length - 1].value)} pada ${points[points.length - 1].label}`} className="mt-3 h-[155px] w-full sm:h-[190px]">
        <line x1="24" x2={width - 24} y1="90" y2="90" stroke="#d9d5ca" strokeDasharray="4 6" />
        <path d={path} fill="none" stroke="#285d3e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((point, index) => <circle key={points[index].date} cx={point.x} cy={point.y} r="5" fill="#fff" stroke="#285d3e" strokeWidth="3" />)}
      </svg>
      <div className="flex justify-between gap-1 text-xs font-medium text-muted-foreground">{points.map((point) => <span key={point.date}>{point.label}</span>)}</div>
    </div>
  );
}
