import type { Annotation } from "@hitl/shared-types";
import type { AnnotationFilter } from "../../store/annotationSlice.js";

export function matchesFilter(
  ann: Annotation,
  filter: AnnotationFilter
): boolean {
  if (filter.type !== "all" && ann.type !== filter.type) return false;

  if (filter.initiator !== "all") {
    const isAi = ann.agentId !== null;
    if (filter.initiator === "ai" && !isAi) return false;
    if (filter.initiator === "human" && isAi) return false;
  }

  if (filter.status !== "all" && ann.status !== filter.status) return false;

  if (filter.fromDate && new Date(ann.createdAt) < filter.fromDate)
    return false;
  if (filter.toDate && new Date(ann.createdAt) > filter.toDate) return false;

  return true;
}
