import type { getMarkers } from "./markers.remote";
export type ReviewMarker = Awaited<ReturnType<typeof getMarkers>>[number];
