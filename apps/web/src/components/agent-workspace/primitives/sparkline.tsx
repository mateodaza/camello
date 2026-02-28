interface SparklineProps {
  data: number[];
  color?: string;
  className?: string;
}

export function Sparkline({ data, color = 'currentColor', className }: SparklineProps) {
  if (data.length === 0) {
    return <svg viewBox="0 0 80 24" className={className} aria-hidden />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 80;
      const y = 24 - ((v - min) / range) * 20 - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 80 24" className={className} aria-hidden preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
