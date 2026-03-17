import type { FontProfile } from "@hitl/shared-types";

export async function preloadFonts(profile: FontProfile): Promise<void> {
  const { body, heading, mono } = profile.config.font;
  const families = [body.family, heading.family, mono.family];

  // Use allSettled so one font failure doesn't block the others
  await Promise.allSettled(
    families.map((family) => document.fonts.load(`1em "${family}"`))
  );

  // Wait for the browser's FontFaceSet to fully settle
  await document.fonts.ready;
}
