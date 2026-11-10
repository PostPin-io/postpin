/**
 * Argument of getMarkers: the export id for members (as before), with the share token for
 * guests. A refresh must use the same shape as the read, so both sides build it here.
 */
export type MarkersKey = string | { exportId: string; shareToken: string };

export const markersKey = (exportId: string, shareToken?: string): MarkersKey =>
	shareToken ? { exportId, shareToken } : exportId;

export const scopeOf = (key: MarkersKey): { exportId: string; shareToken?: string } =>
	typeof key === "string" ? { exportId: key } : key;
