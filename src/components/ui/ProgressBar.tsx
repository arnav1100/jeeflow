export default function ProgressBar({
  value,
  color = "#0284C7",
  trackColor = "#E2E8F0",
  height = 8,
}: {
  value: number; // 0-100
  color?: string;
  trackColor?: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ backgroundColor: trackColor, height }}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}
