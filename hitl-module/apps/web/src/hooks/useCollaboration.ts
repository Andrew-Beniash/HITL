import { useEffect, useRef } from "react";
import { SOCKET_EVENTS } from "@hitl/shared-types";
import type { Annotation, PresenceUser } from "@hitl/shared-types";
import { useStore } from "../store/index.js";
import { initSocket, disconnectSocket, getSocket } from "../lib/socket.js";
import { showToast, dismissToast } from "../lib/toast.js";

interface UseCollaborationParams {
  sessionId: string | null;
  documentId: string | null;
  rendition: any | null;
}

export function useCollaboration({
  sessionId,
  documentId,
  rendition,
}: UseCollaborationParams): void {
  const currentUser = useStore((s) => s.currentUser);
  const authToken = useStore((s) => s.authToken);
  const setPresence = useStore((s) => s.setPresence);
  const setCursorPosition = useStore((s) => s.setCursorPosition);
  const upsertAnnotation = useStore((s) => s.upsertAnnotation);

  // Keep a stable ref to the latest rendition so socket handlers don't go stale
  const renditionRef = useRef(rendition);
  useEffect(() => {
    renditionRef.current = rendition;
  }, [rendition]);

  // Cursor throttle ref — last emit timestamp
  const lastCursorEmitRef = useRef<number>(0);

  // ── Socket connection ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !authToken || !sessionId || !documentId) return;

    const socket = initSocket(authToken);

    socket.emit(SOCKET_EVENTS.PRESENCE_JOIN, {
      sessionId,
      userId: currentUser.id,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl ?? "",
    });

    socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, (users: PresenceUser[]) => {
      setPresence(users);
    });

    socket.on(
      SOCKET_EVENTS.CURSOR_POSITIONS,
      (positions: Record<string, string>) => {
        for (const [userId, cfi] of Object.entries(positions)) {
          setCursorPosition(userId, cfi);
        }
      }
    );

    socket.on(SOCKET_EVENTS.ANNOTATION_SYNC, (annotation: Annotation) => {
      upsertAnnotation(annotation);
    });

    socket.on(
      SOCKET_EVENTS.EPUB_UPDATED,
      async ({
        documentId: dId,
      }: {
        documentId: string;
        epubS3Key: string;
      }) => {
        if (dId !== documentId) return;

        const { signedUrl } = await fetch(
          `/api/documents/${documentId}/epub`
        ).then((r) => r.json());

        const currentCfi =
          renditionRef.current?.currentLocation?.()?.start?.cfi;

        await renditionRef.current?.book?.open(signedUrl);

        if (currentCfi) {
          renditionRef.current?.display(currentCfi);
        }
      }
    );

    socket.on("disconnect", () => {
      showToast("Connection lost. Attempting to reconnect…", "warning");
    });

    socket.on("connect", () => {
      dismissToast();
    });

    return () => {
      socket.off(SOCKET_EVENTS.PRESENCE_UPDATE);
      socket.off(SOCKET_EVENTS.CURSOR_POSITIONS);
      socket.off(SOCKET_EVENTS.ANNOTATION_SYNC);
      socket.off(SOCKET_EVENTS.EPUB_UPDATED);
      socket.off("disconnect");
      socket.off("connect");
      disconnectSocket();
    };
  }, [sessionId, documentId, currentUser, authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cursor throttle (100 ms) ──────────────────────────────────────────────
  useEffect(() => {
    if (!rendition || !sessionId || !currentUser) return;

    const handleRelocated = (location: { start: { cfi: string } }) => {
      const now = Date.now();
      if (now - lastCursorEmitRef.current < 100) return;
      lastCursorEmitRef.current = now;

      const socket = getSocket();
      if (!socket) return;

      socket.emit(SOCKET_EVENTS.CURSOR_UPDATE, {
        sessionId,
        userId: currentUser.id,
        cfi: location.start.cfi,
      });
    };

    rendition.on("relocated", handleRelocated);
    return () => rendition.off("relocated", handleRelocated);
  }, [rendition, sessionId, currentUser]);
}
