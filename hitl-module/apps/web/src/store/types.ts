import type { SessionSlice } from "./sessionSlice.js";
import type { DocumentSlice } from "./documentSlice.js";
import type { AnnotationSlice } from "./annotationSlice.js";
import type { PresenceSlice } from "./presenceSlice.js";
import type { FontSlice } from "./fontSlice.js";

export type AllSlices = SessionSlice &
  DocumentSlice &
  AnnotationSlice &
  PresenceSlice &
  FontSlice;
