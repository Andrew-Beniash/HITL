import { useCallback, useMemo } from "react";

export function useEpubLocation(documentId: string) {
  const storageKey = useMemo(
    () => `hitl:location:${documentId}`,
    [documentId]
  );

  const savedCfi =
    typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem(storageKey);

  const saveLocation = useCallback(
    (cfi: string) => {
      window.sessionStorage.setItem(storageKey, cfi);
    },
    [storageKey]
  );

  return { savedCfi, saveLocation };
}

