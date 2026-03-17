import type { CSSProperties } from "react";
import type { Annotation } from "@hitl/shared-types";

interface AnnotationItemProps {
  annotation: Annotation;
  isFocused: boolean;
  onClick: () => void;
  style: CSSProperties;
}

const TYPE_DOT: Record<string, string> = {
  critical_flag: "bg-rose-500",
  attention_marker: "bg-amber-400",
  validation_notice: "bg-sky-400",
  human_comment: "bg-emerald-400",
  review_request: "bg-violet-400",
  edit_suggestion: "bg-rose-300",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-200",
  resolved: "bg-emerald-500/15 text-emerald-200",
  rejected: "bg-slate-500/20 text-slate-300",
};

function formatRelativeTime(value: string) {
  const deltaMs = Date.now() - new Date(value).getTime();
  const deltaHours = Math.max(Math.round(deltaMs / (1000 * 60 * 60)), 0);

  if (deltaHours < 1) {
    const minutes = Math.max(Math.round(deltaMs / (1000 * 60)), 0);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  if (deltaHours < 24) {
    return `${deltaHours} hour${deltaHours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(deltaHours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function AnnotationItem({
  annotation,
  isFocused,
  onClick,
  style,
}: AnnotationItemProps) {
  const author = annotation.authorId ? "User" : "AI Agent";
  const excerpt = annotation.cfiText?.slice(0, 80) || "(no text)";

  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      data-testid={`attention-item-${annotation.id}`}
      className={`left-0 w-full rounded-2xl border bg-slate-900/85 p-4 text-left shadow-sm ${
        isFocused
          ? "border-cyan-300 ring-2 ring-cyan-300/40"
          : "border-slate-800 hover:border-slate-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              TYPE_DOT[annotation.type] ?? "bg-slate-400"
            }`}
          />
          <span className="truncate text-sm font-medium capitalize text-slate-100">
            {annotation.type.replaceAll("_", " ")}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wide ${
            STATUS_BADGE[annotation.status]
          }`}
        >
          {annotation.status}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-300">{excerpt}</p>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
        <span>{author}</span>
        <span>{formatRelativeTime(annotation.createdAt)}</span>
      </div>
    </button>
  );
}

