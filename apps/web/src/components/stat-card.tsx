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
