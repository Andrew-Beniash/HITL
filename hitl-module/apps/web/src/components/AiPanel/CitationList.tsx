interface CitationListProps {
  citations: { sourceId: string }[];
}

export function CitationList({ citations }: CitationListProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {citations.map((citation) => (
        <a
          key={citation.sourceId}
          href={`/kb/sources/${citation.sourceId}`}
          className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200"
        >
          {citation.sourceId}
        </a>
      ))}
    </div>
  );
}

