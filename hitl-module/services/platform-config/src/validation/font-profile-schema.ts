import type { FontProfile } from "@hitl/shared-types";

export type FontProfileConfig = FontProfile["config"];
export type PartialFontProfileConfig = {
  font?: {
    body?: Partial<FontProfileConfig["font"]["body"]>;
    heading?: {
      family?: string;
      scale?: Partial<FontProfileConfig["font"]["heading"]["scale"]>;
    };
    mono?: Partial<FontProfileConfig["font"]["mono"]>;
    lineHeight?: number;
    tableHeader?: Partial<FontProfileConfig["font"]["tableHeader"]>;
  };
};

export const defaultFontProfileConfig: FontProfileConfig = {
  font: {
    body: {
      family: "Inter",
      size: "1.0rem"
    },
    heading: {
      family: "Inter",
      scale: {
        h1: 2.0,
        h2: 1.5,
        h3: 1.25,
        h4: 1.125,
        h5: 1.0,
        h6: 0.875
      }
    },
    mono: {
      family: "JetBrains Mono"
    },
    lineHeight: 1.6,
    tableHeader: {
      weight: 600
    }
  }
};

export const fontProfileConfigSchema = {
  $id: "FontProfileConfig",
  type: "object",
  additionalProperties: false,
  properties: {
    font: {
      type: "object",
      additionalProperties: false,
      properties: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            family: { type: "string" },
            size: { type: "string", pattern: "^\\d+(\\.\\d+)?rem$" }
          }
        },
        heading: {
          type: "object",
          additionalProperties: false,
          properties: {
            family: { type: "string" },
            scale: {
              type: "object",
              additionalProperties: false,
              properties: {
                h1: { type: "number" },
                h2: { type: "number" },
                h3: { type: "number" },
                h4: { type: "number" },
                h5: { type: "number" },
                h6: { type: "number" }
              }
            }
          }
        },
        mono: {
          type: "object",
          additionalProperties: false,
          properties: {
            family: { type: "string" }
          }
        },
        lineHeight: { type: "number" },
        tableHeader: {
          type: "object",
          additionalProperties: false,
          properties: {
            weight: { type: "number" }
          }
        }
      }
    }
  }
} as const;

export function applyFontProfileDefaults(
  config: PartialFontProfileConfig | undefined
): FontProfileConfig {
  return {
    font: {
      body: {
        family: config?.font?.body?.family ?? defaultFontProfileConfig.font.body.family,
        size: config?.font?.body?.size ?? defaultFontProfileConfig.font.body.size
      },
      heading: {
        family:
          config?.font?.heading?.family ?? defaultFontProfileConfig.font.heading.family,
        scale: {
          h1: config?.font?.heading?.scale?.h1 ?? defaultFontProfileConfig.font.heading.scale.h1,
          h2: config?.font?.heading?.scale?.h2 ?? defaultFontProfileConfig.font.heading.scale.h2,
          h3: config?.font?.heading?.scale?.h3 ?? defaultFontProfileConfig.font.heading.scale.h3,
          h4: config?.font?.heading?.scale?.h4 ?? defaultFontProfileConfig.font.heading.scale.h4,
          h5: config?.font?.heading?.scale?.h5 ?? defaultFontProfileConfig.font.heading.scale.h5,
          h6: config?.font?.heading?.scale?.h6 ?? defaultFontProfileConfig.font.heading.scale.h6
        }
      },
      mono: {
        family: config?.font?.mono?.family ?? defaultFontProfileConfig.font.mono.family
      },
      lineHeight:
        config?.font?.lineHeight ?? defaultFontProfileConfig.font.lineHeight,
      tableHeader: {
        weight:
          config?.font?.tableHeader?.weight ??
          defaultFontProfileConfig.font.tableHeader.weight
      }
    }
  };
}
