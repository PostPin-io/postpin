import {
	createCategory,
	createMarkerSet,
	getCategories,
	getDeletedMarkers,
	getMarkerOrigin,
	getMarkers,
	linkMarkers,
	syncMarkers,
	type Category,
	type DeletedMarker,
	type MarkerWithResponses,
	type SyncMarker,
} from "@postpin-io/api-client-ts";
import type { Client } from "@postpin-io/api-client-ts/client";
import type { NleMarkerSnapshotEntry } from "@postpin-io/shared/logic/marker-sets";
import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";

import type { Capabilities, ColorPalette, NleBridge, NleMarker, TimelineInfo } from "./bridge";
import { parseCategoryTag, withCategoryTag } from "./categoryTag";
import { closestColor, colorToHex, DEFAULT_MARKER_HEX } from "./colors";
import { parsePostPinData, stringifyPostPinData } from "./customData";
import { syncHash, type SyncState } from "./syncHash";

// Syncing runs in four steps: plan (load both sides and compare them with the state of the last
// sync), backup (a marker set on the server), apply (write only what changed) and link (tell
// PostPin which NLE marker each PostPin marker now is).
//
// Every marker has a common base: the hash of the state both sides agreed on at the last sync
// (Marker.syncHash). Comparing each side with it tells who changed a marker since:
// - only the source side changed it: the change is synced
// - only the target side changed it: the target keeps its change
// - both changed it (a conflict): the side the action comes from wins
// Deletions follow the same rule, but deleting on the target side always needs the user's yes:
// plans list those candidates, and apply takes the answer.

export interface SyncContext {
	nle: NleBridge;
	client: Client;
	projectId: string;
	timelineId: string;
	exportId: string;
}

export type ServerMarker = MarkerWithResponses;

interface Loaded {
	capabilities: Capabilities;
	timeline: TimelineInfo;
	/** NLE frame minus PostPin frame, see frameOffset */
	frameOffset: number;
	/** the export's, for timecodes; null when unknown */
	frameRate: FrameRate | null;
	nleMarkers: NleMarker[];
	serverMarkers: ServerMarker[];
	deleted: DeletedMarker[];
	categories: Category[];
}

interface Pair {
	nle: NleMarker;
	server: ServerMarker;
}

export interface PushPlan extends Loaded {
	create: { nle: NleMarker; state: NleState }[];
	update: (Pair & { state: NleState; conflict: boolean })[];
	/** unchanged, or changed in PostPin only: only the link to the NLE marker is refreshed */
	link: (Pair & { syncHash: string | null })[];
	/** changed in PostPin since the last sync and not in the NLE: PostPin keeps its version */
	keptInPostPin: Pair[];
	/** deleted in PostPin, unchanged in the NLE since: not pushed back */
	deletedInPostPin: NleMarker[];
	/** synced with this NLE timeline before and gone from it: delete in PostPin too? */
	deletedInNle: ServerMarker[];
}

export interface PullPlan extends Loaded {
	add: { server: ServerMarker; marker: NleMarker }[];
	update: (Pair & { marker: NleMarker; conflict: boolean })[];
	/** unchanged, or changed in the NLE only: only the link is refreshed */
	link: (Pair & { syncHash: string | null })[];
	/** changed in the NLE since the last sync and not in PostPin: the NLE keeps its version */
	keptInNle: Pair[];
	/** deleted in the NLE, unchanged in PostPin since: not added again */
	deletedInNle: ServerMarker[];
	/** deleted in PostPin and still in the NLE: delete in the NLE too? */
	deletedInPostPin: { deleted: DeletedMarker; nle: NleMarker }[];
}

export interface SyncReport {
	message: string;
	/** things the user should know, e.g. markers that couldn't be written */
	warnings: string[];
	/** the backup taken before the action, null when there was nothing to do */
	markerSetId: string | null;
}

// ─── Loading and mapping ─────────────────────────────────────────────────────

