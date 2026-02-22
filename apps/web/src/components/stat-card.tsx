import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-dune">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-dune">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export function UsageBar({
  label,
  used,
  limit,
  formatValue,
}: {
  label: string;
  used: number;
  limit: number;
  formatValue?: (n: number) => string;
}) {
  const isUnlimited = !Number.isFinite(limit);
  const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const fmt = formatValue ?? ((n) => n.toLocaleString());

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-charcoal">{label}</span>
        <span className="text-dune">
          {isUnlimited ? fmt(used) : `${fmt(used)} / ${fmt(limit)}`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-charcoal/8">
        <div
          className={`h-2 rounded-full transition-all ${pct > 80 ? 'bg-gold' : 'bg-teal'}`}
          style={{ width: isUnlimited ? '0%' : `${pct}%` }}
        />
      </div>
    </div>
  );
}
