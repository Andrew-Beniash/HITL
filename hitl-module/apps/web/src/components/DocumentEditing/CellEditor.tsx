import { useEffect, useRef, useState } from "react";

export interface CellPosition {
  /** Top-left corner of the cell, in viewport coordinates */
  x: number;
  y: number;
  width: number;
  height: number;
  sheetName: string;
  row: number;
  col: number;
  currentValue: string;
}

interface CellEditorProps {
  documentId: string;
  cell: CellPosition;
  onClose: () => void;
  onSaved: () => void;
}

type Status = "idle" | "saving" | "failed";

export function CellEditor({ documentId, cell, onClose, onSaved }: CellEditorProps) {
  const [value, setValue] = useState(cell.currentValue);
  const [status, setStatus] = useState<Status>("idle");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleAccept = async () => {
    if (value === cell.currentValue) {
      onClose();
      return;
    }
    setStatus("saving");
    try {
      const res = await fetch(`/api/documents/${documentId}/cells`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: cell.sheetName,
          row: cell.row,
          col: cell.col,
          value,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      onSaved();
      onClose();
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div
      role="dialog"
      data-testid="cell-editor"
      aria-label={`Edit cell ${cell.sheetName} R${cell.row}C${cell.col}`}
      style={{
        position: "fixed",
        top: cell.y,
        left: cell.x,
        minWidth: Math.max(cell.width, 180),
        zIndex: 9999,
      }}
      className="rounded border border-cyan-400/50 bg-slate-800 shadow-xl"
    >
      <div className="flex items-center gap-2 p-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAccept();
          }}
          className="flex-1 rounded bg-slate-900 px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-cyan-400"
          aria-label="Cell value"
          disabled={status === "saving"}
        />
        <button
          type="button"
          onClick={handleAccept}
          disabled={status === "saving"}
          className="rounded bg-cyan-500 px-2 py-1 text-xs font-medium text-white hover:bg-cyan-400 disabled:opacity-50"
        >
          {status === "saving" ? "…" : "✓"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white"
        >
          ✕
        </button>
      </div>
      {status === "failed" && (
        <p className="px-2 pb-1 text-xs text-red-400" role="alert">
          Save failed. Try again.
        </p>
      )}
    </div>
  );
}
