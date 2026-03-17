import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import Epub, { type Book, type Contents, type Location, type Rendition } from "epubjs";
import { useFont, useSession } from "../../store/index.js";
import { getPlatformStylesheetUrl } from "../../lib/platform-stylesheet.js";

export interface EpubViewerHandle {
  navigate: (cfi: string) => void;
  getCurrentCfi: () => string | null;
  getTextByCfi: (cfi: string) => string;
}

export interface EpubViewerProps {
  epubUrl: string;
  initialCfi?: string;
  zoomLevel?: number;
  zoomMode: "fixed" | "reflow";
  diffMode?: boolean;
  diffEpubUrl?: string;
  onLocationChange: (cfi: string, chapter: string) => void;
  onSelectionChange: (cfi: string, text: string) => void;
}

const DEFAULT_FONT_PROFILE = {
  id: "default-platform-profile",
  tenantId: "default",
  name: "Default",
  isActive: true,
  config: {
    font: {
      body: { family: "Inter", size: "1rem" },
      heading: {
        family: "Inter",
        scale: { h1: 2, h2: 1.5, h3: 1.25, h4: 1.125, h5: 1, h6: 0.875 },
      },
      mono: { family: "JetBrains Mono" },
      lineHeight: 1.6,
      tableHeader: { weight: 600 },
    },
  },
} as const;

