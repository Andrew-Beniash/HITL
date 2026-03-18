import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMarkdownAutosave } from "./useMarkdownAutosave.js";

interface MarkdownEditorProps {
  documentId: string;
  initialContent: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "failed";

export function MarkdownEditor({ documentId, initialContent }: MarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [previewContent, setPreviewContent] = useState(initialContent);
  const [showPreview, setShowPreview] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(
    async (content: string) => {
      setSaveStatus("saving");
      try {
        const res = await fetch(`/api/documents/${documentId}/content`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        setSaveStatus(res.ok ? "saved" : "failed");
      } catch {
        setSaveStatus("failed");
      }
      // Reset to idle after 3 seconds
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
    [documentId]
  );

  const contentRef = useRef(initialContent);
  useMarkdownAutosave({ contentRef, onSave: handleSave });

  useEffect(() => {
    if (!editorRef.current) return;

    const handleChange = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const value = update.state.doc.toString();
      contentRef.current = value;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        setPreviewContent(value);
      }, 150);
    });

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle),
        handleChange,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.theme({
          "&": { height: "100%", backgroundColor: "#0f172a", color: "#e2e8f0" },
          ".cm-content": { fontFamily: "JetBrains Mono, monospace", fontSize: "0.875rem", padding: "1rem" },
          ".cm-line": { lineHeight: "1.6" },
          ".cm-focused": { outline: "none" },
          ".cm-cursor": { borderLeftColor: "#67e8f9" },
          ".cm-selectionBackground": { backgroundColor: "#1e3a5f !important" },
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose save via Cmd+S at the document level
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave(contentRef.current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-cyan-300">
            Markdown Editor
          </span>
          <SaveStatusBadge status={saveStatus} />
        </div>
        <button
          type="button"
          onClick={() => setShowPreview((p) => !p)}
          className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white"
        >
          {showPreview ? "Hide preview" : "Show preview"}
        </button>
      </div>

      {/* Split panes */}
      <div className={`flex min-h-0 flex-1 ${showPreview ? "divide-x divide-slate-700" : ""}`}>
        {/* Editor pane */}
        <div
          className={`min-h-0 overflow-auto ${showPreview ? "w-1/2" : "w-full"}`}
          ref={editorRef}
          aria-label="Markdown source editor"
        />

        {/* Preview pane */}
        {showPreview && (
          <div
            className="w-1/2 overflow-auto bg-slate-950 p-6 prose prose-invert prose-sm max-w-none"
            aria-label="Markdown preview"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {previewContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const map: Record<SaveStatus, { label: string; cls: string }> = {
    idle: { label: "", cls: "" },
    saving: { label: "Saving…", cls: "text-slate-400" },
    saved: { label: "Saved", cls: "text-emerald-400" },
    failed: { label: "Failed", cls: "text-red-400" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`text-xs ${cls}`} role="status" aria-live="polite">
      {label}
    </span>
  );
}
