import { describe, it, expect, vi, beforeEach } from "vitest";
import { preloadFonts } from "../lib/fonts.js";
import type { FontProfile } from "@hitl/shared-types";

const mockProfile: FontProfile = {
  id: "fp-1",
  tenantId: "t-1",
  name: "Default",
  isActive: true,
  config: {
    font: {
      body: { family: "Inter", size: "16px" },
      heading: {
        family: "Playfair Display",
        scale: { h1: 2.5, h2: 2, h3: 1.75, h4: 1.5, h5: 1.25, h6: 1 },
      },
      mono: { family: "JetBrains Mono" },
      lineHeight: 1.6,
      tableHeader: { weight: 600 },
    },
  },
};

describe("preloadFonts", () => {
  beforeEach(() => {
    Object.defineProperty(document, "fonts", {
      writable: true,
      configurable: true,
      value: {
        load: vi.fn().mockResolvedValue([]),
        ready: Promise.resolve(document.fonts),
      },
    });
  });

  it("calls document.fonts.load for each font family", async () => {
    await preloadFonts(mockProfile);

    expect(document.fonts.load).toHaveBeenCalledTimes(3);
    expect(document.fonts.load).toHaveBeenCalledWith('1em "Inter"');
    expect(document.fonts.load).toHaveBeenCalledWith('1em "Playfair Display"');
    expect(document.fonts.load).toHaveBeenCalledWith('1em "JetBrains Mono"');
  });

  it("does not throw when a font family fails to load", async () => {
    (document.fonts.load as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("font not found"))
      .mockResolvedValueOnce([]);

    // Promise.allSettled means partial failure is swallowed
    await expect(preloadFonts(mockProfile)).resolves.toBeUndefined();
  });
});
