import {
	createMarkerSet,
	getMarkers,
	getMarkerSet,
	getMarkerSets,
	linkMarkers,
	restoreMarkerSet,
	type MarkerSetListItem,
} from "@postpin-io/api-client-ts";
import type { Client } from "@postpin-io/api-client-ts/client";
import {
	changedAny,
	type MarkerSetSideSummary,
	type NleMarkerSnapshotEntry,
	type PostPinMarkerSnapshotEntry,
} from "@postpin-io/shared/logic/marker-sets";

import type { NleBridge, NleMarker } from "./bridge";
import { parsePostPinData } from "./customData";
import { toSnapshot } from "./sync";

// The history of marker sets: backups taken before every push, pull, delete all and restore.
// Restoring a set undoes its action: it brings back the side(s) the action changed to how they
// were before it. A restore backs up the current state first, so it can be undone in turn.

export type MarkerSetEntry = MarkerSetListItem;

export interface HistoryContext {
	nle: NleBridge;
	client: Client;
	projectId: string;
	timelineId: string;
}

/** The sets of the NLE timeline that's open, newest first */
export async function loadHistory({ nle, client, projectId, timelineId }: HistoryContext) {
	const timeline = await nle.getTimelineInfo();
	if (!timeline) return [];
	const { data } = await getMarkerSets({
		client,
		path: { projectId, timelineId },
		query: { nleTimelineId: timeline.id },
		throwOnError: true,
	});
	return data;
}

/** The sides a restore of the set brings back: the ones its action changed */
export function restoredSides(set: Pick<MarkerSetEntry, "summary">) {
	return {
		nle: changedAny(set.summary.nle),
		postpin: changedAny(set.summary.postpin),
	};
}

export interface RestoreReport {
	message: string;
	warnings: string[];
}

export async function restoreFromHistory(
	{ nle, client, projectId, timelineId }: HistoryContext,
	markerSetId: string,
): Promise<RestoreReport> {
	const [{ data: set }, current, capabilities, timeline] = await Promise.all([
		getMarkerSet({ client, path: { projectId, timelineId, markerSetId }, throwOnError: true }),
		nle.getMarkers(),
		nle.getCapabilities(),
		nle.getTimelineInfo(),
	]);
	if (!timeline) throw new Error(`No timeline open in ${capabilities.hostName}`);
	const sides = restoredSides(set);
	if (sides.nle && set.nleTimelineId !== timeline.id) {
		throw new Error(
			`This backup belongs to the timeline "${set.nleTimelineName ?? set.nleTimelineId}". ` +
				`Open it in ${capabilities.hostName} to restore it.`,
		);
	}

	const nlePlan = sides.nle ? planNleRestore(set.nleMarkers.markers, current) : null;
	const nleSummary = nlePlan ? summarize(nlePlan) : undefined;
	const backup = {
		nleTimelineId: timeline.id,
		nleTimelineName: timeline.name,
		hostName: capabilities.hostName,
		nleMarkers: toSnapshot(current),
	};

	const parts: string[] = [];
	const warnings: string[] = [];
	if (sides.postpin) {
		const { data } = await restoreMarkerSet({
			client,
			path: { projectId, timelineId, markerSetId },
			body: { ...backup, ...(nleSummary && { nleSummary }) },
			throwOnError: true,
		});
		parts.push(describe("PostPin", data.summary.postpin));
	} else if (nlePlan) {
		await createMarkerSet({
			client,
			path: { projectId, timelineId },
			body: {
				action: "RESTORE",
				exportId: set.exportId,
				...backup,
				summary: { nle: nleSummary },
			},
			throwOnError: true,
		});
	}

	if (nlePlan) {
		const result = await applyNleRestore(nle, nlePlan);
		parts.push(describe(capabilities.hostName, nleSummary));
		if (result.errors.length) {
			warnings.push(
				`${result.errors.length} marker(s) couldn't be restored in ${capabilities.hostName}: ` +
					result.errors.slice(0, 5).join("; "),
			);
		}
		// The restored markers are linked to their PostPin markers again, whose links an action may have
		// changed or dropped (delete all unlinks, Pro Tools gives new numbers)
		if (set.exportId) {
			await relink(
				client,
				{ projectId, timelineId, exportId: set.exportId },
				timeline.id,
				result,
				set.postpinMarkers?.markers ?? [],
			);
		}
	}

	return { message: `Restored: ${parts.join(", ")}.`, warnings };
}

function describe(side: string, summary: MarkerSetSideSummary | undefined) {
	if (!summary) return `${side} unchanged`;
	const changes = [
		summary.added && `${summary.added} back`,
		summary.updated && `${summary.updated} reverted`,
		summary.removed && `${summary.removed} removed`,
	].filter(Boolean);
	return `${side} ${changes.length ? changes.join(", ") : "unchanged"}`;
}

