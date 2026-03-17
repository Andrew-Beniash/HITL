import { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useAnnotations } from "../../store/index.js";
import { sortAnnotations } from "./annotation-sorter.js";

export function useAnnotationNavigation(rendition: any | null) {
  const { annotations, focusedAnnotationId, setFocusedAnnotation } = useAnnotations();

  const sortedCriticalFlags = useMemo(
    () =>
      sortAnnotations(annotations).filter(
        (annotation) => annotation.type === "critical_flag"
      ),
    [annotations]
  );

  const navigateToIndex = (index: number) => {
    const annotation = sortedCriticalFlags[index];
    if (!annotation) {
      return;
    }

    setFocusedAnnotation(annotation.id);
    void rendition?.display?.(annotation.cfi);
  };

  useHotkeys(
    "ctrl+]",
    (event) => {
      event.preventDefault();
      if (sortedCriticalFlags.length === 0) {
        return;
      }

      const currentIndex = Math.max(
        sortedCriticalFlags.findIndex(
          (annotation) => annotation.id === focusedAnnotationId
        ),
        -1
      );
      const nextIndex = (currentIndex + 1 + sortedCriticalFlags.length) % sortedCriticalFlags.length;
      navigateToIndex(nextIndex);
    },
    [sortedCriticalFlags, focusedAnnotationId, rendition]
  );

  useHotkeys(
    "ctrl+[",
    (event) => {
      event.preventDefault();
      if (sortedCriticalFlags.length === 0) {
        return;
      }

      const currentIndex = Math.max(
        sortedCriticalFlags.findIndex(
          (annotation) => annotation.id === focusedAnnotationId
        ),
        0
      );
      const prevIndex =
        (currentIndex - 1 + sortedCriticalFlags.length) %
        sortedCriticalFlags.length;
      navigateToIndex(prevIndex);
    },
    [sortedCriticalFlags, focusedAnnotationId, rendition]
  );
}

