import { useMemo, useState } from "react";
import { diff_match_patch } from "diff-match-patch";

interface DiffViewProps {
  diff: string;
  documentId: string;
}

function lineClass(line: string) {
  if (line.startsWith("+")) return "bg-emerald-500/10 text-emerald-200";
  if (line.startsWith("-")) return "bg-rose-500/10 text-rose-200";
  return "text-slate-300";
}

export function DiffView({ diff, documentId }: DiffViewProps) {
  const [dismissed, setDismissed] = useState(false);

  const lines = useMemo(() => diff.split("\n"), [diff]);
  const addedLines = useMemo(
    () =>
      lines
        .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
        .map((line) => line.slice(1))
        .join("\n"),
    [lines]
  );
  const removedLines = useMemo(
    () =>
      lines
        .filter((line) => line.startsWith("-") && !line.startsWith("---"))
        .map((line) => line.slice(1))
        .join("\n"),
    [lines]
  );

  if (dismissed) {
    return null;
  }

  const handleAccept = async () => {
    new diff_match_patch();
    const response = await fetch(`/documents/${documentId}/annotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "edit_suggestion",
        payload: {
          type: "edit_suggestion",
          unifiedDiff: diff,
          proposedText: addedLines,
          originalText: removedLines,
          confidence: "Medium",
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to accept edit suggestion");
    }

    window.dispatchEvent(
      new CustomEvent("hitl:epub-reload", { detail: { documentId } })
    );
  };

  const handleReject = () => {
    const confirmed = window.confirm("Reject this edit suggestion?");
    if (confirmed) {
      setDismissed(true);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
      <pre className="overflow-auto rounded-xl bg-slate-950 p-3 text-sm leading-6">
        <code>
          {lines.map((line, index) => (
            <div
              key={`${line}-${index}`}
              className={lineClass(line)}
              data-testid={`diff-line-${index}`}
            >
              {line || " "}
            </div>
          ))}
        </code>
      </pre>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void handleAccept()}
          className="rounded-full bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={handleReject}
          className="rounded-full border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

