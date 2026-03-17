import type { Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import type { AuditEvent, FontProfile } from "@hitl/shared-types";
import { prisma } from "../prisma.js";
import { auditClient } from "../audit.js";
import {
  applyFontProfileDefaults,
  fontProfileConfigSchema,
  type PartialFontProfileConfig
} from "../validation/font-profile-schema.js";
import { loadCdnManifest, validateFontFamilies } from "../validation/cdn-manifest.js";

type FontProfileRecord = {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  config: unknown;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type CreateFontProfileBody = {
  name: string;
  config?: PartialFontProfileConfig;
};

type ActivationParams = {
  id: string;
};

function requireTenantContext(request: {
  tenantId?: string;
  userId?: string;
}) {
  if (!request.tenantId) {
    const error = new Error("tenant context missing");
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }

  return {
    tenantId: request.tenantId,
    userId: request.userId ?? "unknown"
  };
}

function extractFontFamilies(config: FontProfile["config"]): string[] {
  return [
    config.font.body.family,
    config.font.heading.family,
    config.font.mono.family
  ];
}

function serializeFontProfile(profile: FontProfileRecord): FontProfile {
  return {
    id: profile.id,
    tenantId: profile.tenantId,
    name: profile.name,
    isActive: profile.isActive,
    config: profile.config as FontProfile["config"]
  };
}

function buildAuditEvent(
  tenantId: string,
  userId: string,
  beforeState: AuditEvent["beforeState"],
  afterState: AuditEvent["afterState"]
): AuditEvent {
  return {
    id: crypto.randomUUID(),
    tenantId,
    actorType: "user",
    actorId: userId,
    eventType: "font.profile_changed",
    beforeState,
    afterState,
    occurredAt: new Date().toISOString()
  };
}

export const fontProfilesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/config/font-profile/active", async (request, reply) => {
    const { tenantId } = requireTenantContext(request);
    const profile = await prisma.fontProfile.findFirst({
      where: {
        tenantId,
        isActive: true
      }
    });

    if (!profile) {
      return reply.code(404).send({ error: "no_active_profile" });
    }

    return { fontProfile: serializeFontProfile(profile as FontProfileRecord) };
  });

  app.get("/config/font-profiles", async (request) => {
    const { tenantId } = requireTenantContext(request);
    const profiles = await prisma.fontProfile.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" }
    });

    return {
      profiles: profiles.map((profile) => serializeFontProfile(profile as FontProfileRecord))
    };
  });

  app.post<{ Body: CreateFontProfileBody }>(
    "/config/font-profiles",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1 },
            config: fontProfileConfigSchema
          }
        }
      }
    },
    async (request, reply) => {
      const { tenantId, userId } = requireTenantContext(request);

      const profileCount = await prisma.fontProfile.count({
        where: { tenantId }
      });

      if (profileCount >= 3) {
        return reply.code(409).send({ error: "profile_limit_reached" });
      }

      const config = applyFontProfileDefaults(request.body.config);
      const manifest = await loadCdnManifest();
      const unknownFamilies = validateFontFamilies(extractFontFamilies(config), manifest);

      if (unknownFamilies.length > 0) {
        return reply.code(422).send({
          error: "unknown_font_family",
          family: unknownFamilies[0]
        });
      }

      const fontProfile = await prisma.fontProfile.create({
        data: {
          tenantId,
          name: request.body.name,
          isActive: false,
          config: config as unknown as Prisma.InputJsonValue,
          createdBy: userId
        }
      });

      auditClient.emit(
        buildAuditEvent(tenantId, userId, undefined, {
          action: "created",
          profileName: fontProfile.name
        })
      );

      return reply.code(201).send({
        fontProfile: serializeFontProfile(fontProfile as FontProfileRecord)
      });
    }
  );

  app.put<{ Params: ActivationParams }>(
    "/config/font-profiles/:id/activate",
    async (request, reply) => {
      const { tenantId, userId } = requireTenantContext(request);

      const currentActive = await prisma.fontProfile.findFirst({
        where: {
          tenantId,
          isActive: true
        }
      });

      const fontProfile = await prisma.$transaction(async (tx) => {
        await tx.fontProfile.updateMany({
          where: { tenantId },
          data: { isActive: false }
        });

        const activationResult = await tx.fontProfile.updateMany({
          where: { id: request.params.id, tenantId },
          data: { isActive: true }
        });

        if (activationResult.count === 0) {
          return null;
        }

        return tx.fontProfile.findFirst({
          where: { id: request.params.id, tenantId }
        });
      });

      if (!fontProfile) {
        return reply.code(404).send({ error: "profile_not_found" });
      }

      auditClient.emit(
        buildAuditEvent(
          tenantId,
          userId,
          currentActive ? { profileName: currentActive.name } : undefined,
          { profileName: fontProfile.name }
        )
      );

      return {
        fontProfile: serializeFontProfile(fontProfile as FontProfileRecord)
      };
    }
  );
};