export const EpubViewer = forwardRef<EpubViewerHandle, EpubViewerProps>(
  function EpubViewer(
    {
      epubUrl,
      initialCfi,
      zoomLevel = 100,
      zoomMode,
      diffMode = false,
      diffEpubUrl,
      onLocationChange,
      onSelectionChange,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const diffContainerRef = useRef<HTMLDivElement | null>(null);
    const bookRef = useRef<Book | null>(null);
    const diffBookRef = useRef<Book | null>(null);
    const renditionRef = useRef<Rendition | null>(null);
    const diffRenditionRef = useRef<Rendition | null>(null);
    const currentCfiRef = useRef<string | null>(initialCfi ?? null);
    const syncLockRef = useRef(false);

    const { fontProfile } = useFont();
    const { documentId } = useSession();
    const activeFontProfile = fontProfile ?? DEFAULT_FONT_PROFILE;
    const stylesheetUrl = useMemo(
      () => getPlatformStylesheetUrl(activeFontProfile),
      [activeFontProfile]
    );

    useImperativeHandle(
      ref,
      () => ({
        navigate: (cfi: string) => {
          currentCfiRef.current = cfi;
          void renditionRef.current?.display(cfi);
        },
        getCurrentCfi: () => currentCfiRef.current,
        getTextByCfi: (cfi: string) => {
          const range =
            renditionRef.current?.getRange?.(cfi) ?? bookRef.current?.getRange(cfi);

          return range?.toString() ?? "";
        },
      }),
      []
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container || !epubUrl) {
        return;
      }

      const mainBook = Epub(epubUrl);
      const mainRendition = mainBook.renderTo(container, {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: zoomMode === "reflow" ? "scrolled-doc" : "paginated",
      });

      bookRef.current = mainBook;
      renditionRef.current = mainRendition;

      const handleContent = (contents: Contents) => {
        contents.addStylesheet(stylesheetUrl);

        contents.document?.addEventListener("selectionchange", () => {
          const selection = contents.window.getSelection();
          if (!selection || selection.isCollapsed || !bookRef.current?.getCfiFromRange) {
            return;
          }

          const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
          if (!range) {
            return;
          }

          const cfi = bookRef.current.getCfiFromRange(range);
          onSelectionChange(cfi, selection.toString());
        });
      };

      const handleRelocated = (location: Location) => {
        currentCfiRef.current = location.start.cfi;
        onLocationChange(location.start.cfi, location.start.href);

        if (documentId) {
          window.sessionStorage.setItem(
            `hitl:location:${documentId}`,
            location.start.cfi
          );
        }
      };

      const handleSelected = (cfi: string, contents: Contents) => {
        const text = contents.window.getSelection()?.toString() ?? "";
        onSelectionChange(cfi, text);
      };

      mainRendition.hooks.content.register(handleContent);
      mainRendition.on("relocated", handleRelocated);
      mainRendition.on("selected", handleSelected);

      void mainRendition.display(initialCfi || undefined);

      if (diffMode && diffEpubUrl && diffContainerRef.current) {
        const compareBook = Epub(diffEpubUrl);
        const compareRendition = compareBook.renderTo(diffContainerRef.current, {
          width: "100%",
          height: "100%",
          spread: "none",
          flow: zoomMode === "reflow" ? "scrolled-doc" : "paginated",
        });

        diffBookRef.current = compareBook;
        diffRenditionRef.current = compareRendition;
        compareRendition.hooks.content.register(handleContent);
        void compareRendition.display(initialCfi || undefined);

        const syncDiff = (location: Location) => {
          if (syncLockRef.current) {
            return;
          }

          syncLockRef.current = true;
          void Promise.resolve(compareRendition.display(location.start.cfi)).finally(
            () => {
              syncLockRef.current = false;
            }
          );
        };

        const syncMain = (location: Location) => {
          if (syncLockRef.current) {
            return;
          }

          syncLockRef.current = true;
          void Promise.resolve(mainRendition.display(location.start.cfi)).finally(
            () => {
              syncLockRef.current = false;
            }
          );
        };

        mainRendition.on("relocated", syncDiff);
        compareRendition.on("relocated", syncMain);
      }

      return () => {
        renditionRef.current?.destroy?.();
        diffRenditionRef.current?.destroy?.();
        bookRef.current?.destroy?.();
        diffBookRef.current?.destroy?.();
        renditionRef.current = null;
        diffRenditionRef.current = null;
        bookRef.current = null;
        diffBookRef.current = null;
      };
    }, [
      diffEpubUrl,
      diffMode,
      documentId,
      epubUrl,
      initialCfi,
      onLocationChange,
      onSelectionChange,
      stylesheetUrl,
      zoomMode,
    ]);

    useEffect(() => {
      const container = containerRef.current;
      const diffContainer = diffContainerRef.current;

      if (zoomMode === "fixed") {
        const scale = zoomLevel / 100;
        const transform = `scale(${scale})`;

        if (container) {
          container.style.transform = transform;
          container.style.transformOrigin = "top left";
        }

        if (diffContainer) {
          diffContainer.style.transform = transform;
          diffContainer.style.transformOrigin = "top left";
        }

        return;
      }

      if (container) {
        container.style.transform = "";
        container.style.transformOrigin = "";
      }

      if (diffContainer) {
        diffContainer.style.transform = "";
        diffContainer.style.transformOrigin = "";
      }

      renditionRef.current?.themes.override("font-size", `${zoomLevel}%`);
      diffRenditionRef.current?.themes.override("font-size", `${zoomLevel}%`);
    }, [zoomLevel, zoomMode]);

    return (
      <div
        className={`grid h-full min-h-[32rem] gap-4 ${
          diffMode && diffEpubUrl ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        <div className="min-h-[32rem] overflow-auto rounded-2xl border border-slate-700/70 bg-white/95 p-3 shadow-inner">
          <div
            ref={containerRef}
            data-testid="epub-viewer-main"
            className="h-full min-h-[28rem] w-full"
          />
        </div>
        {diffMode && diffEpubUrl ? (
          <div className="min-h-[32rem] overflow-auto rounded-2xl border border-slate-700/70 bg-white/95 p-3 shadow-inner">
            <div
              ref={diffContainerRef}
              data-testid="epub-viewer-diff"
              className="h-full min-h-[28rem] w-full"
            />
          </div>
        ) : null}
      </div>
    );
  }
);

