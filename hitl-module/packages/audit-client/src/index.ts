import type { AuditEvent } from "@hitl/shared-types";

// AuditEvent fields the client must supply (id and occurredAt are generated server-side).
// The optional id/occurredAt overload keeps existing callers compatible.
type EmitPayload = Omit<AuditEvent, "id" | "occurredAt"> & {
  id?: string;
  occurredAt?: string;
};

export class AuditClient {
  constructor(private readonly auditServiceUrl: string) {}

  async emit(event: EmitPayload): Promise<void> {
    try {
      await fetch(`${this.auditServiceUrl}/audit/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Service": "true",
        },
        body: JSON.stringify(event),
      });
    } catch (err) {
      // Fire-and-forget: log to console.error only, never throw
      console.error("[AuditClient] Failed to emit event:", err);
    }
  }
}

/**
 * Factory kept for backwards compatibility with existing service callers.
 * Reads AUDIT_SERVICE_URL from env; falls back to localhost:3006.
 */
export function createAuditClient(_service: string): AuditClient {
  const url = process.env.AUDIT_SERVICE_URL ?? "http://localhost:3006";
  return new AuditClient(url);
}
