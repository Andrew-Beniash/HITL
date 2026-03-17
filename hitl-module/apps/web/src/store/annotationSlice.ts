import type { StateCreator } from "zustand";
import type { Annotation, AnnotationType } from "@hitl/shared-types";
import type { AllSlices } from "./types.js";

export interface AnnotationFilter {
  type: AnnotationType | "all";
  initiator: "human" | "ai" | "all";
  status: "open" | "resolved" | "all";
  fromDate?: Date;
  toDate?: Date;
}

export interface AnnotationSlice {
  annotations: Annotation[];
  focusedAnnotationId: string | null;
  filterState: AnnotationFilter;
  resolvedCount: number;
  totalCriticalCount: number;
  getSortedCriticalFlags: () => Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  upsertAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
  setFocusedAnnotation: (id: string | null) => void;
  setFilter: (filter: Partial<AnnotationFilter>) => void;
}

const DEFAULT_FILTER: AnnotationFilter = {
  type: "all",
  initiator: "all",
  status: "all",
};

function countResolvedCriticalFlags(annotations: Annotation[]) {
  return annotations.filter(
    (annotation) =>
      annotation.type === "critical_flag" && annotation.status === "resolved"
  ).length;
}

function countTotalCriticalFlags(annotations: Annotation[]) {
  return annotations.filter((annotation) => annotation.type === "critical_flag")
    .length;
}

export const createAnnotationSlice: StateCreator<
  AllSlices,
  [["zustand/immer", never]],
  [],
  AnnotationSlice
> = (set, get) => ({
  annotations: [],
  focusedAnnotationId: null,
  filterState: DEFAULT_FILTER,
  resolvedCount: 0,
  totalCriticalCount: 0,
  getSortedCriticalFlags: () =>
    get()
      .annotations.filter(
        (a) => a.type === "critical_flag" && a.status === "open"
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
  setAnnotations: (annotations) =>
    set((state) => {
      state.annotations = annotations;
      state.resolvedCount = countResolvedCriticalFlags(annotations);
      state.totalCriticalCount = countTotalCriticalFlags(annotations);
    }),
  upsertAnnotation: (annotation) =>
    set((state) => {
      const idx = state.annotations.findIndex((a) => a.id === annotation.id);
      if (idx >= 0) {
        state.annotations[idx] = annotation;
      } else {
        state.annotations.push(annotation);
      }
      state.resolvedCount = countResolvedCriticalFlags(state.annotations);
      state.totalCriticalCount = countTotalCriticalFlags(state.annotations);
    }),
  removeAnnotation: (id) =>
    set((state) => {
      state.annotations = state.annotations.filter((a) => a.id !== id);
      if (state.focusedAnnotationId === id) {
        state.focusedAnnotationId = null;
      }
      state.resolvedCount = countResolvedCriticalFlags(state.annotations);
      state.totalCriticalCount = countTotalCriticalFlags(state.annotations);
    }),
  setFocusedAnnotation: (id) =>
    set((state) => {
      state.focusedAnnotationId = id;
    }),
  setFilter: (filter) =>
    set((state) => {
      state.filterState = { ...state.filterState, ...filter };
    }),
});
