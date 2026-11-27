import type { Prisma } from "@postpin-io/shared/db";
import {
	MARKER_SET_FORMAT,
	type MarkerSetSideSummary,
	type MarkerSetSummary,
	type NleMarkerSnapshot,
	type PostPinMarkerSnapshot,
	type PostPinMarkerSnapshotEntry,
} from "@postpin-io/shared/logic/marker-sets";
import type { MarkerSetAction } from "@postpin-io/shared/db/enums";

type Tx = Prisma.TransactionClient;

/**
 * Deletes markers and remembers them as deleted, so the plugins neither push them back from the NLE
 * nor keep them there (a pull offers to remove them). Every deletion of markers that may be in an
 * NLE goes through here; deleting a whole export doesn't need it.
 */
export async function deleteMarkersRecorded(tx: Tx, where: Prisma.MarkerWhereInput) {
	const markers = await tx.marker.findMany({
		where,
		select: {
			id: true,
			exportId: true,
			nleId: true,
			nleTimelineId: true,
			syncHash: true,
			guestId: true,
			categoryId: true,
		},
	});
	if (markers.length === 0) return markers;
	await tx.deletedMarker.createMany({
		data: markers.map((m) => ({
			markerId: m.id,
			exportId: m.exportId,
			nleId: m.nleId,
			nleTimelineId: m.nleTimelineId,
			syncHash: m.syncHash,
		})),
		skipDuplicates: true,
	});
	await tx.marker.deleteMany({ where: { id: { in: markers.map((m) => m.id) } } });
	return markers;
}

/** What a snapshot needs of a marker; see toSnapshotEntry */
export const snapshotInclude = {
	category: { select: { name: true, color: true } },
	responses: { orderBy: { createdAt: "asc" } },
	pointers: { orderBy: { createdAt: "asc" } },
} as const satisfies Prisma.MarkerInclude;

type SnapshotMarker = Prisma.MarkerGetPayload<{ include: typeof snapshotInclude }>;

/** A marker with everything needed to bring it back when it was deleted since */
export function toSnapshotEntry(m: SnapshotMarker): PostPinMarkerSnapshotEntry {
	return {
		id: m.id,
		name: m.name,
		description: m.description,
		frame: m.frame,
		duration: m.duration,
		categoryId: m.categoryId,
		categoryName: m.category.name,
		categoryColor: m.category.color,
		nleId: m.nleId,
		nleTimelineId: m.nleTimelineId,
		syncHash: m.syncHash,
		authorId: m.authorId,
		guestId: m.guestId,
		createdAt: m.createdAt.toISOString(),
		responses: m.responses.map((r) => ({
			id: r.id,
			content: r.content,
			authorId: r.authorId,
			createdAt: r.createdAt.toISOString(),
			updatedAt: r.updatedAt.toISOString(),
		})),
		pointers: m.pointers.map((p) => ({
			id: p.id,
			kind: p.kind,
			x: p.x,
			y: p.y,
			width: p.width,
			height: p.height,
			color: p.color,
			createdAt: p.createdAt.toISOString(),
		})),
	};
}

/** The export's markers as they are now, with what's needed to bring deleted ones back */
export async function snapshotExportMarkers(
	tx: Tx,
	exportId: string,
): Promise<PostPinMarkerSnapshot> {
	const markers = await tx.marker.findMany({
		where: { exportId },
		orderBy: { frame: "asc" },
		include: snapshotInclude,
	});
	return { format: MARKER_SET_FORMAT, markers: markers.map(toSnapshotEntry) };
}

export interface MarkerSetInput {
	action: MarkerSetAction;
	timelineId: string;
	exportId: string | null;
	nleTimelineId: string;
	nleTimelineName: string | null;
	hostName: string;
	createdById: string;
	summary: MarkerSetSummary;
	nleMarkers: NleMarkerSnapshot;
	/** taken from the export when left out */
	postpinMarkers?: PostPinMarkerSnapshot | null;
}

/** Stores a backup; the export's markers are read in the same transaction as the action */
export async function createMarkerSet(tx: Tx, input: MarkerSetInput) {
	const postpinMarkers =
		input.postpinMarkers !== undefined
			? input.postpinMarkers
			: input.exportId
				? await snapshotExportMarkers(tx, input.exportId)
				: null;
	return tx.markerSet.create({
		data: {
			action: input.action,
			timelineId: input.timelineId,
			exportId: input.exportId,
			nleTimelineId: input.nleTimelineId,
			nleTimelineName: input.nleTimelineName,
			hostName: input.hostName,
			createdById: input.createdById,
			summary: input.summary as Prisma.InputJsonValue,
			nleMarkers: input.nleMarkers as unknown as Prisma.InputJsonValue,
			...(postpinMarkers && {
				postpinMarkers: postpinMarkers as unknown as Prisma.InputJsonValue,
			}),
		},
		select: { id: true },
	});
}

