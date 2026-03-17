import { useState } from "react";
import type { AnnotationType } from "@hitl/shared-types";

interface SelectionToolbarProps {
  selectionCfi: string | null;
  selectionText: string | null;
  documentId: string;
  onDismiss: () => void;
  selectionAnchorY?: number | null;
}

async function createAnnotation(
  documentId: string,
  type: AnnotationType,
  cfi: string,
  text: string
) {
  const payload =
    type === "critical_flag"
      ? { type, cfi, cfiText: text, payload: { type, reason: text } }
      : type === "edit_suggestion"
        ? {
            type,
            cfi,
            cfiText: text,
            payload: {
              type,
              originalText: text,
              proposedText: text,
              unifiedDiff: "",
              confidence: "Medium",
            },
          }
        : {
            type,
            cfi,
            cfiText: text,
            payload: { type, body: text, mentions: [] },
          };

  const response = await fetch(`/documents/${documentId}/annotations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to create annotation");
  }
}

export function SelectionToolbar({
  selectionCfi,
  selectionText,
  documentId,
  onDismiss,
  selectionAnchorY,
}: SelectionToolbarProps) {
  const [submitting, setSubmitting] = useState<AnnotationType | null>(null);

  if (!selectionCfi) {
    return null;
  }

  const top = Math.max((selectionAnchorY ?? 72) - 48, 16);

  const handleCreate = async (type: AnnotationType) => {
    if (!selectionText) {
      return;
    }

    setSubmitting(type);
    try {
      await createAnnotation(documentId, type, selectionCfi, selectionText);
      onDismiss();
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div
      className="fixed left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-700 bg-slate-950/95 px-3 py-2 shadow-2xl"
      style={{ top }}
      data-testid="selection-toolbar"
    >
      <button
        className="rounded-full bg-emerald-500 px-3 py-1 text-sm font-medium text-slate-950"
        disabled={submitting !== null}
        onClick={() => void handleCreate("human_comment")}
      >
        Comment
      </button>
      <button
        className="rounded-full bg-amber-400 px-3 py-1 text-sm font-medium text-slate-950"
        disabled={submitting !== null}
        onClick={() => void handleCreate("critical_flag")}
      >
        Flag
      </button>
      <button
        className="rounded-full bg-rose-400 px-3 py-1 text-sm font-medium text-slate-950"
        disabled={submitting !== null}
        onClick={() => void handleCreate("edit_suggestion")}
      >
        Suggest Edit
      </button>
    </div>
  );
}

