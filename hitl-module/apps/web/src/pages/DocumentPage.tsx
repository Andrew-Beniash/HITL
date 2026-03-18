import { useEffect, useMemo, useState } from "react";
import { AiPanel } from "../components/AiPanel/AiPanel.js";
import { AttentionPanel } from "../components/AttentionPanel/AttentionPanel.js";
import { EpubViewer } from "../components/EpubViewer/EpubViewer.js";
import { PresenceAvatarStack } from "../components/Toolbar/PresenceAvatarStack.js";
import { MarkdownEditor } from "../components/DocumentEditing/MarkdownEditor.js";
import { CellEditor } from "../components/DocumentEditing/CellEditor.js";
import { VersionHistoryPanel } from "../components/DocumentEditing/VersionHistoryPanel.js";
import { useXlsxCellInteraction } from "../components/DocumentEditing/useXlsxCellInteraction.js";
import { useEpubLocation } from "../components/EpubViewer/useEpubLocation.js";
import { useCollaboration } from "../hooks/useCollaboration.js";
import { useDocument, useSession } from "../store/index.js";

interface SelectionState {
  cfi: string;
  text: string;
}

export function DocumentPage() {
  const { epubUrl, sourceFormat, currentLocation, setCurrentLocation, setCurrentChapter } =
    useDocument();
  const { documentId, sessionId } = useSession();
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [rendition, setRendition] = useState<any | null>(null);
  const [viewerRefreshToken, setViewerRefreshToken] = useState(0);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [activeEpubUrl, setActiveEpubUrl] = useState<string | null>(null);

  const locationState = useEpubLocation(documentId ?? "unknown-document");
  const initialCfi = currentLocation ?? locationState.savedCfi ?? undefined;

  useCollaboration({ sessionId, documentId, rendition });

  const isXlsx = sourceFormat === "xlsx";
  const isMarkdown = sourceFormat === "md";

  const { activeCell, clearActiveCell } = useXlsxCellInteraction({
    rendition,
    enabled: isXlsx,
  });

  const viewerTitle = useMemo(() => {
    if (!sourceFormat) {
      return "Document Preview";
    }
    return `${sourceFormat.toUpperCase()} Preview`;
  }, [sourceFormat]);

  const displayEpubUrl = activeEpubUrl ?? epubUrl;

  useEffect(() => {
    const handleReload = () => {
      setViewerRefreshToken((value) => value + 1);
    };

    window.addEventListener("hitl:epub-reload", handleReload as EventListener);
    return () => {
      window.removeEventListener("hitl:epub-reload", handleReload as EventListener);
    };
  }, []);

  if (!displayEpubUrl) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-600 bg-slate-950/50 p-8 text-slate-300">
        EPUB document is not available for this session.
      </section>
    );
  }

  return (
    <section className="flex min-h-screen flex-col gap-5 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
            {viewerTitle}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Review workspace
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <PresenceAvatarStack rendition={rendition} />
          <button
            type="button"
            onClick={() => setShowVersionHistory((v) => !v)}
            className={`rounded px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
              showVersionHistory
                ? "bg-cyan-400/10 text-cyan-300 ring-cyan-300/40"
                : "text-slate-400 ring-slate-600 hover:text-white"
            }`}
          >
            Version history
          </button>
          {activeEpubUrl && (
            <button
              type="button"
              onClick={() => setActiveEpubUrl(null)}
              className="rounded px-3 py-1.5 text-xs font-medium text-amber-300 ring-1 ring-amber-300/40 hover:bg-amber-400/10"
            >
              ← Back to latest
            </button>
          )}
        </div>

        {selectionState ? (
          <div className="max-w-md rounded-2xl border border-cyan-400/20 bg-slate-900/80 px-4 py-3 text-sm text-slate-200">
            <p className="font-medium text-cyan-200">Selected text</p>
            <p className="mt-2 line-clamp-3">{selectionState.text}</p>
          </div>
        ) : null}
      </header>

      {showVersionHistory && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-cyan-300">
              Version history
            </span>
            <button
              type="button"
              onClick={() => setShowVersionHistory(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <VersionHistoryPanel
            documentId={documentId ?? "unknown-document"}
            onVersionSelect={(url) => {
              setActiveEpubUrl(url);
              setShowVersionHistory(false);
              setViewerRefreshToken((t) => t + 1);
            }}
          />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
        <AttentionPanel rendition={rendition} documentId={documentId ?? undefined} />

        <div className="flex flex-col gap-4">
          <EpubViewer
            key={`${displayEpubUrl}:${viewerRefreshToken}`}
            epubUrl={displayEpubUrl}
            initialCfi={initialCfi}
            zoomMode="fixed"
            onRenditionReady={setRendition}
            onLocationChange={(cfi, chapter) => {
              setCurrentLocation(cfi);
              setCurrentChapter(chapter);
              locationState.saveLocation(cfi);
            }}
            onSelectionChange={(cfi, text) => {
              setSelectionState({ cfi, text });
            }}
          />

          {isMarkdown && documentId && (
            <div className="h-96 overflow-hidden rounded-2xl border border-slate-700">
              <MarkdownEditor
                documentId={documentId}
                initialContent=""
              />
            </div>
          )}
        </div>

        <AiPanel
          documentId={documentId ?? "unknown-document"}
          selectionContext={selectionState}
          onDismissSelection={() => setSelectionState(null)}
        />
      </div>

      {/* XLSX cell editor overlay */}
      {activeCell && documentId && (
        <CellEditor
          documentId={documentId}
          cell={activeCell}
          onClose={clearActiveCell}
          onSaved={() => setViewerRefreshToken((t) => t + 1)}
        />
      )}
    </section>
  );
}
