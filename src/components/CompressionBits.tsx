import { formatBytes, ratioLabel, savingsPercent } from "@/lib/microxerox";

/** Green "1:3.2" pill showing the measured ratio. */
export function RatioBadge({ original, compressed }: { original: number; compressed: number }) {
  if (!original) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-success bg-success-subtle px-2 py-0.5 num text-[11px] font-semibold text-success">
      {ratioLabel(original, compressed)}
    </span>
  );
}

/** "42.1 KB → 4.2 KB" pair used in every file row. */
export function SizePair({
  original,
  compressed,
  withBadge = true,
}: {
  original: number;
  compressed: number;
  withBadge?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 num text-xs text-muted-foreground">
      <span className="line-through decoration-border">{formatBytes(original)}</span>
      <span aria-hidden>→</span>
      <span className="font-semibold text-foreground">{formatBytes(compressed)}</span>
      {withBadge ? <RatioBadge original={original} compressed={compressed} /> : null}
    </span>
  );
}

export function SavingsStat({
  label,
  original,
  compressed,
}: {
  label: string;
  original: number;
  compressed: number;
}) {
  return (
    <div className="gh-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 num text-2xl font-semibold text-foreground">
        {savingsPercent(original, compressed).toFixed(1)}%
      </p>
      <p className="mt-1 num text-xs text-muted-foreground">
        {formatBytes(original)} → {formatBytes(compressed)} · {ratioLabel(original, compressed)}
      </p>
    </div>
  );
}

/** A / B / C / D phase table shown after each upload. */
export function PhaseTable({
  phases,
  originalBytes,
}: {
  phases: { name: string; bytes: number; kept: boolean }[];
  originalBytes: number;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1 font-normal">phase</th>
          <th className="py-1 text-right font-normal">bytes</th>
          <th className="py-1 text-right font-normal">vs original</th>
          <th className="py-1 text-right font-normal">kept</th>
        </tr>
      </thead>
      <tbody>
        {phases.map((phase) => (
          <tr key={phase.name} className="border-t border-border">
            <td className="py-1 num">{phase.name}</td>
            <td className="py-1 text-right num">{phase.bytes}</td>
            <td className="py-1 text-right num">
              {savingsPercent(originalBytes, phase.bytes).toFixed(1)}%
            </td>
            <td
              className={`py-1 text-right num font-semibold ${phase.kept ? "text-success" : "text-muted-foreground"}`}
            >
              {phase.kept ? "✓" : "✗"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
