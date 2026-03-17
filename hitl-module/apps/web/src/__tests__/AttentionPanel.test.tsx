import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "@hitl/shared-types";
import { AttentionPanel } from "../components/AttentionPanel/AttentionPanel.js";
import { matchesFilter } from "../components/AttentionPanel/filtering.js";
import { sortAnnotations } from "../components/AttentionPanel/annotation-sorter.js";
import { useStore } from "../store/index.js";

const hotkeyHandlers = vi.hoisted(
  () => new Map<string, (event: { preventDefault: () => void }) => void>()
);

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: (
    keys: string,
    handler: (event: { preventDefault: () => void }) => void
  ) => {
    hotkeyHandlers.set(keys, handler);
  },
}));

function makeAnnotation(
  index: number,
  overrides: Partial<Annotation> = {}
): Annotation {
  return {
    id: `ann-${index}`,
    sessionId: "sess-1",
    documentId: "doc-1",
    documentVersionId: "ver-1",
    authorId: index % 2 === 0 ? `user-${index}` : null,
    agentId: index % 2 === 0 ? null : `agent-${index}`,
    type: index % 3 === 0 ? "critical_flag" : index % 3 === 1 ? "attention_marker" : "human_comment",
    cfi: `epubcfi(/6/${String(index).padStart(3, "0")})`,
    cfiText: `Annotation excerpt ${index}`,
    payload:
      index % 3 === 0
        ? { type: "critical_flag", reason: "Critical" }
        : index % 3 === 1
          ? { type: "attention_marker", reason: "Attention" }
          : { type: "human_comment", body: "Comment", mentions: [] },
    status: index % 5 === 0 ? "resolved" : "open",
    resolvedById: null,
    resolvedAt: null,
    createdAt: "2026-03-17T12:00:00.000Z",
    replies: [],
    ...overrides,
  } as Annotation;
}

describe("attention helpers", () => {
  it("sorts critical flags first, then attention markers, then other annotations", () => {
    const annotations = [
      makeAnnotation(3, { type: "human_comment" }),
      makeAnnotation(1, { type: "attention_marker" }),
      makeAnnotation(2, { type: "critical_flag" }),
      makeAnnotation(4, { type: "critical_flag", cfi: "epubcfi(/6/001)" }),
    ];

    const sorted = sortAnnotations(annotations);

    expect(sorted.map((annotation) => annotation.type)).toEqual([
      "critical_flag",
      "critical_flag",
      "attention_marker",
      "human_comment",
    ]);
    expect(sorted[0].cfi).toBe("epubcfi(/6/001)");
  });

  it("matches filter across type, initiator, status, and date bounds", () => {
    const annotation = makeAnnotation(1, {
      type: "critical_flag",
      authorId: "user-1",
      agentId: null,
      status: "resolved",
      createdAt: "2026-03-17T10:00:00.000Z",
    });

    expect(
      matchesFilter(annotation, {
        type: "critical_flag",
        initiator: "human",
        status: "resolved",
        fromDate: new Date("2026-03-17T09:00:00.000Z"),
        toDate: new Date("2026-03-17T11:00:00.000Z"),
      })
    ).toBe(true);

    expect(
      matchesFilter(annotation, {
        type: "attention_marker",
        initiator: "human",
        status: "resolved",
      })
    ).toBe(false);
    expect(
      matchesFilter(annotation, {
        type: "critical_flag",
        initiator: "ai",
        status: "resolved",
      })
    ).toBe(false);
    expect(
      matchesFilter(annotation, {
        type: "critical_flag",
        initiator: "human",
        status: "open",
      })
    ).toBe(false);
  });
});

describe("AttentionPanel", () => {
  let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    hotkeyHandlers.clear();
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if ((this as HTMLElement).dataset.testid === "attention-scroll") {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 544,
          right: 320,
          width: 320,
          height: 544,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 72,
        right: 320,
        width: 320,
        height: 72,
        toJSON: () => ({}),
      } as DOMRect;
    };
    useStore.setState({
      annotations: [],
      focusedAnnotationId: null,
      filterState: {
        type: "all",
        initiator: "all",
        status: "all",
      },
      resolvedCount: 0,
      totalCriticalCount: 0,
    });
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("renders a virtualized list without DOM bloat for 500 annotations", async () => {
    const annotations = Array.from({ length: 500 }, (_, index) =>
      makeAnnotation(index)
    );
    useStore.setState({
      annotations,
      resolvedCount: annotations.filter(
        (annotation) =>
          annotation.type === "critical_flag" && annotation.status === "resolved"
      ).length,
      totalCriticalCount: annotations.filter(
        (annotation) => annotation.type === "critical_flag"
      ).length,
    });

    render(<AttentionPanel rendition={null} />);

    await waitFor(() => {
      const renderedItems = screen.queryAllByTestId(/attention-item-/);
      expect(renderedItems.length).toBeLessThanOrEqual(20);
    });

  });

  it("clicking an annotation displays its CFI and focuses it", async () => {
    const annotations = [
      makeAnnotation(1, { type: "human_comment" }),
      makeAnnotation(2, { type: "critical_flag" }),
    ];
    useStore.setState({
      annotations,
      totalCriticalCount: 1,
      resolvedCount: 0,
    });
    const rendition = { display: vi.fn() };

    render(<AttentionPanel rendition={rendition} />);

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-ann-2")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("attention-item-ann-2"));

    expect(rendition.display).toHaveBeenCalledWith(annotations[1].cfi);
    expect(useStore.getState().focusedAnnotationId).toBe("ann-2");
  });

  it("keyboard navigation wraps through critical flags at list boundaries", () => {
    const criticalA = makeAnnotation(1, { id: "critical-a", type: "critical_flag" });
    const criticalB = makeAnnotation(2, { id: "critical-b", type: "critical_flag" });
    useStore.setState({
      annotations: [
        criticalA,
        makeAnnotation(3, { type: "human_comment" }),
        criticalB,
      ],
      focusedAnnotationId: "critical-b",
      totalCriticalCount: 2,
      resolvedCount: 0,
    });
    const rendition = { display: vi.fn() };

    render(<AttentionPanel rendition={rendition} />);

    act(() => {
      hotkeyHandlers.get("ctrl+]")?.({ preventDefault: vi.fn() });
    });
    expect(useStore.getState().focusedAnnotationId).toBe("critical-a");
    expect(rendition.display).toHaveBeenCalledWith(criticalA.cfi);

    act(() => {
      hotkeyHandlers.get("ctrl+[")?.({ preventDefault: vi.fn() });
    });
    expect(useStore.getState().focusedAnnotationId).toBe("critical-b");
    expect(rendition.display).toHaveBeenCalledWith(criticalB.cfi);
  });

  it("progress bar reflects resolved critical items in real time", async () => {
    const annotations = [
      makeAnnotation(1, { type: "critical_flag", status: "resolved" }),
      makeAnnotation(2, { type: "critical_flag", status: "open" }),
      makeAnnotation(3, { type: "human_comment", status: "resolved" }),
    ];
    useStore.setState({
      annotations,
      resolvedCount: 1,
      totalCriticalCount: 2,
    });

    render(<AttentionPanel rendition={null} />);

    expect(
      screen.getByLabelText("1 of 2 critical items resolved")
    ).toBeInTheDocument();

    act(() => {
      useStore.getState().upsertAnnotation(
        makeAnnotation(2, { type: "critical_flag", status: "resolved" })
      );
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText("2 of 2 critical items resolved")
      ).toBeInTheDocument();
    });
  });
});
