// PostPin's data in an NLE marker's custom data is a JSON object marked with "__postpin": <version>.
// Custom data without it belongs to another tool and is never written.
//
// Version 1: { __postpin: 1, id?: PostPin marker id, nleId?: NLE marker id, frame?: last seen frame }
// (nleId and frame are only written by adapters that keep the marker id in the custom data, like Resolve)
export const POSTPIN_DATA_VERSION = 1;

export interface PostPinMarkerData {
	__postpin: number;
	// PostPin marker id, for markers pulled from PostPin
	id?: string;
	[key: string]: unknown;
}

// The custom data as an object when it's PostPin's, otherwise null.
// Markers pulled before versioning carry "__postpin": true, which counts as version 1.
export function parsePostPinData(customData: string | null): PostPinMarkerData | null {
	if (!customData) return null;
	try {
		const data: unknown = JSON.parse(customData);
		if (!data || typeof data !== "object" || Array.isArray(data) || !("__postpin" in data)) {
			return null;
		}
		const version = data.__postpin === true ? 1 : data.__postpin;
		return typeof version === "number" ? { ...data, __postpin: version } : null;
	} catch {
		return null;
	}
}

// Serializes PostPin's data with the current version as the first key
export function stringifyPostPinData(data: Omit<PostPinMarkerData, "__postpin">) {
	const { __postpin: _, ...rest } = data;
	return JSON.stringify({ __postpin: POSTPIN_DATA_VERSION, ...rest });
}
