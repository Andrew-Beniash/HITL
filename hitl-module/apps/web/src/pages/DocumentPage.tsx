import { useEffect, useMemo, useState } from "react";
import { AiPanel } from "../components/AiPanel/AiPanel.js";
import { AttentionPanel } from "../components/AttentionPanel/AttentionPanel.js";
import { EpubViewer } from "../components/EpubViewer/EpubViewer.js";
import { PresenceAvatarStack } from "../components/Toolbar/PresenceAvatarStack.js";
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
  const { documentId } = useSession();
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [rendition, setRendition] = useState<any | null>(null);
  const [viewerRefreshToken, setViewerRefreshToken] = useState(0);

  const locationState = useEpubLocation(documentId ?? "unknown-document");
  const initialCfi = currentLocation ?? locationState.savedCfi ?? undefined;

  useCollaboration({ sessionId, documentId, rendition });

  const viewerTitle = useMemo(() => {
    if (!sourceFormat) {
      return "Document Preview";
    }

    return `${sourceFormat.toUpperCase()} Preview`;
  }, [sourceFormat]);

  useEffect(() => {
    const handleReload = () => {
      setViewerRefreshToken((value) => value + 1);
    };

    window.addEventListener("hitl:epub-reload", handleReload as EventListener);
    return () => {
      window.removeEventListener("hitl:epub-reload", handleReload as EventListener);
    };
  }, []);

  if (!epubUrl) {
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
        <PresenceAvatarStack rendition={rendition} />

        {selectionState ? (
          <div className="max-w-md rounded-2xl border border-cyan-400/20 bg-slate-900/80 px-4 py-3 text-sm text-slate-200">
            <p className="font-medium text-cyan-200">Selected text</p>
            <p className="mt-2 line-clamp-3">{selectionState.text}</p>
          </div>
        ) : null}
      </header>

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
        <AttentionPanel rendition={rendition} />
        <EpubViewer
          key={`${epubUrl}:${viewerRefreshToken}`}
          epubUrl={epubUrl}
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
        <AiPanel
          documentId={documentId ?? "unknown-document"}
          selectionContext={selectionState}
          onDismissSelection={() => setSelectionState(null)}
        />
      </div>
    </section>
  );
}
