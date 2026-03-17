import type { FontProfile } from "@hitl/shared-types";

const stylesheetUrlCache = new Map<string, string>();

function escapeFontFamily(family: string): string {
  return `"${family.replaceAll('"', '\\"')}"`;
}

export function buildPlatformStylesheet(profile: FontProfile): string {
  const { body, heading, mono, lineHeight, tableHeader } = profile.config.font;

  return `:root {
  --font-body: ${escapeFontFamily(body.family)}, system-ui, -apple-system, sans-serif;
  --font-heading: ${escapeFontFamily(heading.family)}, system-ui, -apple-system, sans-serif;
  --font-mono: ${escapeFontFamily(mono.family)}, monospace;
  --font-size-base: ${body.size};
  --line-height-body: ${lineHeight};
  --font-weight-table-header: ${tableHeader.weight};
  --font-scale-h1: ${heading.scale.h1};
  --font-scale-h2: ${heading.scale.h2};
  --font-scale-h3: ${heading.scale.h3};
  --font-scale-h4: ${heading.scale.h4};
  --font-scale-h5: ${heading.scale.h5};
  --font-scale-h6: ${heading.scale.h6};
}

body, p, li, td, th, span {
  font-family: var(--font-body) !important;
  font-size: var(--font-size-base) !important;
  line-height: var(--line-height-body) !important;
}
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading) !important;
  line-height: var(--line-height-body) !important;
}
h1 { font-size: calc(var(--font-size-base) * var(--font-scale-h1)) !important; }
h2 { font-size: calc(var(--font-size-base) * var(--font-scale-h2)) !important; }
h3 { font-size: calc(var(--font-size-base) * var(--font-scale-h3)) !important; }
h4 { font-size: calc(var(--font-size-base) * var(--font-scale-h4)) !important; }
h5 { font-size: calc(var(--font-size-base) * var(--font-scale-h5)) !important; }
h6 { font-size: calc(var(--font-size-base) * var(--font-scale-h6)) !important; }
pre, code, samp {
  font-family: var(--font-mono) !important;
}

thead th {
  font-weight: var(--font-weight-table-header);
  position: sticky;
  top: 0;
}`;
}

export function getPlatformStylesheetUrl(profile: FontProfile): string {
  const cachedUrl = stylesheetUrlCache.get(profile.id);
  if (cachedUrl) {
    return cachedUrl;
  }

  const css = buildPlatformStylesheet(profile);
  const url = URL.createObjectURL(new Blob([css], { type: "text/css" }));
  stylesheetUrlCache.set(profile.id, url);
  return url;
}

