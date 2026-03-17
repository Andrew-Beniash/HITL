import type { StateCreator } from "zustand";
import type {
  SourceFormat,
  ConversionManifest,
  DocumentVersion,
} from "@hitl/shared-types";
import type { AllSlices } from "./types.js";

export interface DocumentSlice {
  epubUrl: string | null;
  sourceFormat: SourceFormat | null;
  currentLocation: string | null;
  currentChapter: string | null;
  conversionManifest: ConversionManifest | null;
  versionHistory: DocumentVersion[];
  setDocument: (doc: {
    epubUrl: string;
    sourceFormat: SourceFormat;
    conversionManifest: ConversionManifest | null;
  }) => void;
  setCurrentLocation: (cfi: string) => void;
  setCurrentChapter: (chapter: string) => void;
  setVersionHistory: (versions: DocumentVersion[]) => void;
}

export const createDocumentSlice: StateCreator<
  AllSlices,
  [["zustand/immer", never]],
  [],
  DocumentSlice
> = (set) => ({
  epubUrl: null,
  sourceFormat: null,
  currentLocation: null,
  currentChapter: null,
  conversionManifest: null,
  versionHistory: [],
  setDocument: (doc) =>
    set((state) => {
      state.epubUrl = doc.epubUrl;
      state.sourceFormat = doc.sourceFormat;
      state.conversionManifest = doc.conversionManifest;
    }),
  setCurrentLocation: (cfi) =>
    set((state) => {
      state.currentLocation = cfi;
    }),
  setCurrentChapter: (chapter) =>
    set((state) => {
      state.currentChapter = chapter;
    }),
  setVersionHistory: (versions) =>
    set((state) => {
      state.versionHistory = versions;
    }),
});