interface NleRestorePlan {
	/** current markers that weren't there in the backup */
	remove: string[];
	/** markers of the backup to write: changed since, or gone */
	write: { marker: NleMarker; isNew: boolean }[];
}

const sameMarker = (a: NleMarker, b: NleMarkerSnapshotEntry) =>
	a.title === b.title &&
	a.description === b.description &&
	a.frame === b.frame &&
	(b.duration === undefined || a.duration === b.duration) &&
	a.color === b.color &&
	(a.customData ?? null) === (b.customData ?? null);

export function planNleRestore(
	backup: NleMarkerSnapshotEntry[],
	current: NleMarker[],
): NleRestorePlan {
	const currentById = new Map(current.flatMap((m) => (m.nleId ? [[m.nleId, m]] : [])));
	const wanted = new Set(backup.flatMap((m) => (m.nleId ? [m.nleId] : [])));
	const remove = current.flatMap((m) => (m.nleId && !wanted.has(m.nleId) ? [m.nleId] : []));
	const write: NleRestorePlan["write"] = [];
	for (const entry of backup) {
		const now = entry.nleId ? currentById.get(entry.nleId) : undefined;
		if (now && sameMarker(now, entry)) continue;
		// A marker that is gone comes back with its old id where the host keeps ids in custom data
		write.push({ marker: { ...entry }, isNew: !now });
	}
	return { remove, write };
}

function summarize(plan: NleRestorePlan): MarkerSetSideSummary {
	const added = plan.write.filter((w) => w.isNew).length;
	return { added, updated: plan.write.length - added, removed: plan.remove.length };
}

async function applyNleRestore(nle: NleBridge, plan: NleRestorePlan) {
	const errors: string[] = [];
	// Removing first frees the frames, Resolve takes one marker per frame
	if (plan.remove.length > 0) {
		try {
			await nle.removeMarkers(plan.remove);
		} catch (err) {
			errors.push(err instanceof Error ? err.message : String(err));
		}
	}
	const written: { from: string | null; to: string; postpinId: string | null }[] = [];
	if (plan.write.length > 0) {
		const results = await nle.setMarkers(plan.write.map((w) => w.marker));
		plan.write.forEach(({ marker }, i) => {
			const result = results[i];
			if (!result?.nleId) {
				errors.push(`"${marker.title || "Untitled"}": ${result?.error ?? "not written"}`);
			} else {
				written.push({ from: marker.nleId, to: result.nleId, postpinId: postpinIdOf(marker) });
			}
		});
	}
	return { errors, written, removed: plan.remove };
}

function postpinIdOf(marker: NleMarker) {
	const id = parsePostPinData(marker.customData)?.id;
	return typeof id === "string" ? id : null;
}

/**
 * Links the written markers to the PostPin markers they belonged to at the time of the backup (by
 * their old NLE id there, or the PostPin id in their custom data), and unlinks the PostPin markers
 * of NLE markers the restore removed, so a pull adds those again.
 */
async function relink(
	client: Client,
	path: { projectId: string; timelineId: string; exportId: string },
	nleTimelineId: string,
	{
		written,
		removed,
	}: {
		written: { from: string | null; to: string; postpinId: string | null }[];
		removed: string[];
	},
	backupMarkers: PostPinMarkerSnapshotEntry[],
) {
	const { data: markers } = await getMarkers({ client, path, throwOnError: true });
	const exists = new Map(markers.map((m) => [m.id, m]));
	const atBackup = new Map(backupMarkers.flatMap((m) => (m.nleId ? [[m.nleId, m.id]] : [])));
	const byNleId = new Map(markers.flatMap((m) => (m.nleId ? [[m.nleId, m.id]] : [])));

	const links = new Map<string, { id: string; nleId: string | null; syncHash: string | null }>();
	for (const nleId of removed) {
		const id = byNleId.get(nleId);
		if (id) links.set(id, { id, nleId: null, syncHash: null });
	}
	for (const { from, to, postpinId } of written) {
		const id =
			(from && (atBackup.get(from) ?? byNleId.get(from))) ||
			(postpinId && exists.has(postpinId) ? postpinId : null);
		const marker = id ? exists.get(id) : undefined;
		if (marker) links.set(marker.id, { id: marker.id, nleId: to, syncHash: marker.syncHash });
	}
	if (links.size === 0) return;
	await linkMarkers({
		client,
		path,
		body: { nleTimelineId, links: [...links.values()], forgetDeleted: [] },
		throwOnError: true,
	});
}
