import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { useShallow } from "zustand/react/shallow";
import type { AllSlices } from "./types.js";
import { createSessionSlice } from "./sessionSlice.js";
import { createDocumentSlice } from "./documentSlice.js";
import { createAnnotationSlice } from "./annotationSlice.js";
import { createPresenceSlice } from "./presenceSlice.js";
import { createFontSlice } from "./fontSlice.js";

export const useStore = create<AllSlices>()(
  immer((...a) => ({
    ...createSessionSlice(...a),
    ...createDocumentSlice(...a),
    ...createAnnotationSlice(...a),
    ...createPresenceSlice(...a),
    ...createFontSlice(...a),
  }))
);

export const useSession = () =>
  useStore(useShallow((s) => ({
    sessionId: s.sessionId,
    documentId: s.documentId,
    tenantId: s.tenantId,
    currentUser: s.currentUser,
    permissions: s.permissions,
    reviewState: s.reviewState,
    setSession: s.setSession,
    setReviewState: s.setReviewState,
    setPermissions: s.setPermissions,
  })));

export const useDocument = () =>
  useStore(useShallow((s) => ({
    epubUrl: s.epubUrl,
    sourceFormat: s.sourceFormat,
    currentLocation: s.currentLocation,
    currentChapter: s.currentChapter,
    conversionManifest: s.conversionManifest,
    versionHistory: s.versionHistory,
    setDocument: s.setDocument,
    setCurrentLocation: s.setCurrentLocation,
    setCurrentChapter: s.setCurrentChapter,
    setVersionHistory: s.setVersionHistory,
  })));

export const useAnnotations = () =>
  useStore(useShallow((s) => ({
    annotations: s.annotations,
    focusedAnnotationId: s.focusedAnnotationId,
    filterState: s.filterState,
    resolvedCount: s.resolvedCount,
    totalCriticalCount: s.totalCriticalCount,
    getSortedCriticalFlags: s.getSortedCriticalFlags,
    setAnnotations: s.setAnnotations,
    upsertAnnotation: s.upsertAnnotation,
    removeAnnotation: s.removeAnnotation,
    setFocusedAnnotation: s.setFocusedAnnotation,
    setFilter: s.setFilter,
  })));

export const usePresence = () =>
  useStore(useShallow((s) => ({
    activeUsers: s.activeUsers,
    cursorPositions: s.cursorPositions,
    setPresence: s.setPresence,
    setCursorPosition: s.setCursorPosition,
    removeUser: s.removeUser,
  })));

export const useFont = () =>
  useStore(useShallow((s) => ({
    fontProfile: s.fontProfile,
    fontsLoaded: s.fontsLoaded,
    fontLoadError: s.fontLoadError,
    setFontProfile: s.setFontProfile,
    setFontsLoaded: s.setFontsLoaded,
    setFontLoadError: s.setFontLoadError,
  })));
