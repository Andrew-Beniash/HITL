import { beforeEach, describe, expect, it, vi } from "vitest";
const prismaMock = {
    fontProfile: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
    },
    $transaction: vi.fn()
};
const auditEmitMock = vi.fn();
const loadCdnManifestMock = vi.fn();
const validateFontFamiliesMock = vi.fn();
vi.mock("../prisma.js", () => ({
    prisma: prismaMock
}));
vi.mock("../audit.js", () => ({
    auditClient: {
        emit: auditEmitMock
    }
}));
vi.mock("../validation/cdn-manifest.js", () => ({
    loadCdnManifest: loadCdnManifestMock,
    validateFontFamilies: validateFontFamiliesMock
}));
describe("font profile routes", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });
    it("returns 404 when no active profile exists", async () => {
        prismaMock.fontProfile.findFirst.mockResolvedValue(null);
        const { buildServer } = await import("../app.js");
        const app = buildServer();
        const response = await app.inject({
            method: "GET",
            url: "/config/font-profile/active",
            headers: {
                "x-tenant-id": "tenant-1"
            }
        });
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ error: "no_active_profile" });
        await app.close();
    });
    it("returns 422 for an unknown font family", async () => {
        prismaMock.fontProfile.count.mockResolvedValue(0);
        loadCdnManifestMock.mockResolvedValue(new Set(["Inter"]));
        validateFontFamiliesMock.mockReturnValue(["Unknown Sans"]);
        const { buildServer } = await import("../app.js");
        const app = buildServer();
        const response = await app.inject({
            method: "POST",
            url: "/config/font-profiles",
            headers: {
                "x-tenant-id": "tenant-1",
                "x-user-id": "user-1"
            },
            payload: {
                name: "Accessibility",
                config: {
                    font: {
                        body: {
                            family: "Unknown Sans"
                        }
                    }
                }
            }
        });
        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({
            error: "unknown_font_family",
            family: "Unknown Sans"
        });
        expect(prismaMock.fontProfile.create).not.toHaveBeenCalled();
        await app.close();
    });
    it("returns 409 when the profile limit is reached", async () => {
        prismaMock.fontProfile.count.mockResolvedValue(3);
        const { buildServer } = await import("../app.js");
        const app = buildServer();
        const response = await app.inject({
            method: "POST",
            url: "/config/font-profiles",
            headers: {
                "x-tenant-id": "tenant-1",
                "x-user-id": "user-1"
            },
            payload: {
                name: "Print"
            }
        });
        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({ error: "profile_limit_reached" });
        await app.close();
    });
    it("runs deactivate-all and activate-target in a single transaction", async () => {
        prismaMock.fontProfile.findFirst.mockResolvedValue({
            id: "profile-old",
            tenantId: "tenant-1",
            name: "Default",
            isActive: true,
            config: {},
            createdBy: "user-1",
            createdAt: new Date(),
            updatedAt: new Date()
        });
        prismaMock.fontProfile.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.$transaction.mockImplementation(async (callback) => callback({
            fontProfile: {
                updateMany: prismaMock.fontProfile.updateMany,
                findFirst: prismaMock.fontProfile.findFirst
            }
        }));
        prismaMock.fontProfile.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });
        prismaMock.fontProfile.findFirst.mockResolvedValueOnce({
            id: "profile-new",
            tenantId: "tenant-1",
            name: "Accessibility",
            isActive: true,
            config: {},
            createdBy: "user-1",
            createdAt: new Date(),
            updatedAt: new Date()
        });
        const { buildServer } = await import("../app.js");
        const app = buildServer();
        const response = await app.inject({
            method: "PUT",
            url: "/config/font-profiles/profile-new/activate",
            headers: {
                "x-tenant-id": "tenant-1",
                "x-user-id": "user-1"
            }
        });
        expect(response.statusCode).toBe(200);
        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        expect(prismaMock.fontProfile.updateMany).toHaveBeenCalledWith({
            where: { tenantId: "tenant-1" },
            data: { isActive: false }
        });
        expect(prismaMock.fontProfile.updateMany).toHaveBeenNthCalledWith(2, {
            where: { id: "profile-new", tenantId: "tenant-1" },
            data: { isActive: true }
        });
        await app.close();
    });
    it("emits an audit event when a profile is created", async () => {
        prismaMock.fontProfile.count.mockResolvedValue(0);
        loadCdnManifestMock.mockResolvedValue(new Set(["Inter", "JetBrains Mono"]));
        validateFontFamiliesMock.mockReturnValue([]);
        prismaMock.fontProfile.create.mockResolvedValue({
            id: "profile-1",
            tenantId: "tenant-1",
            name: "Default",
            isActive: false,
            config: {
                font: {
                    body: { family: "Inter", size: "1.0rem" },
                    heading: {
                        family: "Inter",
                        scale: { h1: 2, h2: 1.5, h3: 1.25, h4: 1.125, h5: 1, h6: 0.875 }
                    },
                    mono: { family: "JetBrains Mono" },
                    lineHeight: 1.6,
                    tableHeader: { weight: 600 }
                }
            },
            createdBy: "user-1",
            createdAt: new Date(),
            updatedAt: new Date()
        });
        const { buildServer } = await import("../app.js");
        const app = buildServer();
        const response = await app.inject({
            method: "POST",
            url: "/config/font-profiles",
            headers: {
                "x-tenant-id": "tenant-1",
                "x-user-id": "user-1"
            },
            payload: {
                name: "Default"
            }
        });
        expect(response.statusCode).toBe(201);
        expect(auditEmitMock).toHaveBeenCalledTimes(1);
        expect(auditEmitMock.mock.calls[0][0]).toMatchObject({
            eventType: "font.profile_changed",
            actorType: "user",
            actorId: "user-1",
            tenantId: "tenant-1",
            afterState: {
                action: "created",
                profileName: "Default"
            }
        });
        await app.close();
    });
});
//# sourceMappingURL=font-profiles.test.js.map