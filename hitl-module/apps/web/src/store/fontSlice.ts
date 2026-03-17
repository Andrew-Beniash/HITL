import type { StateCreator } from "zustand";
import type { FontProfile } from "@hitl/shared-types";
import type { AllSlices } from "./types.js";

export interface FontSlice {
  fontProfile: FontProfile | null;
  fontsLoaded: boolean;
  fontLoadError: string | null;
  setFontProfile: (profile: FontProfile) => void;
  setFontsLoaded: (loaded: boolean) => void;
  setFontLoadError: (error: string | null) => void;
}

export const createFontSlice: StateCreator<
  AllSlices,
  [["zustand/immer", never]],
  [],
  FontSlice
> = (set) => ({
  fontProfile: null,
  fontsLoaded: false,
  fontLoadError: null,
  setFontProfile: (profile) =>
    set((state) => {
      state.fontProfile = profile;
    }),
  setFontsLoaded: (loaded) =>
    set((state) => {
      state.fontsLoaded = loaded;
    }),
  setFontLoadError: (error) =>
    set((state) => {
      state.fontLoadError = error;
    }),
});
