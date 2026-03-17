interface BootstrapLoaderProps {
  step: number;
  total: number;
  steps: readonly string[];
}

export function BootstrapLoader({ step, total, steps }: BootstrapLoaderProps) {
  const progress = Math.round((step / total) * 100);
  const label = steps[step] ?? "Loading\u2026";

  return (
    <div
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      data-testid="bootstrap-loader"
    >
      <p>{label}</p>
      <progress value={progress} max={100} />
    </div>
  );
}
