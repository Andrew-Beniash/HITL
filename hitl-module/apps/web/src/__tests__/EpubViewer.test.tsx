import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FontProfile } from "@hitl/shared-types";
import { EpubViewer } from "../components/EpubViewer/EpubViewer.js";
import { useStore } from "../store/index.js";

type EventHandler = (...args: any[]) => void;

const epubMockState = vi.hoisted(() => {
  const books: Array<{
    url: string;
    rendition: {
      handlers: Record<string, EventHandler[]>;
      registerContentHook: EventHandler | null;
      display: ReturnType<typeof vi.fn>;
      renderTo: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      themes: { override: ReturnType<typeof vi.fn> };
      getRange: ReturnType<typeof vi.fn>;
    };
  }> = [];

  return { books };
});

vi.mock("epubjs", () => ({
  default: vi.fn((url: string) => {
    const rendition = {
      handlers: {} as Record<string, EventHandler[]>,
      registerContentHook: null as EventHandler | null,
      display: vi.fn(() => Promise.resolve()),
      renderTo: vi.fn(),
      destroy: vi.fn(),
      themes: { override: vi.fn() },
      getRange: vi.fn(() => null),
      currentLocation: vi.fn(() => ({
        start: {
          cfi: "epubcfi(/6/4)",
          href: "chapter-1.xhtml",
        },
      })),
    };

    const book = {
      renderTo: vi.fn(() => ({
        hooks: {
          content: {
            register: (cb: EventHandler) => {
              rendition.registerContentHook = cb;
            },
          },
        },
        themes: rendition.themes,
        display: rendition.display,
        on: (event: string, cb: EventHandler) => {
          rendition.handlers[event] ??= [];
          rendition.handlers[event].push(cb);
        },
        off: vi.fn((event: string, cb?: EventHandler) => {
          if (!cb) {
            rendition.handlers[event] = [];
            return;
          }

          rendition.handlers[event] =
            rendition.handlers[event]?.filter((handler) => handler !== cb) ?? [];
        }),
        manager: {
          container: {
            getBoundingClientRect: () => ({
              left: 0,
              top: 0,
            }),
          },
        },
        getRange: rendition.getRange,
        currentLocation: rendition.currentLocation,
        destroy: rendition.destroy,
      })),
      getRange: rendition.getRange,
      getCfiFromRange: vi.fn(() => "epubcfi(/6/4)"),
      spine: {
        first: () => ({ href: "chapter-1.xhtml" }),
      },
      destroy: vi.fn(),
    };

    epubMockState.books.push({ url, rendition });
    return book;
  }),
}));

const fontProfile: FontProfile = {
  id: "profile-1",
  tenantId: "tenant-1",
  name: "Default",
  isActive: true,
  config: {
    font: {
      body: { family: "Inter", size: "1rem" },
      heading: {
        family: "IBM Plex Serif",
        scale: { h1: 2, h2: 1.5, h3: 1.25, h4: 1.125, h5: 1, h6: 0.875 },
      },
      mono: { family: "JetBrains Mono" },
      lineHeight: 1.6,
      tableHeader: { weight: 600 },
    },
  },
};

describe("EpubViewer", () => {
  const emit = (bookIndex: number, event: string, ...args: any[]) => {
    const handlers = epubMockState.books[bookIndex].rendition.handlers[event] ?? [];
    handlers.forEach((handler) => handler(...args));
  };

  beforeEach(() => {
    epubMockState.books.length = 0;
    sessionStorage.clear();
    useStore.setState({
      documentId: "doc-1",
      fontProfile,
    });

    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      configurable: true,
      value: vi.fn(() => "blob:platform-styles"),
    });
  });

  it("injects the platform stylesheet into loaded EPUB contents", async () => {
    render(
      <EpubViewer
        epubUrl="/documents/doc-1.epub"
        zoomMode="fixed"
        onLocationChange={vi.fn()}
        onSelectionChange={vi.fn()}
      />
    );

    const mainBook = epubMockState.books[0];
    const addStylesheet = vi.fn();
    const contents = {
      addStylesheet,
      window,
      document,
    };

    mainBook.rendition.registerContentHook?.(contents);

    expect(addStylesheet).toHaveBeenCalledWith("blob:platform-styles");
    const createObjectURL = URL.createObjectURL as ReturnType<typeof vi.fn>;
    const cssBlob = createObjectURL.mock.calls[0]?.[0];
    await expect(cssBlob.text()).resolves.toContain("thead th");
  });

  it("fires onLocationChange and persists the CFI when relocated", async () => {
    const onLocationChange = vi.fn();

    render(
      <EpubViewer
        epubUrl="/documents/doc-1.epub"
        zoomMode="fixed"
        onLocationChange={onLocationChange}
        onSelectionChange={vi.fn()}
      />
    );

    act(() => {
      emit(0, "relocated", {
        start: {
          cfi: "epubcfi(/6/2[chapter-1]!/4/1:0)",
          href: "chapter-1.xhtml",
        },
      });
    });

    expect(onLocationChange).toHaveBeenCalledWith(
      "epubcfi(/6/2[chapter-1]!/4/1:0)",
      "chapter-1.xhtml"
    );
    expect(sessionStorage.getItem("hitl:location:doc-1")).toBe(
      "epubcfi(/6/2[chapter-1]!/4/1:0)"
    );
  });

  it("applies fixed zoom via CSS transform scaling", async () => {
    const { getByTestId } = render(
      <EpubViewer
        epubUrl="/documents/doc-1.epub"
        zoomLevel={150}
        zoomMode="fixed"
        onLocationChange={vi.fn()}
        onSelectionChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(getByTestId("epub-viewer-main")).toHaveStyle({
        transform: "scale(1.5)",
      });
    });
  });

  it("mounts a second rendition in diff mode and syncs locations", async () => {
    render(
      <EpubViewer
        epubUrl="/documents/original.epub"
        diffMode
        diffEpubUrl="/documents/proposed.epub"
        zoomMode="fixed"
        onLocationChange={vi.fn()}
        onSelectionChange={vi.fn()}
      />
    );

    expect(epubMockState.books).toHaveLength(2);

    act(() => {
      emit(0, "relocated", {
        start: {
          cfi: "epubcfi(/6/8)",
          href: "chapter-2.xhtml",
        },
      });
    });

    await waitFor(() => {
      expect(epubMockState.books[1].rendition.display).toHaveBeenCalledWith(
        "epubcfi(/6/8)"
      );
    });
  });
});
