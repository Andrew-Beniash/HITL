import type { Annotation } from "@hitl/shared-types";

const PRIORITY: Record<string, number> = {
  critical_flag: 0,
  attention_marker: 1,
};

export function sortAnnotations(annotations: Annotation[]): Annotation[] {
  return [...annotations].sort((left, right) => {
    const leftPriority = PRIORITY[left.type] ?? 2;
    const rightPriority = PRIORITY[right.type] ?? 2;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.cfi.localeCompare(right.cfi);
  });
}

