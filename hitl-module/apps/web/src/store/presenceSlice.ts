import type { StateCreator } from "zustand";
import type { PresenceUser } from "@hitl/shared-types";
import type { AllSlices } from "./types.js";

export interface PresenceSlice {
  activeUsers: PresenceUser[];
  cursorPositions: Record<string, string>;
  setPresence: (users: PresenceUser[]) => void;
  setCursorPosition: (userId: string, cfi: string) => void;
  removeUser: (userId: string) => void;
}

export const createPresenceSlice: StateCreator<
  AllSlices,
  [["zustand/immer", never]],
  [],
  PresenceSlice
> = (set) => ({
  activeUsers: [],
  cursorPositions: {},
  setPresence: (users) =>
    set((state) => {
      state.activeUsers = users;
    }),
  setCursorPosition: (userId, cfi) =>
    set((state) => {
      state.cursorPositions[userId] = cfi;
    }),
  removeUser: (userId) =>
    set((state) => {
      state.activeUsers = state.activeUsers.filter(
        (u) => u.userId !== userId
      );
      delete state.cursorPositions[userId];
    }),
});
