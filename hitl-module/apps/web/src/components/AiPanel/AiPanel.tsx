import { useMemo, useState } from "react";
import type { AiQueryPayload } from "@hitl/shared-types";
import { useSession } from "../../store/index.js";
import { AiMessage } from "./AiMessage.js";
import { useAiStream } from "./hooks/useAiStream.js";

interface SelectionContext {
  cfi: string;
  text: string;
}

interface AiPanelProps {
  documentId: string;
  selectionContext: SelectionContext | null;
  onDismissSelection: () => void;
}

const QUICK_ACTIONS: Array<{
  action: NonNullable<AiQueryPayload["quickAction"]>;
  label: string;
  prompt: string;
}> = [
  { action: "explain", label: "Explain", prompt: "Explain this section" },
  { action: "validate", label: "Validate", prompt: "Validate against the knowledge base" },
  { action: "suggest_edit", label: "Suggest Edit", prompt: "Suggest an edit for this selection" },
  { action: "compliance", label: "Compliance", prompt: "Check this section for compliance issues" },
  { action: "summarise", label: "Summarise", prompt: "Summarise this section" },
];

export function AiPanel({
  documentId,
  selectionContext,
  onDismissSelection,
}: AiPanelProps) {
  const { sessionId } = useSession();
  const { messages, isStreaming, submitQuery, clearMessages } = useAiStream();
  const [inputText, setInputText] = useState("");
  const [selectedQuickAction, setSelectedQuickAction] =
    useState<AiQueryPayload["quickAction"]>();

  const selectionChipText = useMemo(
    () =>
      selectionContext?.text.length && selectionContext.text.length > 56
        ? `${selectionContext.text.slice(0, 56)}...`
        : selectionContext?.text ?? null,
    [selectionContext]
  );

  const handleSubmit = async (
    nextQuickAction = selectedQuickAction,
    nextInput = inputText
  ) => {
    if (!sessionId || !nextInput.trim()) {
      return;
    }

    const payload: AiQueryPayload = {
      sessionId,
      documentId,
      userQuery: nextInput.trim(),
      selectionContext: selectionContext
        ? {
            cfi: selectionContext.cfi,
            text: selectionContext.text,
            chapterTitle: "Selected excerpt",
          }
        : undefined,
      quickAction: nextQuickAction,
    };

    await submitQuery(payload);
    setInputText("");
    setSelectedQuickAction(undefined);
  };

  const handleQuickAction = async (
    action: NonNullable<AiQueryPayload["quickAction"]>,
    prompt: string
  ) => {
    setSelectedQuickAction(action);

    if (selectionContext) {
      await handleSubmit(action, prompt);
      return;
    }

    setInputText(prompt);
  };

  return (
    <aside className="flex min-h-[32rem] flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
            AI Assistant
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Context-aware analysis
          </h2>
        </div>
        <button
          type="button"
          onClick={clearMessages}
          className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-200"
        >
          Clear
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((item) => (
          <button
            key={item.action}
            type="button"
            onClick={() => void handleQuickAction(item.action, item.prompt)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              selectedQuickAction === item.action
                ? "bg-cyan-400 text-slate-950"
                : "border border-slate-700 text-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {selectionContext && selectionChipText ? (
        <div className="flex items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
          <span className="truncate">{selectionChipText}</span>
          <button
            type="button"
            onClick={onDismissSelection}
            className="ml-auto rounded-full px-2 text-cyan-200"
            aria-label="Dismiss selection"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="flex min-h-[18rem] flex-1 flex-col gap-3 overflow-auto rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
        {messages.map((message) => (
          <AiMessage key={message.id} message={message} documentId={documentId} />
        ))}
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <textarea
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          disabled={isStreaming}
          rows={4}
          placeholder="Ask the AI assistant about this document"
          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {isStreaming ? "Streaming response..." : "Ready"}
          </p>
          <button
            type="submit"
            disabled={isStreaming || !inputText.trim()}
            className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}

