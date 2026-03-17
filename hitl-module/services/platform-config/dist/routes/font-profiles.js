import { prisma } from "../prisma.js";
import { auditClient } from "../audit.js";
import { applyFontProfileDefaults, fontProfileConfigSchema } from "../validation/font-profile-schema.js";
import { loadCdnManifest, validateFontFamilies } from "../validation/cdn-manifest.js";
function requireTenantContext(request) {
    if (!request.tenantId) {
        const error = new Error("tenant context missing");
        error.statusCode = 401;
        throw error;
    }
    return {
        tenantId: request.tenantId,
        userId: request.userId ?? "unknown"
    };
}
function extractFontFamilies(config) {
    return [
        config.font.body.family,
        config.font.heading.family,
        config.font.mono.family
    ];
}
function serializeFontProfile(profile) {
    return {
        id: profile.id,
        tenantId: profile.tenantId,
        name: profile.name,
        isActive: profile.isActive,
        config: profile.config
    };
}
function buildAuditEvent(tenantId, userId, beforeState, afterState) {
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
export const fontProfilesRoutes = async (app) => {
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
        return { fontProfile: serializeFontProfile(profile) };
    });
    app.get("/config/font-profiles", async (request) => {
        const { tenantId } = requireTenantContext(request);
        const profiles = await prisma.fontProfile.findMany({
            where: { tenantId },
            orderBy: { createdAt: "asc" }
        });
        return {
            profiles: profiles.map((profile) => serializeFontProfile(profile))
        };
    });
    app.post("/config/font-profiles", {
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
    }, async (request, reply) => {
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
                config: config,
                createdBy: userId
            }
        });
        auditClient.emit(buildAuditEvent(tenantId, userId, undefined, {
            action: "created",
            profileName: fontProfile.name
        }));
        return reply.code(201).send({
            fontProfile: serializeFontProfile(fontProfile)
        });
    });
    app.put("/config/font-profiles/:id/activate", async (request, reply) => {
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
        auditClient.emit(buildAuditEvent(tenantId, userId, currentActive ? { profileName: currentActive.name } : undefined, { profileName: fontProfile.name }));
        return {
            fontProfile: serializeFontProfile(fontProfile)
        };
    });
};
//# sourceMappingURL=font-profiles.js.map