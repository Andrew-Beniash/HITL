import { useEffect, useRef } from "react";

interface UseMarkdownAutosaveParams {
  contentRef: React.MutableRefObject<string>;
  onSave: (content: string) => Promise<void>;
  intervalMs?: number;
}

/**
 * Fires onSave every `intervalMs` milliseconds (default 30s) automatically.
 * Manual Cmd+S is handled by MarkdownEditor directly; this hook owns the interval.
 */
export function useMarkdownAutosave({
  contentRef,
  onSave,
  intervalMs = 30_000,
}: UseMarkdownAutosaveParams): void {
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    const id = setInterval(() => {
      onSaveRef.current(contentRef.current);
    }, intervalMs);
    return () => clearInterval(id);
  }, [contentRef, intervalMs]);
}
