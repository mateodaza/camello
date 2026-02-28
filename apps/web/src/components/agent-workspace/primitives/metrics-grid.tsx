import { StatCard } from '@/components/stat-card';
import { BarChartCss } from './bar-chart-css';

interface MetricsGridProps {
  metrics: Array<{ label: string; value: string | number }>;
  barChart?: { bars: Array<{ label: string; value: number; color?: string }> };
}

export function MetricsGrid({ metrics, barChart }: MetricsGridProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {metrics.map((m) => (
          <StatCard key={m.label} title={m.label} value={m.value} />
        ))}
      </div>
      {barChart && <BarChartCss bars={barChart.bars} />}
    </div>
  );
}
