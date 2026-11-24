// The destinations the user chose, remembered per server and NLE timeline in Settings.targets, so
// the plugin comes back to them after a restart or when the timeline is opened again.

export interface RememberedTargets {
	upload?: { projectId: string; timelineId: string };
	/** exportId null: the timeline's newest export */
	marker?: { projectId: string; timelineId: string; exportId: string | null };
}

type TargetMap = Record<string, RememberedTargets>;

/** How many timelines are remembered; the oldest drop out */
const MAX_TIMELINES = 200;

export const targetsKey = (serverUrl: string, nleTimelineId: string) =>
	`${serverUrl} ${nleTimelineId}`;

export function parseTargets(json: string | undefined): TargetMap {
	if (!json) return {};
	try {
		const value: unknown = JSON.parse(json);
		return value && typeof value === "object" && !Array.isArray(value) ? (value as TargetMap) : {};
	} catch {
		return {};
	}
}

/** The map with key's entry replaced and moved to the end (newest) */
export function rememberTargets(json: string | undefined, key: string, targets: RememberedTargets) {
	const map = parseTargets(json);
	delete map[key];
	map[key] = targets;
	const keys = Object.keys(map);
	for (const old of keys.slice(0, Math.max(0, keys.length - MAX_TIMELINES))) delete map[old];
	return JSON.stringify(map);
}
