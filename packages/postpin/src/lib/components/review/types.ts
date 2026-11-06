import type { getMarkers } from "./MarkerPanel.remote";
export type ReviewMarker = Awaited<ReturnType<typeof getMarkers>>[number];
