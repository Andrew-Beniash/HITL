import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Annotation } from "@hitl/shared-types";
import { useAnnotations } from "../../store/index.js";
import { AnnotationItem } from "./AnnotationItem.js";
import { FilterBar } from "./FilterBar.js";
import { ProgressBar } from "./ProgressBar.js";
import { matchesFilter } from "./filtering.js";
import { sortAnnotations } from "./annotation-sorter.js";
import { useAnnotationNavigation } from "./useAnnotationNavigation.js";

interface AttentionPanelProps {
  rendition: any | null;
  documentId?: string;
}

export function AttentionPanel({ rendition, documentId }: AttentionPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const {
    annotations,
    focusedAnnotationId,
    filterState,
    resolvedCount,
    totalCriticalCount,
    setFocusedAnnotation,
    upsertAnnotation,
  } = useAnnotations();

  useAnnotationNavigation(rendition);

  const handleResolve = useCallback(
    async (annotationId: string) => {
      if (!documentId) return;
      const res = await fetch(
        `/api/documents/${documentId}/annotations/${annotationId}/resolve`,
        { method: "POST" }
      );
      if (res.ok) {
        const annotation = annotations.find((a) => a.id === annotationId);
        if (annotation) upsertAnnotation({ ...annotation, status: "resolved" });
      }
    },
    [documentId, annotations, upsertAnnotation]
  );

  const sortedAnnotations = useMemo(
    () =>
      sortAnnotations(annotations).filter((annotation) =>
        matchesFilter(annotation, filterState)
      ),
    [annotations, filterState]
  );

  const virtualizer = useVirtualizer({
    count: sortedAnnotations.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    initialRect: { width: 320, height: 544 },
    overscan: 3,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const rows =
    virtualItems.length > 0
      ? virtualItems
      : sortedAnnotations.slice(0, 20).map((annotation, index) => ({
          key: annotation.id,
          index,
          size: 72,
          start: index * 72,
        }));

  const handleAnnotationClick = (annotation: Annotation) => {
    setFocusedAnnotation(annotation.id);
    void rendition?.display?.(annotation.cfi);
  };

  return (
    <aside className="flex min-h-[32rem] flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
            Attention
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Review items</h2>
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((value) => !value)}
          className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-200"
        >
          {filtersOpen ? "Hide Filters" : "Show Filters"}
        </button>
      </div>

      {filtersOpen ? <FilterBar /> : null}

      <ProgressBar resolved={resolvedCount} total={totalCriticalCount} />

      <div
        ref={scrollRef}
        className="relative h-[34rem] overflow-auto rounded-2xl border border-slate-800 bg-slate-950/40"
        data-testid="attention-scroll"
      >
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          data-testid="attention-virtualizer"
        >
          {rows.map((virtualRow) => {
            const annotation = sortedAnnotations[virtualRow.index];

            return (
              <AnnotationItem
                key={annotation.id}
                annotation={annotation}
                isFocused={annotation.id === focusedAnnotationId}
                onClick={() => handleAnnotationClick(annotation)}
                onResolve={documentId ? handleResolve : undefined}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              />
            );
          })}
        </div>
      </div>
    </aside>
  );
}