async function load({
	nle,
	client,
	projectId,
	timelineId,
	exportId,
}: SyncContext): Promise<Loaded> {
	const path = { projectId, timelineId, exportId };
	const [nleMarkers, capabilities, timeline, server, deleted, categories, origin] =
		await Promise.all([
			nle.getMarkers(),
			nle.getCapabilities(),
			nle.getTimelineInfo(),
			getMarkers({ client, path, throwOnError: true }),
			getDeletedMarkers({ client, path, throwOnError: true }),
			getCategories({ client, path: { projectId }, throwOnError: true }),
			getMarkerOrigin({ client, path, throwOnError: true }),
		]);
	if (!timeline) throw new Error(`No timeline open in ${capabilities.hostName}`);
	return {
		capabilities,
		timeline,
		frameOffset: frameOffset(timeline, origin.data),
		frameRate: origin.data.frameRate,
		nleMarkers,
		serverMarkers: server.data,
		deleted: deleted.data,
		categories: categories.data,
	};
}

/**
 * How far the NLE's frames are from PostPin's. Exports rendered by a plugin share the NLE timeline's
 * frames (a Pro Tools export of a selection starts later on purpose, its markers still count from
 * the session start). An export uploaded in the browser starts where the uploader said, often
 * 00:00:00:00 while the timeline starts at 01:00:00:00: its frames are shifted by the difference.
 */
export function frameOffset(
	timeline: Pick<TimelineInfo, "startFrame">,
	origin: { startFrameIndex: number | null; webUpload: boolean },
) {
	if (!origin.webUpload || origin.startFrameIndex === null) return 0;
	if (timeline.startFrame === undefined) return 0;
	return timeline.startFrame - origin.startFrameIndex;
}

interface NleState extends SyncState {
	/** the category's name as the project spells it, or a new one's */
	categoryName: string;
	/** the NLE's color, for a new category */
	color: string;
}

function findCategory(categories: Category[], name: string) {
	const lower = name.toLowerCase();
	return categories.find((c) => c.name.toLowerCase() === lower);
}

/** An NLE marker in PostPin's terms: its "#Category" tag, else a category named after its color */
function nleState(m: NleMarker, loaded: Loaded, fallbackDuration = 0): NleState {
	const { hostName, palette } = loaded.capabilities;
	const parsed = parseCategoryTag(
		m.description,
		loaded.categories.map((c) => c.name),
	);
	const name = parsed.categoryName ?? colorCategoryName(hostName, m.color, palette);
	return {
		name: m.title,
		description: parsed.description,
		frame: m.frame - loaded.frameOffset,
		duration: m.duration ?? fallbackDuration,
		categoryName: findCategory(loaded.categories, name)?.name ?? name,
		color: m.color,
	};
}

function serverState(m: ServerMarker, loaded: Loaded): SyncState {
	return {
		name: m.name,
		description: m.description,
		frame: m.frame,
		duration: m.duration,
		categoryName: loaded.categories.find((c) => c.id === m.categoryId)?.name ?? "",
	};
}

/** A PostPin marker as the NLE gets it: category as "#Category" tag and the nearest color */
function toNleMarker(m: ServerMarker, nleId: string | null, loaded: Loaded): NleMarker {
	const { hostName, palette } = loaded.capabilities;
	const category = loaded.categories.find((c) => c.id === m.categoryId);
	const color = closestColor(category?.color ?? DEFAULT_MARKER_HEX, palette);
	// Categories named after the color (e.g. "Resolve Blue") need no tag, the color says it already
	const needsTag = category && category.name !== colorCategoryName(hostName, color, palette);
	return {
		nleId,
		title: m.name,
		description: needsTag ? withCategoryTag(category.name, m.description) : (m.description ?? ""),
		frame: m.frame + loaded.frameOffset,
		duration: m.duration,
		color,
		customData: stringifyPostPinData({ id: m.id }),
	};
}

// The PostPin id a marker pulled from PostPin keeps in its custom data
function postpinIdOf(marker: NleMarker) {
	const id = parsePostPinData(marker.customData)?.id;
	return typeof id === "string" ? id : null;
}

// The category a marker without "#Category" tag lands in: the host and color, e.g. "Resolve Blue"
function colorCategoryName(hostName: string, color: string, palette: ColorPalette) {
	const colorName =
		palette === "rgb" ? color : (palette.find((c) => c.id === color)?.name ?? color);
	return `${hostName} ${colorName}`;
}

/**
 * Pairs NLE markers with PostPin markers: by the PostPin id in the custom data (markers pulled
 * before), else by the NLE id PostPin knows. Each marker pairs once at most.
 */
