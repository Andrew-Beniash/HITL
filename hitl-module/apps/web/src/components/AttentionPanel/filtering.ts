import type { Annotation, AnnotationType } from "@hitl/shared-types";

export interface AttentionAnnotationFilter {
  type: AnnotationType | "all";
  initiator: "human" | "ai" | "all";
  status: "open" | "resolved" | "all";
  fromDate?: Date;
  toDate?: Date;
}

export function matchesFilter(
  annotation: Annotation,
  filter: AttentionAnnotationFilter
): boolean {
  if (filter.type !== "all" && annotation.type !== filter.type) {
    return false;
  }

  const initiator =
    annotation.authorId !== null ? "human" : annotation.agentId !== null ? "ai" : "all";
  if (filter.initiator !== "all" && initiator !== filter.initiator) {
    return false;
  }

  if (filter.status !== "all" && annotation.status !== filter.status) {
    return false;
  }

  const createdAt = new Date(annotation.createdAt);
  if (filter.fromDate && createdAt < filter.fromDate) {
    return false;
  }

  if (filter.toDate && createdAt > filter.toDate) {
    return false;
  }

  return true;
}

