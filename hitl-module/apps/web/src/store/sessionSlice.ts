import type { StateCreator } from "zustand";
import type { Permission, ReviewState } from "@hitl/shared-types";
import type { AllSlices } from "./types.js";

export interface User {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

export interface SessionSlice {
  sessionId: string | null;
  documentId: string | null;
  tenantId: string | null;
  currentUser: User | null;
  permissions: Permission[];
  reviewState: ReviewState | null;
  setSession: (session: {
    sessionId: string;
    documentId: string;
    tenantId: string;
    currentUser: User;
  }) => void;
  setReviewState: (state: ReviewState) => void;
  setPermissions: (perms: Permission[]) => void;
}

export const createSessionSlice: StateCreator<
  AllSlices,
  [["zustand/immer", never]],
  [],
  SessionSlice
> = (set) => ({
  sessionId: null,
  documentId: null,
  tenantId: null,
  currentUser: null,
  permissions: [],
  reviewState: null,
  setSession: (session) =>
    set((state) => {
      state.sessionId = session.sessionId;
      state.documentId = session.documentId;
      state.tenantId = session.tenantId;
      state.currentUser = session.currentUser;
    }),
  setReviewState: (reviewState) =>
    set((state) => {
      state.reviewState = reviewState;
    }),
  setPermissions: (permissions) =>
    set((state) => {
      state.permissions = permissions;
    }),
});