function pairMarkers(nleMarkers: NleMarker[], serverMarkers: ServerMarker[]) {
	const byId = new Map(serverMarkers.map((m) => [m.id, m]));
	const byNleId = new Map(serverMarkers.flatMap((m) => (m.nleId ? [[m.nleId, m]] : [])));
	const used = new Set<ServerMarker>();
	const pairs: Pair[] = [];
	const nleOnly: NleMarker[] = [];

	const take = (server: ServerMarker | undefined) =>
		server && !used.has(server) ? (used.add(server), server) : undefined;
	// Ids first for all markers, so a stale NLE id can't take a marker another one owns by id
	const firstPass = nleMarkers.map((nle) => {
		const id = postpinIdOf(nle);
		return take(id ? byId.get(id) : undefined);
	});
	nleMarkers.forEach((nle, i) => {
		const server = firstPass[i] ?? take(nle.nleId ? byNleId.get(nle.nleId) : undefined);
		if (server) pairs.push({ nle, server });
		else nleOnly.push(nle);
	});
	const serverOnly = serverMarkers.filter((m) => !used.has(m));
	return { pairs, nleOnly, serverOnly };
}

function findDeleted(deleted: DeletedMarker[], nle: NleMarker) {
	const id = postpinIdOf(nle);
	return deleted.find((d) => (id && d.markerId === id) || (nle.nleId && d.nleId === nle.nleId));
}

