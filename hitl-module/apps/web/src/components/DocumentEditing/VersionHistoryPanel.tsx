import { useDocument } from "../../store/index.js";
import type { DocumentVersion } from "@hitl/shared-types";

interface VersionHistoryPanelProps {
  documentId: string;
  onVersionSelect: (epubUrl: string) => void;
}

export function VersionHistoryPanel({ documentId, onVersionSelect }: VersionHistoryPanelProps) {
  const { versionHistory } = useDocument();

  if (versionHistory.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400">No version history available.</div>
    );
  }

  return (
    <div className="flex flex-col" role="list" aria-label="Version history">
      {versionHistory.map((version) => (
        <VersionRow
          key={version.id}
          version={version}
          documentId={documentId}
          onSelect={onVersionSelect}
        />
      ))}
    </div>
  );
}

interface VersionRowProps {
  version: DocumentVersion;
  documentId: string;
  onSelect: (epubUrl: string) => void;
}

function VersionRow({ version, documentId, onSelect }: VersionRowProps) {
  const epubUrl =
    version.epubS3Key != null
      ? `/api/documents/${documentId}/versions/${version.id}/epub`
      : null;

  return (
    <div
      role="listitem"
      className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3 hover:bg-slate-800/60"
    >
      <div>
        <p className="text-sm font-medium text-white">v{version.versionNumber}</p>
        <p className="text-xs text-slate-400">
          {new Date(version.createdAt).toLocaleString()} · {version.createdBy}
        </p>
        <ConversionStatusBadge status={version.conversionStatus} />
      </div>

      {epubUrl ? (
        <button
          type="button"
          onClick={() => onSelect(epubUrl)}
          className="rounded px-3 py-1 text-xs font-medium text-cyan-300 ring-1 ring-cyan-300/40 hover:bg-cyan-400/10"
        >
          Load
        </button>
      ) : (
        <span className="text-xs text-slate-500">No EPUB</span>
      )}
    </div>
  );
}

function ConversionStatusBadge({ status }: { status: DocumentVersion["conversionStatus"] }) {
  const map: Record<DocumentVersion["conversionStatus"], { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "text-slate-400" },
    processing: { label: "Processing…", cls: "text-yellow-400" },
    complete: { label: "Complete", cls: "text-emerald-400" },
    failed: { label: "Failed", cls: "text-red-400" },
  };
  const { label, cls } = map[status];
  return <span className={`text-xs ${cls}`}>{label}</span>;
}
