import { useCallback, useEffect, useRef, useState } from "react";
import type { Rendition } from "epubjs";
import type { CellPosition } from "./CellEditor.js";

interface UseXlsxCellInteractionParams {
  rendition: Rendition | null;
  enabled: boolean;
}

interface UseXlsxCellInteractionResult {
  activeCell: CellPosition | null;
  clearActiveCell: () => void;
}

/**
 * Attaches a click listener inside the EPUB iframe.
 * When a `<td>` or `<th>` with data-sheet / data-row / data-col attributes is
 * clicked, resolves the cell's bounding rect to parent-frame coordinates and
 * exposes it as `activeCell`.
 *
 * The EPUB conversion pipeline must emit those data-* attributes on table cells.
 */
export function useXlsxCellInteraction({
  rendition,
  enabled,
}: UseXlsxCellInteractionParams): UseXlsxCellInteractionResult {
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
  const renditionRef = useRef(rendition);

  useEffect(() => {
    renditionRef.current = rendition;
  }, [rendition]);

  const handleClick = useCallback((e: MouseEvent) => {
    const target = (e.target as Element).closest("td[data-row], th[data-row]");
    if (!target) return;

    const sheetName = target.getAttribute("data-sheet") ?? "Sheet1";
    const row = Number(target.getAttribute("data-row") ?? "0");
    const col = Number(target.getAttribute("data-col") ?? "0");
    const currentValue = (target as HTMLElement).innerText.trim();

    // Resolve cell rect to parent-frame coordinates.
    // The rendition mounts an <iframe>; we need the iframe's offset to translate.
    const cellRect = target.getBoundingClientRect();

    // Find the iframe hosting this document
    const ownerDoc = (e.target as Node).ownerDocument;
    const iframe = Array.from(
      document.querySelectorAll<HTMLIFrameElement>("iframe")
    ).find((f) => f.contentDocument === ownerDoc);

    let x = cellRect.left;
    let y = cellRect.top;

    if (iframe) {
      const iframeRect = iframe.getBoundingClientRect();
      x = cellRect.left + iframeRect.left;
      y = cellRect.top + iframeRect.top;
    }

    setActiveCell({
      x,
      y,
      width: cellRect.width,
      height: cellRect.height,
      sheetName,
      row,
      col,
      currentValue,
    });
  }, []);

  useEffect(() => {
    if (!enabled || !rendition) return;

    // epub.js fires 'rendered' each time a chapter loads; re-attach then
    const attachListeners = () => {
      const views = (rendition as any).views?.();
      if (!views) return;
      for (const view of views) {
        view.document?.addEventListener("click", handleClick);
      }
    };

    rendition.on("rendered", attachListeners);
    attachListeners();

    return () => {
      rendition.off("rendered", attachListeners);
      const views = (rendition as any).views?.();
      if (!views) return;
      for (const view of views) {
        view.document?.removeEventListener("click", handleClick);
      }
    };
  }, [rendition, enabled, handleClick]);

  const clearActiveCell = useCallback(() => setActiveCell(null), []);

  return { activeCell, clearActiveCell };
}
