import type { AuditEvent } from "@hitl/shared-types";

export function createAuditClient(service: string) {
  return {
    emit(event: AuditEvent) {
      return { accepted: true, service, event };
    }
  };
}