const sameFields = (
	a: Pick<PostPinMarkerSnapshotEntry, "name" | "description" | "frame" | "duration" | "categoryId">,
	b: Pick<PostPinMarkerSnapshotEntry, "name" | "description" | "frame" | "duration" | "categoryId">,
) =>
	a.name === b.name &&
	(a.description ?? "") === (b.description ?? "") &&
	a.frame === b.frame &&
	a.duration === b.duration &&
	a.categoryId === b.categoryId;

/**
 * Brings the export's markers back to a snapshot: markers added since are deleted (and remembered
 * as deleted, so a pull removes them from the NLE too), changed ones get their old fields back and
 * deleted ones come back with their responses and pointers. Responses and pointers added since to
 * markers that stay are kept.
 */
export async function restoreExportMarkers(
	tx: Tx,
	exportId: string,
	projectId: string,
	snapshot: PostPinMarkerSnapshot,
): Promise<MarkerSetSideSummary> {
	const current = await tx.marker.findMany({
		where: { exportId },
		select: {
			id: true,
			name: true,
			description: true,
			frame: true,
			duration: true,
			categoryId: true,
		},
	});
	const currentById = new Map(current.map((m) => [m.id, m]));
	const wanted = new Set(snapshot.markers.map((m) => m.id));

	const removed = await deleteMarkersRecorded(tx, {
		exportId,
		id: { notIn: [...wanted] },
	});

	// The snapshot's NLE ids may sit on other markers by now; free them first (unique per export)
	const nleIds = snapshot.markers.flatMap((m) => (m.nleId ? [m.nleId] : []));
	if (nleIds.length > 0) {
		await tx.marker.updateMany({
			where: { exportId, nleId: { in: nleIds } },
			data: { nleId: null },
		});
	}

	const categoryOf = await categoryResolver(tx, projectId);
	const existingUsers = await existingIds(
		snapshot.markers.flatMap((m) => [m.authorId, ...m.responses.map((r) => r.authorId)]),
		(ids) => tx.user.findMany({ where: { id: { in: ids } }, select: { id: true } }),
	);
	const existingGuests = await existingIds(
		snapshot.markers.map((m) => m.guestId),
		(ids) => tx.shareGuest.findMany({ where: { id: { in: ids } }, select: { id: true } }),
	);
	const user = (id: string | null) => (id && existingUsers.has(id) ? id : null);

	let added = 0;
	let updated = 0;
	for (const m of snapshot.markers) {
		const categoryId = await categoryOf(m);
		const fields = {
			name: m.name,
			description: m.description,
			frame: m.frame,
			duration: m.duration,
			categoryId,
			nleId: m.nleId,
			nleTimelineId: m.nleTimelineId,
			syncHash: m.syncHash,
		};
		const existing = currentById.get(m.id);
		if (existing) {
			if (!sameFields(existing, { ...m, categoryId })) updated++;
			await tx.marker.update({ where: { id: m.id }, data: fields });
			continue;
		}
		added++;
		await tx.marker.create({
			data: {
				id: m.id,
				...fields,
				exportId,
				createdAt: new Date(m.createdAt),
				authorId: user(m.authorId),
				guestId: m.guestId && existingGuests.has(m.guestId) ? m.guestId : null,
				responses: {
					create: m.responses.map((r) => ({
						id: r.id,
						content: r.content,
						authorId: user(r.authorId),
						createdAt: new Date(r.createdAt),
					})),
				},
				pointers: {
					create: m.pointers.map((p) => ({
						id: p.id,
						kind: p.kind,
						x: p.x,
						y: p.y,
						width: p.width,
						height: p.height,
						color: p.color,
						createdAt: new Date(p.createdAt),
					})),
				},
			},
		});
	}
	// They exist again
	await tx.deletedMarker.deleteMany({ where: { markerId: { in: [...wanted] } } });

	return { added, updated, removed: removed.length };
}

export async function existingIds(
	ids: (string | null)[],
	find: (ids: string[]) => Promise<{ id: string }[]>,
) {
	const unique = [...new Set(ids.filter((id): id is string => !!id))];
	if (unique.length === 0) return new Set<string>();
	return new Set((await find(unique)).map((row) => row.id));
}

// The snapshot's category, else one of the project's with its name, else a new one like it
export async function categoryResolver(tx: Tx, projectId: string) {
	const categories = await tx.category.findMany({
		where: { projectId },
		select: { id: true, name: true },
	});
	const byId = new Set(categories.map((c) => c.id));
	const byName = new Map(categories.map((c) => [c.name, c.id]));
	return async (
		m: Pick<PostPinMarkerSnapshotEntry, "categoryId" | "categoryName" | "categoryColor">,
	) => {
		if (byId.has(m.categoryId)) return m.categoryId;
		const named = byName.get(m.categoryName);
		if (named) return named;
		const { id } = await tx.category.create({
			data: { projectId, name: m.categoryName, color: m.categoryColor },
			select: { id: true },
		});
		byId.add(id);
		byName.set(m.categoryName, id);
		return id;
	};
}
