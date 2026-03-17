import type { AuditEvent } from "@hitl/shared-types";
export declare function createAuditClient(service: string): {
    emit(event: AuditEvent): {
        accepted: boolean;
        service: string;
        event: AuditEvent;
    };
};
