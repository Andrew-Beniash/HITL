interface ProgressBarProps {
  resolved: number;
  total: number;
}

export function ProgressBar({ resolved, total }: ProgressBarProps) {
  const complete = total > 0 && resolved === total;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-200">
          {resolved} of {total} critical items resolved
        </p>
        {complete ? (
          <span
            aria-label="All critical items resolved"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"
          >
            ✓
          </span>
        ) : null}
      </div>
      <progress
        className="mt-3 h-2 w-full overflow-hidden rounded-full"
        value={resolved}
        max={total || 1}
        aria-label={`${resolved} of ${total} critical items resolved`}
      />
    </div>
  );
}