/** The NLE's markers for a backup, without anything the API doesn't take */
export function toSnapshot(markers: NleMarker[]): NleMarkerSnapshotEntry[] {
	return markers.map(({ nleId, title, description, frame, duration, color, customData }) => ({
		nleId,
		title,
		description,
		frame,
		...(duration !== undefined && { duration }),
		color,
		customData,
	}));
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ─── Push: NLE → PostPin ─────────────────────────────────────────────────────

export async function planPush(context: SyncContext): Promise<PushPlan> {
	const loaded = await load(context);
	const { pairs, nleOnly, serverOnly } = pairMarkers(loaded.nleMarkers, loaded.serverMarkers);
	const plan: PushPlan = {
		...loaded,
		create: [],
		update: [],
		link: [],
		keptInPostPin: [],
		deletedInPostPin: [],
		deletedInNle: [],
	};

	for (const { nle, server } of pairs) {
		const state = nleState(nle, loaded, server.duration);
		const nleHash = syncHash(state);
		const serverHash = syncHash(serverState(server, loaded));
		const base = server.syncHash;
		const linked = server.nleId === nle.nleId && server.nleTimelineId === loaded.timeline.id;
		if (nleHash === serverHash) {
			if (!linked || base !== nleHash) plan.link.push({ nle, server, syncHash: nleHash });
		} else if (base && nleHash === base) {
			plan.keptInPostPin.push({ nle, server });
			if (!linked) plan.link.push({ nle, server, syncHash: base });
		} else {
			plan.update.push({ nle, server, state, conflict: !!base && serverHash !== base });
		}
	}

	for (const nle of nleOnly) {
		const state = nleState(nle, loaded);
		const deleted = findDeleted(loaded.deleted, nle);
		// Deleted in PostPin: stays deleted unless the NLE changed the marker since
		if (deleted && (deleted.syncHash === null || deleted.syncHash === syncHash(state))) {
			plan.deletedInPostPin.push(nle);
		} else {
			plan.create.push({ nle, state });
		}
	}

	// Only markers synced with this very NLE timeline can have been deleted in it
	plan.deletedInNle = serverOnly.filter((m) => m.nleId && m.nleTimelineId === loaded.timeline.id);
	return plan;
}

export const pushHasWork = (plan: PushPlan) =>
	plan.create.length + plan.update.length + plan.link.length + plan.deletedInNle.length > 0;

/**
 * Writes the plan into PostPin, after a backup of both sides. selected: the preview's rows the user
 * kept (DiffRow.key), see previewPush; new and changed markers not in it are skipped, markers gone
 * from the NLE in it are deleted in PostPin, markers deleted in PostPin in it come back.
 * previewed: the preview showed what's not done, so the report leaves that out.
 */
export async function applyPush(
	context: SyncContext,
	fullPlan: PushPlan,
	{ selected, previewed = false }: SyncChoices,
): Promise<SyncReport> {
	const pick = <T>(items: T[], prefix: RowPrefix) =>
		items.filter((_, i) => selected.has(rowKey(prefix, i)));
	const plan: PushPlan = {
		...fullPlan,
		create: [
			...pick(fullPlan.create, "new"),
			...pick(fullPlan.deletedInPostPin, "back").map((nle) => ({
				nle,
				state: nleState(nle, fullPlan),
			})),
		],
		update: pick(fullPlan.update, "changed"),
		deletedInPostPin: fullPlan.deletedInPostPin.filter((_, i) => !selected.has(rowKey("back", i))),
	};
	const deleteIds = pick(fullPlan.deletedInNle, "gone").map((m) => m.id);
	const { client, projectId, timelineId, exportId } = context;
	const hostName = plan.capabilities.hostName;

	const categoryIdOf = categoryResolver(client, projectId, plan);
	const upserts: SyncMarker[] = [];
	for (const { nle, state } of plan.create) {
		upserts.push(await nleUpsert(nle, state, null, await categoryIdOf(state)));
	}
	for (const { nle, server, state } of plan.update) {
		upserts.push(await nleUpsert(nle, state, server.id, await categoryIdOf(state)));
	}
	for (const { nle, server, syncHash } of plan.link) {
		upserts.push({
			id: server.id,
			nleId: nle.nleId,
			name: server.name,
			description: server.description,
			frame: server.frame,
			duration: server.duration,
			categoryId: server.categoryId,
			syncHash,
		});
	}

	if (upserts.length === 0 && deleteIds.length === 0) {
		return { ...pushReport(plan, 0, previewed), markerSetId: null };
	}
	const { data } = await syncMarkers({
		client,
		path: { projectId, timelineId, exportId },
		body: {
			nleTimelineId: plan.timeline.id,
			nleTimelineName: plan.timeline.name,
			hostName,
			nleMarkers: toSnapshot(plan.nleMarkers),
			upserts,
			deleteIds,
			summary: {
				postpin: {
					added: plan.create.length,
					updated: plan.update.length,
					removed: deleteIds.length,
				},
			},
		},
		throwOnError: true,
	});
	return { ...pushReport(plan, deleteIds.length, previewed), markerSetId: data.markerSetId };
}

async function nleUpsert(
	nle: NleMarker,
	state: NleState,
	id: string | null,
	categoryId: string,
): Promise<SyncMarker> {
	return {
		...(id && { id }),
		nleId: nle.nleId,
		name: state.name,
		description: state.description,
		frame: state.frame,
		// left out: PostPin keeps its own
		...(nle.duration !== undefined && { duration: nle.duration }),
		categoryId,
		syncHash: syncHash(state),
	};
}

// Finds the category by name (without case), creating missing ones once with the marker's color
function categoryResolver(client: Client, projectId: string, plan: Loaded) {
	const { palette } = plan.capabilities;
	return async (state: NleState) => {
		const existing = findCategory(plan.categories, state.categoryName);
		if (existing) return existing.id;
		const { data, error, response } = await createCategory({
			client,
			body: { name: state.categoryName, color: colorToHex(state.color, palette) },
			path: { projectId },
		});
		if (data) {
			plan.categories.push(data);
			return data.id;
		}
		// Someone else created it meanwhile
		if (response?.status === 409) {
			const { data: categories } = await getCategories({
				client,
				path: { projectId },
				throwOnError: true,
			});
			plan.categories.splice(0, plan.categories.length, ...categories);
			const created = findCategory(plan.categories, state.categoryName);
			if (created) return created.id;
		}
		throw error ?? new Error(`Couldn't create the category "${state.categoryName}"`);
	};
}

/** What the user picks in the preview, see applyPush and applyPull */
export interface SyncChoices {
	/** keys of the preview rows to apply (DiffRow.key) */
	selected: ReadonlySet<string>;
	previewed?: boolean;
}

// A preview row's key names the plan list and the index in it
type RowPrefix = "new" | "changed" | "gone" | "back";
const rowKey = (prefix: RowPrefix, index: number) => `${prefix}:${index}`;

// previewed: the preview showed what's kept or left out, the report only says what happened
function pushReport(
	plan: PushPlan,
	deleted: number,
	previewed: boolean,
): Omit<SyncReport, "markerSetId"> {
	const host = plan.capabilities.hostName;
	const changes = [
		plan.create.length && `${plan.create.length} new`,
		plan.update.length && `${plan.update.length} updated`,
		deleted && `${deleted} deleted`,
	].filter(Boolean);
	const warnings: string[] = [];
	const message = changes.length ? `Pushed to PostPin: ${changes.join(", ")}.` : "Nothing to push.";
	if (previewed) return { message, warnings };
	const conflicts = plan.update.filter((u) => u.conflict).length;
	if (conflicts) {
		warnings.push(
			`${count(conflicts, "marker")} changed in PostPin and in ${host}: ${host}'s version won. ` +
				"Undo it in the history if that was wrong.",
		);
	}
	if (plan.keptInPostPin.length) {
		warnings.push(
			`${count(plan.keptInPostPin.length, "marker")} changed in PostPin since the last sync ` +
				`kept PostPin's version. Sync from PostPin to get ${plan.keptInPostPin.length === 1 ? "it" : "them"}.`,
		);
	}
	if (plan.deletedInPostPin.length) {
		warnings.push(
			`${count(plan.deletedInPostPin.length, "marker")} deleted in PostPin ` +
				`${plan.deletedInPostPin.length === 1 ? "wasn't" : "weren't"} pushed back. ` +
				`Sync from PostPin to remove ${plan.deletedInPostPin.length === 1 ? "it" : "them"} from ${host}.`,
		);
	}
	const kept = plan.deletedInNle.length - deleted;
	if (kept > 0) {
		warnings.push(
			`${count(kept, "marker")} deleted in ${host} ${kept === 1 ? "stays" : "stay"} in PostPin.`,
		);
	}
	return { message, warnings };
}

// ─── Pull: PostPin → NLE ─────────────────────────────────────────────────────

export async function planPull(context: SyncContext): Promise<PullPlan> {
	const loaded = await load(context);
	const { pairs, nleOnly, serverOnly } = pairMarkers(loaded.nleMarkers, loaded.serverMarkers);
	const plan: PullPlan = {
		...loaded,
		add: [],
		update: [],
		link: [],
		keptInNle: [],
		deletedInNle: [],
		deletedInPostPin: [],
	};

	for (const { nle, server } of pairs) {
		const nleHash = syncHash(nleState(nle, loaded, server.duration));
		const serverHash = syncHash(serverState(server, loaded));
		const base = server.syncHash;
		const linked = server.nleId === nle.nleId && server.nleTimelineId === loaded.timeline.id;
		if (nleHash === serverHash) {
			if (!linked || base !== serverHash) plan.link.push({ nle, server, syncHash: serverHash });
		} else if (base && serverHash === base) {
			plan.keptInNle.push({ nle, server });
			if (!linked) plan.link.push({ nle, server, syncHash: base });
		} else {
			plan.update.push({
				nle,
				server,
				marker: toNleMarker(server, nle.nleId, loaded),
				conflict: !!base && nleHash !== base,
			});
		}
	}

	for (const server of serverOnly) {
		const syncedHere = server.nleId && server.nleTimelineId === loaded.timeline.id;
		const unchanged = server.syncHash && syncHash(serverState(server, loaded)) === server.syncHash;
		// Deleted in the NLE: stays deleted unless PostPin changed the marker since
		if (syncedHere && unchanged) plan.deletedInNle.push(server);
		else plan.add.push({ server, marker: toNleMarker(server, null, loaded) });
	}

	for (const nle of nleOnly) {
		const deleted = findDeleted(loaded.deleted, nle);
		if (deleted) plan.deletedInPostPin.push({ deleted, nle });
	}
	return plan;
}

export const pullHasWork = (plan: PullPlan) =>
	plan.add.length + plan.update.length + plan.link.length + plan.deletedInPostPin.length > 0;

/**
 * Writes the plan into the NLE, after a backup of both sides, and links the written markers.
 * selected: the preview's rows the user kept, see previewPull; new and changed markers not in it
 * are skipped, markers deleted in PostPin in it are deleted in the NLE, markers deleted in the NLE
 * in it come back. previewed: see applyPush.
 */
export async function applyPull(
	context: SyncContext,
	fullPlan: PullPlan,
	{ selected, previewed = false }: SyncChoices,
): Promise<SyncReport> {
	const pick = <T>(items: T[], prefix: RowPrefix) =>
		items.filter((_, i) => selected.has(rowKey(prefix, i)));
	const plan: PullPlan = {
		...fullPlan,
		add: [
			...pick(fullPlan.add, "new"),
			...pick(fullPlan.deletedInNle, "back").map((server) => ({
				server,
				marker: toNleMarker(server, null, fullPlan),
			})),
		],
		update: pick(fullPlan.update, "changed"),
		deletedInNle: fullPlan.deletedInNle.filter((_, i) => !selected.has(rowKey("back", i))),
	};
	const toRemove = pick(fullPlan.deletedInPostPin, "gone");
	const { nle, client, projectId, timelineId, exportId } = context;
	const writes = [...plan.add, ...plan.update];
	if (writes.length === 0 && toRemove.length === 0 && plan.link.length === 0) {
		return { ...pullReport(plan, { added: 0, updated: 0 }, [], 0, previewed), markerSetId: null };
	}

	let markerSetId: string | null = null;
	if (writes.length > 0 || toRemove.length > 0) {
		({
			data: { id: markerSetId },
		} = await createMarkerSet({
			client,
			path: { projectId, timelineId },
			body: {
				action: "PULL",
				exportId,
				nleTimelineId: plan.timeline.id,
				nleTimelineName: plan.timeline.name,
				hostName: plan.capabilities.hostName,
				nleMarkers: toSnapshot(plan.nleMarkers),
				summary: {
					nle: { added: plan.add.length, updated: plan.update.length, removed: toRemove.length },
				},
			},
			throwOnError: true,
		}));
	}

	const results = writes.length > 0 ? await nle.setMarkers(writes.map((w) => w.marker)) : [];
	const failures: Failure[] = [];
	// What really got written, the plan's counts are only what was tried
	const done = { added: 0, updated: 0 };
	const links: { id: string; nleId: string | null; syncHash: string | null }[] = [];
	writes.forEach(({ server }, i) => {
		const result = results[i];
		if (result?.error || !result?.nleId) {
			failures.push({ name: server.name, error: result?.error ?? "not written" });
		}
		if (!result?.nleId) return;
		if (i < plan.add.length) done.added++;
		else done.updated++;
		links.push({
			id: server.id,
			nleId: result.nleId,
			syncHash: syncHash(serverState(server, plan)),
		});
	});
	for (const { nle: nleMarker, server, syncHash } of plan.link) {
		links.push({ id: server.id, nleId: nleMarker.nleId, syncHash });
	}

	let removeError: string | null = null;
	const removeIds = toRemove.flatMap(({ nle }) => (nle.nleId ? [nle.nleId] : []));
	if (removeIds.length > 0) {
		try {
			await nle.removeMarkers(removeIds);
		} catch (err) {
			removeError = err instanceof Error ? err.message : String(err);
		}
	}

	// Links even when some markers failed, so the next pull updates the written ones instead of
	// adding them again
	const forgetDeleted = removeError ? [] : toRemove.map(({ deleted }) => deleted.markerId);
	if (links.length > 0 || forgetDeleted.length > 0) {
		await linkMarkers({
			client,
			path: { projectId, timelineId, exportId },
			body: { nleTimelineId: plan.timeline.id, links: dedupeNleIds(links), forgetDeleted },
			throwOnError: true,
		});
	}

	const report = pullReport(plan, done, failures, removeError ? 0 : toRemove.length, previewed);
	if (removeError) report.warnings.push(`Some markers couldn't be deleted: ${removeError}`);
	return { ...report, markerSetId };
}

// Two markers can't share an NLE id; an adapter returning one twice keeps it on the first
function dedupeNleIds<T extends { nleId: string | null }>(links: T[]) {
	const seen = new Set<string>();
	return links.map((link) => {
		if (!link.nleId) return link;
		if (seen.has(link.nleId)) return { ...link, nleId: null };
		seen.add(link.nleId);
		return link;
	});
}

interface Failure {
	name: string;
	error: string;
}

// One line per reason, naming a few of its markers
function describeFailures(failures: Failure[]) {
	const byError = new Map<string, string[]>();
	for (const { name, error } of failures) {
		byError.set(error, [...(byError.get(error) ?? []), `"${name || "Untitled"}"`]);
	}
	return [...byError].map(([error, names]) => {
		const shown = names.slice(0, 3).join(", ");
		return `${names.length > 3 ? `${shown} and ${names.length - 3} more` : shown}: ${error}`;
	});
}

function pullReport(
	plan: PullPlan,
	written: { added: number; updated: number },
	failures: Failure[],
	removed: number,
	previewed: boolean,
): Omit<SyncReport, "markerSetId"> {
	const host = plan.capabilities.hostName;
	const failed = failures.length;
	const changes = [
		written.added && `${written.added} new`,
		written.updated && `${written.updated} updated`,
		removed && `${removed} deleted`,
	].filter(Boolean);
	const warnings: string[] = [];
	if (failed) {
		warnings.push(
			`${count(failed, "marker")} couldn't be written to ${host}:`,
			...describeFailures(failures),
		);
	}
	const message = changes.length
		? `Synced to ${host}: ${changes.join(", ")}.`
		: failed
			? `Nothing could be written to ${host}.`
			: "Nothing to sync.";
	if (previewed) return { message, warnings };
	const conflicts = plan.update.filter((u) => u.conflict).length;
	if (conflicts) {
		warnings.push(
			`${count(conflicts, "marker")} changed in ${host} and in PostPin: PostPin's version won. ` +
				"Undo it in the history if that was wrong.",
		);
	}
	if (plan.keptInNle.length) {
		warnings.push(
			`${count(plan.keptInNle.length, "marker")} changed in ${host} since the last sync ` +
				`kept ${host}'s version. Sync to PostPin to upload ${plan.keptInNle.length === 1 ? "it" : "them"}.`,
		);
	}
	if (plan.deletedInNle.length) {
		warnings.push(
			`${count(plan.deletedInNle.length, "marker")} deleted in ${host} ` +
				`${plan.deletedInNle.length === 1 ? "wasn't" : "weren't"} added again.`,
		);
	}
	const kept = plan.deletedInPostPin.length - removed;
	if (kept > 0) {
		warnings.push(
			`${count(kept, "marker")} deleted in PostPin ${kept === 1 ? "stays" : "stay"} in ${host}.`,
		);
	}
	return { message, warnings };
}

// ─── Delete all ──────────────────────────────────────────────────────────────

export interface ClearContext {
	nle: NleBridge;
	client: Client;
	projectId: string;
	timelineId: string;
	exportId: string | null;
}

/** Deletes all of the NLE timeline's markers, after a backup */
export async function clearMarkers({
	nle,
	client,
	projectId,
	timelineId,
	exportId,
}: ClearContext): Promise<SyncReport> {
	const [markers, capabilities, timeline] = await Promise.all([
		nle.getMarkers(),
		nle.getCapabilities(),
		nle.getTimelineInfo(),
	]);
	if (!timeline) throw new Error(`No timeline open in ${capabilities.hostName}`);
	if (markers.length === 0) {
		return { message: "There are no markers to delete.", warnings: [], markerSetId: null };
	}
	const { data } = await createMarkerSet({
		client,
		path: { projectId, timelineId },
		body: {
			action: "CLEAR",
			exportId,
			nleTimelineId: timeline.id,
			nleTimelineName: timeline.name,
			hostName: capabilities.hostName,
			nleMarkers: toSnapshot(markers),
			summary: { nle: { added: 0, updated: 0, removed: markers.length } },
		},
		throwOnError: true,
	});
	await nle.clearMarkers();
	return {
		message: `Deleted ${count(markers.length, "marker")} in ${capabilities.hostName}.`,
		warnings: [],
		markerSetId: data.id,
	};
}

// ─── Preview: what an action changes on its target ───────────────────────────

export interface DiffRow {
	/** what applyPush / applyPull take in `selected` */
	key: string;
	/** restore: deleted on the target since the last sync, comes back only when the user wants */
	kind: "add" | "update" | "remove" | "restore";
	name: string;
	/** on the target side: NLE frames for a pull, PostPin frames for a push */
	frame: number;
	categoryName: string;
	/** for updates: what changes, e.g. 'Name: "A" → "B"' */
	changes: string[];
}

export interface SyncPreview {
	/** where the changes go */
	target: "nle" | "postpin";
	hostName: string;
	frameRate: FrameRate | null;
	/** added and changed markers */
	rows: DiffRow[];
	/** markers deleted on the other side; only deleted on the target with the user's yes */
	removals: DiffRow[];
	/** markers deleted on the target; only brought back with the user's yes */
	restores: DiffRow[];
	/** things the user should know before applying */
	notes: string[];
}

export const previewHasChanges = (preview: SyncPreview) =>
	preview.rows.length + preview.removals.length + preview.restores.length > 0;

// What differs between two states, in words. Frames and lengths count on the target side.
function describeChanges(before: SyncState, after: SyncState) {
	const changes: string[] = [];
	if (before.name !== after.name) changes.push(`Name: "${before.name}" → "${after.name}"`);
	if ((before.description ?? "") !== (after.description ?? "")) changes.push("Note changed");
	if (before.frame !== after.frame) changes.push("Moved");
	if (before.duration !== after.duration) changes.push("Length changed");
	if (before.categoryName.toLowerCase() !== after.categoryName.toLowerCase()) {
		changes.push(`Category: ${before.categoryName || "none"} → ${after.categoryName}`);
	}
	return changes;
}

const row = (
	key: string,
	kind: DiffRow["kind"],
	state: SyncState,
	frame: number,
	changes: string[] = [],
): DiffRow => ({
	key,
	kind,
	name: state.name,
	frame,
	categoryName: state.categoryName,
	changes,
});

export function previewPush(plan: PushPlan): SyncPreview {
	const host = plan.capabilities.hostName;
	const rows: DiffRow[] = [
		...plan.create.map(({ state }, i) => row(rowKey("new", i), "add", state, state.frame)),
		...plan.update.map(({ server, state, conflict }, i) =>
			row(rowKey("changed", i), "update", state, state.frame, [
				...describeChanges(serverState(server, plan), state),
				...(conflict ? [`Also changed in PostPin, ${host}'s version wins`] : []),
			]),
		),
	];
	const removals = plan.deletedInNle.map((m, i) => {
		const state = serverState(m, plan);
		return row(rowKey("gone", i), "remove", state, state.frame);
	});
	const restores = plan.deletedInPostPin.map((nle, i) => {
		const state = nleState(nle, plan);
		return row(rowKey("back", i), "restore", state, state.frame);
	});
	const notes = [
		plan.keptInPostPin.length &&
			`${count(plan.keptInPostPin.length, "marker")} changed in PostPin since the last sync ` +
				"keep PostPin's version.",
	].filter((n): n is string => !!n);
	return {
		target: "postpin",
		hostName: host,
		frameRate: plan.frameRate,
		rows,
		removals,
		restores,
		notes,
	};
}

export function previewPull(plan: PullPlan): SyncPreview {
	const host = plan.capabilities.hostName;
	const toNle = (state: SyncState) => state.frame + plan.frameOffset;
	const rows: DiffRow[] = [
		...plan.add.map(({ server }, i) => {
			const state = serverState(server, plan);
			return row(rowKey("new", i), "add", state, toNle(state));
		}),
		...plan.update.map(({ nle, server, conflict }, i) => {
			const state = serverState(server, plan);
			return row(rowKey("changed", i), "update", state, toNle(state), [
				...describeChanges(nleState(nle, plan, server.duration), state),
				...(conflict ? [`Also changed in ${host}, PostPin's version wins`] : []),
			]);
		}),
	];
	const removals = plan.deletedInPostPin.map(({ nle }, i) =>
		row(rowKey("gone", i), "remove", nleState(nle, plan), nle.frame),
	);
	const restores = plan.deletedInNle.map((server, i) => {
		const state = serverState(server, plan);
		return row(rowKey("back", i), "restore", state, toNle(state));
	});
	const notes = [
		plan.keptInNle.length &&
			`${count(plan.keptInNle.length, "marker")} changed in ${host} since the last sync ` +
				`keep ${host}'s version.`,
		plan.frameOffset !== 0 &&
			"The export starts at another timecode than the timeline, the markers are shifted to match.",
	].filter((n): n is string => !!n);
	return {
		target: "nle",
		hostName: host,
		frameRate: plan.frameRate,
		rows,
		removals,
		restores,
		notes,
	};
}

export type SyncMode = "add" | "match";

/**
 * The rows a mode applies: "add" writes the new and changed markers only; "match" makes the target
 * like the source, which also deletes what the source lost and brings back what the target deleted
 */
export function selectionFor(preview: SyncPreview, mode: SyncMode) {
	const rows =
		mode === "match" ? [...preview.rows, ...preview.removals, ...preview.restores] : preview.rows;
	return new Set(rows.map((r) => r.key));
}
