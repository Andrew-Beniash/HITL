let cachedManifest = null;
let cacheExpiresAt = 0;
export async function loadCdnManifest() {
    const now = Date.now();
    if (cachedManifest && now < cacheExpiresAt) {
        return cachedManifest;
    }
    const url = process.env.CDN_MANIFEST_URL;
    if (!url) {
        cachedManifest = new Set();
        cacheExpiresAt = now + 5 * 60 * 1000;
        return cachedManifest;
    }
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load CDN manifest: ${response.status}`);
    }
    const payload = (await response.json());
    if (!Array.isArray(payload) || payload.some((item) => typeof item !== "string")) {
        throw new Error("CDN manifest must be a JSON array of font family names");
    }
    cachedManifest = new Set(payload);
    cacheExpiresAt = now + 5 * 60 * 1000;
    return cachedManifest;
}
export function validateFontFamilies(families, manifest) {
    return families.filter((family) => !manifest.has(family));
}
//# sourceMappingURL=cdn-manifest.js.map