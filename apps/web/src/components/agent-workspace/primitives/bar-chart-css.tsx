interface BarChartCssProps {
  bars: Array<{ label: string; value: number; color?: string }>;
  ariaLabel?: string;
  formatValue?: (value: number) => string;
}

export function BarChartCss({ bars, ariaLabel, formatValue }: BarChartCssProps) {
  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className="space-y-1.5" role="list" aria-label={ariaLabel}>
      {bars.map((bar) => {
        const pct = Math.round((bar.value / max) * 100);
        return (
          <div key={bar.label} className="flex items-center gap-3" role="listitem" aria-label={`${bar.label}: ${formatValue ? formatValue(bar.value) : bar.value}`}>
            <span className="w-20 shrink-0 truncate text-xs text-dune">{bar.label}</span>
            <div className="relative h-4 flex-1 rounded bg-charcoal/8">
              <div
                className="h-4 rounded transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: bar.color ?? 'var(--color-teal, #00897B)',
                }}
              />
            </div>
            <span className="w-14 text-right text-xs font-medium text-charcoal">{formatValue ? formatValue(bar.value) : bar.value}</span>
          </div>
        );
      })}
    </div>
  );
}
