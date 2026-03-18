import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AiMessage as AiMessageModel } from "./hooks/useAiStream.js";
import { CitationList } from "./CitationList.js";
import { ConfidenceBadge } from "./ConfidenceBadge.js";
import { DiffView } from "./DiffView.js";

interface AiMessageProps {
  message: AiMessageModel;
  documentId: string;
}

export function AiMessage({ message, documentId }: AiMessageProps) {
  const isAssistant = message.role === "assistant";

  return (
    <article
      className={`rounded-2xl border p-4 ${
        isAssistant
          ? "border-slate-700 bg-slate-950/70 text-slate-100"
          : "border-cyan-500/20 bg-cyan-500/10 text-cyan-50"
      }`}
    >
      <p className="mb-3 text-xs uppercase tracking-[0.25em] text-slate-400">
        {message.role}
      </p>

      {isAssistant ? (
        <div data-testid={`assistant-message-${message.id}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="whitespace-pre-wrap">{message.content}</p>
      )}

      {isAssistant && message.metadata ? (
        <div className="mt-4 space-y-3">
          {message.metadata.confidence ? (
            <ConfidenceBadge level={message.metadata.confidence} />
          ) : null}
          {message.metadata.citations?.length ? (
            <CitationList citations={message.metadata.citations} />
          ) : null}
          {message.metadata.editSuggestion ? (
            <DiffView
              diff={message.metadata.editSuggestion.unifiedDiff}
              documentId={documentId}
            />
          ) : null}
          {message.metadata.kbUnavailable ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Knowledge base is currently unavailable. Results may be incomplete.
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

