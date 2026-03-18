import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CellEditor } from "../components/DocumentEditing/CellEditor.js";
import { VersionHistoryPanel } from "../components/DocumentEditing/VersionHistoryPanel.js";
import { useMarkdownAutosave } from "../components/DocumentEditing/useMarkdownAutosave.js";
import { useStore } from "../store/index.js";
import type { DocumentVersion } from "@hitl/shared-types";

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE_CELL = {
  x: 100,
  y: 200,
  width: 120,
  height: 30,
  sheetName: "Sheet1",
  row: 2,
  col: 3,
  currentValue: "Hello",
};

const VERSION_1: DocumentVersion = {
  id: "v1",
  documentId: "doc-1",
  versionNumber: 1,
  sourceS3Key: "tenant-1/doc-1/v1.xlsx",
  epubS3Key: "tenant-1/doc-1/v1.epub",
  conversionStatus: "complete",
  conversionManifest: null,
  createdAt: new Date("2025-01-01T10:00:00Z").toISOString(),
  createdBy: "alice",
};

const VERSION_2: DocumentVersion = {
  id: "v2",
  documentId: "doc-1",
  versionNumber: 2,
  sourceS3Key: "tenant-1/doc-1/v2.xlsx",
  epubS3Key: null,
  conversionStatus: "processing",
  conversionManifest: null,
  createdAt: new Date("2025-01-02T12:00:00Z").toISOString(),
  createdBy: "bob",
};

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    versionHistory: [],
  });
});

// ── CellEditor ─────────────────────────────────────────────────────────────────

describe("CellEditor", () => {
  it("renders with the current cell value pre-filled", () => {
    render(
      <CellEditor
        documentId="doc-1"
        cell={BASE_CELL}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox", { name: "Cell value" })).toHaveValue("Hello");
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();

    render(
      <CellEditor
        documentId="doc-1"
        cell={BASE_CELL}
        onClose={onClose}
        onSaved={vi.fn()}
      />
    );

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose without fetching when value is unchanged and Enter is pressed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();

    render(
      <CellEditor
        documentId="doc-1"
        cell={BASE_CELL}
        onClose={onClose}
        onSaved={vi.fn()}
      />
    );

    await userEvent.keyboard("{Enter}");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("PATCHes /api/documents/:id/cells on accept with changed value", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(
      <CellEditor
        documentId="doc-1"
        cell={BASE_CELL}
        onClose={onClose}
        onSaved={onSaved}
      />
    );

    const input = screen.getByRole("textbox", { name: "Cell value" });
    await userEvent.clear(input);
    await userEvent.type(input, "World");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/documents/doc-1/cells", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: "Sheet1",
          row: 2,
          col: 3,
          value: "World",
        }),
      });
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("shows error message when PATCH fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CellEditor
        documentId="doc-1"
        cell={BASE_CELL}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const input = screen.getByRole("textbox", { name: "Cell value" });
    await userEvent.clear(input);
    await userEvent.type(input, "Bad value");

    await userEvent.click(screen.getByRole("button", { name: "✓" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
    });
  });

  it("positions the overlay using cell coordinates via inline style", () => {
    render(
      <CellEditor
        documentId="doc-1"
        cell={BASE_CELL}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveStyle({ position: "fixed", top: "200px", left: "100px" });
  });
});

// ── VersionHistoryPanel ────────────────────────────────────────────────────────

describe("VersionHistoryPanel", () => {
  it("shows empty state when no versions exist", () => {
    render(
      <VersionHistoryPanel documentId="doc-1" onVersionSelect={vi.fn()} />
    );
    expect(screen.getByText(/no version history/i)).toBeInTheDocument();
  });

  it("renders all versions from store", () => {
    useStore.setState({ versionHistory: [VERSION_1, VERSION_2] });

    render(
      <VersionHistoryPanel documentId="doc-1" onVersionSelect={vi.fn()} />
    );

    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("calls onVersionSelect with EPUB URL when Load button is clicked", async () => {
    useStore.setState({ versionHistory: [VERSION_1] });
    const onVersionSelect = vi.fn();

    render(
      <VersionHistoryPanel documentId="doc-1" onVersionSelect={onVersionSelect} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Load" }));

    expect(onVersionSelect).toHaveBeenCalledWith(
      "/api/documents/doc-1/versions/v1/epub"
    );
  });

  it("does not show Load button for versions without EPUB", () => {
    useStore.setState({ versionHistory: [VERSION_2] });

    render(
      <VersionHistoryPanel documentId="doc-1" onVersionSelect={vi.fn()} />
    );

    expect(screen.queryByRole("button", { name: "Load" })).not.toBeInTheDocument();
    expect(screen.getByText("No EPUB")).toBeInTheDocument();
  });
});

// ── useMarkdownAutosave ────────────────────────────────────────────────────────

describe("useMarkdownAutosave", () => {
  it("fires onSave at the configured interval", () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const contentRef = { current: "# Hello" };

    renderHook(() =>
      useMarkdownAutosave({ contentRef, onSave, intervalMs: 1000 })
    );

    vi.advanceTimersByTime(1000);
    expect(onSave).toHaveBeenCalledWith("# Hello");

    vi.advanceTimersByTime(1000);
    expect(onSave).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("always calls the latest onSave reference", () => {
    vi.useFakeTimers();
    const onSave1 = vi.fn().mockResolvedValue(undefined);
    const onSave2 = vi.fn().mockResolvedValue(undefined);
    const contentRef = { current: "content" };

    const { rerender } = renderHook(
      ({ onSave }) => useMarkdownAutosave({ contentRef, onSave, intervalMs: 500 }),
      { initialProps: { onSave: onSave1 } }
    );

    rerender({ onSave: onSave2 });
    vi.advanceTimersByTime(500);

    expect(onSave1).not.toHaveBeenCalled();
    expect(onSave2).toHaveBeenCalledWith("content");

    vi.useRealTimers();
  });
});
