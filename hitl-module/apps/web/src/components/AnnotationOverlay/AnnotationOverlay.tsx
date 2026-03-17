import { useCallback, useEffect, useState } from "react";
import type { Annotation } from "@hitl/shared-types";
import { cfiToScreenRects } from "./cfi-utils.js";

interface AnnotationOverlayProps {
  annotations: Annotation[];
  rendition: any | null;
  focusedAnnotationId: string | null;
  onAnnotationClick: (id: string) => void;
}

export function renderAnnotationShape(
  annotation: Annotation,
  rect: DOMRect,
  isFocused: boolean
) {
  if (annotation.status === "resolved") {
    return (
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill="rgba(156,163,175,0.15)"
        className={isFocused ? "annotation-pulse" : undefined}
      />
    );
  }

  switch (annotation.type) {
    case "critical_flag":
      return (
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill="rgba(239,68,68,0.25)"
          className={isFocused ? "annotation-pulse" : undefined}
        />
      );
    case "attention_marker":
      return (
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill="rgba(251,191,36,0.25)"
          className={isFocused ? "annotation-pulse" : undefined}
        />
      );
    case "validation_notice":
      return (
        <>
          <line
            x1={8}
            y1={rect.y}
            x2={8}
            y2={rect.y + rect.height}
            stroke="rgba(59,130,246,0.95)"
            strokeWidth={3}
            className={isFocused ? "annotation-pulse" : undefined}
          />
          <circle
            cx={8}
            cy={rect.y + rect.height / 2}
            r={5}
            fill="rgba(59,130,246,0.95)"
            className={isFocused ? "annotation-pulse" : undefined}
          />
        </>
      );
    case "human_comment":
      return (
        <>
          <rect
            x={rect.x}
            y={rect.y + rect.height - 3}
            width={rect.width}
            height={2}
            fill="rgba(0,0,0,0)"
            stroke="rgba(16,185,129,0.95)"
            strokeWidth={2}
            className={isFocused ? "annotation-pulse" : undefined}
          />
          <path
            d={`M ${rect.x + rect.width + 8} ${rect.y + 2} h 12 v 9 h -7 l -3 3 v -3 h -2 z`}
            fill="rgba(16,185,129,0.95)"
            className={isFocused ? "annotation-pulse" : undefined}
          />
        </>
      );
    case "edit_suggestion":
      return (
        <>
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill="rgba(239,68,68,0.18)"
            className={isFocused ? "annotation-pulse" : undefined}
          />
          <line
            x1={rect.x}
            y1={rect.y + rect.height / 2}
            x2={rect.x + rect.width}
            y2={rect.y + rect.height / 2}
            stroke="rgba(185,28,28,0.95)"
            strokeWidth={2}
            className={isFocused ? "annotation-pulse" : undefined}
          />
        </>
      );
    case "review_request":
      return (
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill="rgba(125,211,252,0.18)"
          className={isFocused ? "annotation-pulse" : undefined}
        />
      );
    default:
      return null;
  }
}

export function AnnotationOverlay({
  annotations,
  rendition,
  focusedAnnotationId,
  onAnnotationClick,
}: AnnotationOverlayProps) {
  const [rects, setRects] = useState<Map<string, DOMRect[]>>(new Map());

  const redrawAll = useCallback(() => {
    if (!rendition) {
      setRects(new Map());
      return;
    }

    const nextRects = new Map<string, DOMRect[]>();

    annotations.forEach((annotation) => {
      nextRects.set(annotation.id, cfiToScreenRects(annotation.cfi, rendition));
    });

    setRects(nextRects);
  }, [annotations, rendition]);

  useEffect(() => {
    if (!rendition) {
      setRects(new Map());
      return;
    }

    rendition.on("relocated", redrawAll);
    redrawAll();

    return () => {
      rendition.off?.("relocated", redrawAll);
    };
  }, [redrawAll, rendition]);

  return (
    <div
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10 }}
      data-testid="annotation-overlay"
    >
      <svg
        width="100%"
        height="100%"
        style={{ pointerEvents: "none", overflow: "visible" }}
        data-testid="annotation-overlay-svg"
      >
        {annotations.map((annotation) => {
          const annotationRects = rects.get(annotation.id) || [];

          return annotationRects.map((rect, index) => (
            <g
              key={`${annotation.id}-${index}`}
              style={{ pointerEvents: "all", cursor: "pointer" }}
              onClick={() => onAnnotationClick(annotation.id)}
              data-testid={`annotation-${annotation.id}`}
            >
              {renderAnnotationShape(
                annotation,
                rect,
                annotation.id === focusedAnnotationId
              )}
            </g>
          ));
        })}
      </svg>
    </div>
  );
}

