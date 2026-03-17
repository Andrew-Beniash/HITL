import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Annotation } from "@hitl/shared-types";
import {
  AnnotationOverlay,
  renderAnnotationShape,
} from "../components/AnnotationOverlay/AnnotationOverlay.js";
import { cfiToScreenRects } from "../components/AnnotationOverlay/cfi-utils.js";

function buildAnnotation(
  overrides: Partial<Annotation> = {}
): Annotation {
  return {
    id: "ann-1",
    sessionId: "sess-1",
    documentId: "doc-1",
    documentVersionId: "ver-1",
    authorId: "user-1",
    agentId: null,
    type: "critical_flag",
    cfi: "epubcfi(/6/2)",
    cfiText: "text",
    payload: { type: "critical_flag", reason: "Needs review" },
    status: "open",
    resolvedById: null,
    resolvedAt: null,
    createdAt: "2026-03-17T12:00:00.000Z",
    replies: [],
    ...overrides,
  } as Annotation;
}

describe("cfiToScreenRects", () => {
  it("translates iframe-relative rects to parent coordinates", () => {
    const rendition = {
      getRange: vi.fn(() => ({
        getClientRects: () => [
          { left: 10, top: 20, width: 30, height: 40 },
          { left: 50, top: 60, width: 70, height: 80 },
        ],
      })),
      manager: {
        container: {
          getBoundingClientRect: () => ({
            left: 100,
            top: 200,
          }),
        },
      },
    };

    const rects = cfiToScreenRects("epubcfi(/6/2)", rendition);

    expect(rects).toHaveLength(2);
    expect(rects[0]).toMatchObject({ x: 110, y: 220, width: 30, height: 40 });
    expect(rects[1]).toMatchObject({ x: 150, y: 260, width: 70, height: 80 });
  });

  it("returns an empty array when the range is missing", () => {
    const rendition = {
      getRange: vi.fn(() => null),
      manager: {
        container: {
          getBoundingClientRect: vi.fn(),
        },
      },
    };

    expect(cfiToScreenRects("epubcfi(/6/2)", rendition)).toEqual([]);
  });
});

describe("renderAnnotationShape", () => {
  const rect = new DOMRect(24, 48, 120, 20);

  it("renders the spec SVG for each supported annotation visual", () => {
    const { container, rerender } = render(
      <svg>{renderAnnotationShape(buildAnnotation(), rect, true)}</svg>
    );

    expect(container.querySelector("rect")?.getAttribute("fill")).toBe(
      "rgba(239,68,68,0.25)"
    );
    expect(container.querySelector("rect")).toHaveClass("annotation-pulse");

    rerender(
      <svg>
        {renderAnnotationShape(
          buildAnnotation({
            id: "ann-2",
            type: "attention_marker",
            payload: { type: "attention_marker", reason: "Check" },
          }),
          rect,
          false
        )}
      </svg>
    );
    expect(container.querySelector("rect")?.getAttribute("fill")).toBe(
      "rgba(251,191,36,0.25)"
    );

    rerender(
      <svg>
        {renderAnnotationShape(
          buildAnnotation({
            id: "ann-3",
            type: "validation_notice",
            payload: {
              type: "validation_notice",
              kbSourceId: "kb-1",
              validationResult: "fail",
              detail: "Mismatch",
            },
          }),
          rect,
          false
        )}
      </svg>
    );
    expect(container.querySelector("line")).toBeInTheDocument();
    expect(container.querySelector("circle")).toBeInTheDocument();

    rerender(
      <svg>
        {renderAnnotationShape(
          buildAnnotation({
            id: "ann-4",
            type: "human_comment",
            payload: { type: "human_comment", body: "Comment", mentions: [] },
          }),
          rect,
          false
        )}
      </svg>
    );
    expect(container.querySelector("path")).toBeInTheDocument();

    rerender(
      <svg>
        {renderAnnotationShape(
          buildAnnotation({
            id: "ann-5",
            type: "edit_suggestion",
            payload: {
              type: "edit_suggestion",
              originalText: "old",
              proposedText: "new",
              unifiedDiff: "",
              confidence: "Medium",
            },
          }),
          rect,
          false
        )}
      </svg>
    );
    expect(container.querySelectorAll("line")).toHaveLength(1);
    expect(container.querySelector("rect")?.getAttribute("fill")).toBe(
      "rgba(239,68,68,0.18)"
    );

    rerender(
      <svg>
        {renderAnnotationShape(
          buildAnnotation({
            id: "ann-6",
            status: "resolved",
          }),
          rect,
          false
        )}
      </svg>
    );
    expect(container.querySelector("rect")?.getAttribute("fill")).toBe(
      "rgba(156,163,175,0.15)"
    );
  });
});

describe("AnnotationOverlay", () => {
  it("redraws all annotation rects when the rendition relocates", async () => {
    const relocatedHandlers: Array<() => void> = [];
    let top = 30;

    const rendition = {
      getRange: vi.fn(() => ({
        getClientRects: () => [{ left: 10, top, width: 40, height: 12 }],
      })),
      manager: {
        container: {
          getBoundingClientRect: () => ({ left: 100, top: 200 }),
        },
      },
      on: vi.fn((event: string, cb: () => void) => {
        if (event === "relocated") {
          relocatedHandlers.push(cb);
        }
      }),
      off: vi.fn(),
    };

    render(
      <AnnotationOverlay
        annotations={[buildAnnotation()]}
        rendition={rendition}
        focusedAnnotationId={null}
        onAnnotationClick={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("annotation-ann-1").querySelector("rect")).toHaveAttribute(
        "y",
        "230"
      );
    });

    top = 80;
    act(() => {
      relocatedHandlers[0]?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId("annotation-ann-1").querySelector("rect")).toHaveAttribute(
        "y",
        "280"
      );
    });

    expect(screen.getByTestId("annotation-overlay-svg")).toHaveStyle({
      pointerEvents: "none",
    });
  });
});
