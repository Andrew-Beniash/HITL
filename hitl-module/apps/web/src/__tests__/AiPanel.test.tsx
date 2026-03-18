import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiPanel } from "../components/AiPanel/AiPanel.js";
import { DiffView } from "../components/AiPanel/DiffView.js";
import { useStore } from "../store/index.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createStreamingResponse(chunks: string[]) {
  const pendingReads = chunks.map(() => deferred<ReadableStreamReadResult<Uint8Array>>());
  const doneRead = deferred<ReadableStreamReadResult<Uint8Array>>();
  let readIndex = 0;

  const body = {
    getReader: () => ({
      read: vi.fn().mockImplementation(() => {
        if (readIndex < pendingReads.length) {
          const next = pendingReads[readIndex];
          readIndex += 1;
          return next.promise;
        }

        return doneRead.promise;
      }),
    }),
  };

  return {
    response: {
      ok: true,
      body,
    } as unknown as Response,
    resolveChunk(index: number) {
      pendingReads[index]?.resolve({
        done: false,
        value: new TextEncoder().encode(chunks[index]),
      });
    },
    finish() {
      doneRead.resolve({ done: true, value: undefined });
    },
  };
}

describe("AiPanel streaming", () => {
  beforeEach(() => {
    useStore.setState({
      sessionId: "sess-1",
      documentId: "doc-1",
    });
  });

  it("streams assistant content incrementally and renders DONE metadata", async () => {
    const stream = createStreamingResponse([
      "First ",
      "second",
      '[DONE] {"confidence":"High","citations":[{"sourceId":"kb-123"}],"editSuggestion":{"unifiedDiff":"@@\\n-old\\n+new"},"kbUnavailable":true}',
    ]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stream.response));

    render(
      <AiPanel
        documentId="doc-1"
        selectionContext={null}
        onDismissSelection={vi.fn()}
      />
    );

    await userEvent.type(
      screen.getByPlaceholderText("Ask the AI assistant about this document"),
      "Check this document"
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    act(() => {
      stream.resolveChunk(0);
    });

    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    act(() => {
      stream.resolveChunk(1);
    });

    await waitFor(() => {
      expect(screen.getByText(/First second/)).toBeInTheDocument();
    });

    act(() => {
      stream.resolveChunk(2);
      stream.finish();
    });

    await waitFor(() => {
      expect(screen.getByText("Confidence: High")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "kb-123" })).toHaveAttribute(
        "href",
        "/kb/sources/kb-123"
      );
      expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
      expect(
        screen.getByText(
          "Knowledge base is currently unavailable. Results may be incomplete."
        )
      ).toBeInTheDocument();
    });
  });

  it("quick action submits immediately when a selection is active", async () => {
    const stream = createStreamingResponse(['[DONE] {"confidence":"Medium"}']);
    const fetchMock = vi.fn().mockResolvedValue(stream.response);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AiPanel
        documentId="doc-1"
        selectionContext={{ cfi: "epubcfi(/6/2)", text: "Selected text" }}
        onDismissSelection={vi.fn()}
      />
    );

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Explain" }));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.quickAction).toBe("explain");
    expect(payload.userQuery).toBe("Explain this section");
    expect(payload.selectionContext).toMatchObject({
      cfi: "epubcfi(/6/2)",
      text: "Selected text",
    });

    await act(async () => {
      stream.resolveChunk(0);
      stream.finish();
    });
  });
});

describe("DiffView", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders colored diff lines and posts the correct edit suggestion payload on accept", async () => {
    const eventHandler = vi.fn();
    window.addEventListener("hitl:epub-reload", eventHandler as EventListener);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DiffView
        documentId="doc-1"
        diff={"@@\n-old line\n context\n+new line"}
      />
    );

    expect(screen.getByTestId("diff-line-1")).toHaveClass("bg-rose-500/10");
    expect(screen.getByTestId("diff-line-3")).toHaveClass("bg-emerald-500/10");

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/documents/doc-1/annotations",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload).toEqual({
      type: "edit_suggestion",
      payload: {
        type: "edit_suggestion",
        unifiedDiff: "@@\n-old line\n context\n+new line",
        proposedText: "new line",
        originalText: "old line",
        confidence: "Medium",
      },
    });

    expect(eventHandler).toHaveBeenCalled();
    window.removeEventListener("hitl:epub-reload", eventHandler as EventListener);
  });
});
