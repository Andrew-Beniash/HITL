interface ConfidenceBadgeProps {
  level: string;
}

const LEVEL_STYLES: Record<string, string> = {
  High: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  Medium: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  Low: "bg-rose-500/15 text-rose-200 border-rose-500/30",
};

export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  return (
    <span
      data-testid="confidence-badge"
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
        LEVEL_STYLES[level] ?? "bg-slate-700 text-slate-200 border-slate-600"
      }`}
    >
      Confidence: {level}
    </span>
  );
}

