import type { StateCreator } from "zustand";
import type { Annotation, AnnotationType } from "@hitl/shared-types";
import type { AllSlices } from "./types.js";

export interface AnnotationFilter {
  type?: AnnotationType;
  status?: "open" | "resolved" | "rejected";
  authorId?: string;
}

export interface AnnotationSlice {
  annotations: Annotation[];
  filter: AnnotationFilter;
  getSortedCriticalFlags: () => Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  upsertAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
  setFilter: (filter: AnnotationFilter) => void;
}

export const createAnnotationSlice: StateCreator<
  AllSlices,
  [["zustand/immer", never]],
  [],
  AnnotationSlice
> = (set, get) => ({
  annotations: [],
  filter: {},
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
    }),
  upsertAnnotation: (annotation) =>
    set((state) => {
      const idx = state.annotations.findIndex((a) => a.id === annotation.id);
      if (idx >= 0) {
        state.annotations[idx] = annotation;
      } else {
        state.annotations.push(annotation);
      }
    }),
  removeAnnotation: (id) =>
    set((state) => {
      state.annotations = state.annotations.filter((a) => a.id !== id);
    }),
  setFilter: (filter) =>
    set((state) => {
      state.filter = filter;
    }),
});
