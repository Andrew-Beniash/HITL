import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FontProfile } from "@hitl/shared-types";
import {
  buildPlatformStylesheet,
  getPlatformStylesheetUrl,
} from "../lib/platform-stylesheet.js";

const fontProfile: FontProfile = {
  id: "profile-1",
  tenantId: "tenant-1",
  name: "Default",
  isActive: true,
  config: {
    font: {
      body: { family: "Inter", size: "1rem" },
      heading: {
        family: "IBM Plex Serif",
        scale: { h1: 2, h2: 1.5, h3: 1.25, h4: 1.125, h5: 1, h6: 0.875 },
      },
      mono: { family: "JetBrains Mono" },
      lineHeight: 1.6,
      tableHeader: { weight: 600 },
    },
  },
};

describe("platform stylesheet", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("builds the platform override stylesheet from the font profile", () => {
    const css = buildPlatformStylesheet(fontProfile);

    expect(css).toContain('--font-body: "Inter", system-ui, -apple-system, sans-serif;');
    expect(css).toContain(
      'body, p, li, td, th, span {\n  font-family: var(--font-body) !important;'
    );
    expect(css).toContain(
      "h1, h2, h3, h4, h5, h6 {\n  font-family: var(--font-heading) !important;"
    );
    expect(css).toContain(
      "pre, code, samp {\n  font-family: var(--font-mono) !important;"
    );
    expect(css).toContain("position: sticky;");
    expect(css).toContain("font-weight: var(--font-weight-table-header);");
  });

  it("creates and caches a blob URL per font profile", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      configurable: true,
      value: vi.fn(() => "blob:profile-1"),
    });
    const createObjectURL = URL.createObjectURL as ReturnType<typeof vi.fn>;

    const firstUrl = getPlatformStylesheetUrl(fontProfile);
    const secondUrl = getPlatformStylesheetUrl(fontProfile);

    expect(firstUrl).toBe("blob:profile-1");
    expect(secondUrl).toBe("blob:profile-1");
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    const cssBlob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(cssBlob).toBeInstanceOf(Blob);
    await expect(cssBlob.text()).resolves.toContain("font-family: var(--font-body) !important;");
  });

  it("wins computed styles over source document font declarations", () => {
    const sourceStyle = document.createElement("style");
    sourceStyle.textContent = 'span { font-family: "Source Serif"; }';
    document.head.appendChild(sourceStyle);

    const style = document.createElement("style");
    style.textContent = buildPlatformStylesheet(fontProfile);
    document.head.appendChild(style);

    const span = document.createElement("span");
    span.textContent = "Example";
    document.body.appendChild(span);

    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th>Header</th></tr></thead>";
    document.body.appendChild(table);

    expect(style.textContent).toContain("!important");
    expect(getComputedStyle(span).fontFamily).toBe("var(--font-body)");
    expect(
      getComputedStyle(document.documentElement).getPropertyValue("--font-body")
    ).toContain("Inter");
    expect(getComputedStyle(table.querySelector("th")!).position).toBe("sticky");
    expect(getComputedStyle(table.querySelector("th")!).fontWeight).toBe(
      "var(--font-weight-table-header)"
    );
    expect(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--font-weight-table-header"
      )
    ).toContain("600");
  });
});
