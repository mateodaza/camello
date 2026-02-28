interface BarChartCssProps {
  bars: Array<{ label: string; value: number; color?: string }>;
}

export function BarChartCss({ bars }: BarChartCssProps) {
  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className="space-y-2">
      {bars.map((bar) => {
        const pct = Math.round((bar.value / max) * 100);
        return (
          <div key={bar.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm text-dune">{bar.label}</span>
            <div className="relative h-5 flex-1 rounded bg-charcoal/8">
              <div
                className="h-5 rounded transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: bar.color ?? 'var(--color-teal, #00897B)',
                }}
              />
            </div>
            <span className="w-10 text-right text-sm font-medium text-charcoal">{bar.value}</span>
          </div>
        );
      })}
    </div>
  );
}
