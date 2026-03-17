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
export declare const defaultFontProfileConfig: FontProfileConfig;
export declare const fontProfileConfigSchema: {
    readonly $id: "FontProfileConfig";
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly font: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly body: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly family: {
                            readonly type: "string";
                        };
                        readonly size: {
                            readonly type: "string";
                            readonly pattern: "^\\d+(\\.\\d+)?rem$";
                        };
                    };
                };
                readonly heading: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly family: {
                            readonly type: "string";
                        };
                        readonly scale: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly h1: {
                                    readonly type: "number";
                                };
                                readonly h2: {
                                    readonly type: "number";
                                };
                                readonly h3: {
                                    readonly type: "number";
                                };
                                readonly h4: {
                                    readonly type: "number";
                                };
                                readonly h5: {
                                    readonly type: "number";
                                };
                                readonly h6: {
                                    readonly type: "number";
                                };
                            };
                        };
                    };
                };
                readonly mono: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly family: {
                            readonly type: "string";
                        };
                    };
                };
                readonly lineHeight: {
                    readonly type: "number";
                };
                readonly tableHeader: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly weight: {
                            readonly type: "number";
                        };
                    };
                };
            };
        };
    };
};
export declare function applyFontProfileDefaults(config: PartialFontProfileConfig | undefined): FontProfileConfig;
