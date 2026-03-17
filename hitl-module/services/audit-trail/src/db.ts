import { PrismaClient } from "@prisma/client";

// Connects as audit_writer — INSERT and SELECT only on audit_events.
export const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL_AUDIT },
  },
});
