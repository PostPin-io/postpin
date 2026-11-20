import { prisma } from "#lib/server/database.ts";
import { command, query } from "$app/server";
import { Prisma } from "@postpin-io/shared/db";
import { error } from "@sveltejs/kit";
import { shareLinkCategory } from "#lib/server/share-links.ts";
import { readExport, requireMarkers } from "#lib/server/review-access.ts";
import { markersKey, scopeOf } from "./marker-scope.ts";
import { notifyCategories, notifyMarkers, notifyResponses } from "#lib/server/live.ts";
import { deleteMarkersRecorded } from "#lib/server/marker-sets.ts";

import {
	accessChecker,
	accessibleExports,
	authorize,
	authorizeMarkers,
} from "#lib/server/org-access.ts";

import { can } from "#lib/roles.ts";

import * as v from "valibot";
import { isInTimeline, timelineBounds, type FrameRange } from "@postpin-io/shared/logic/ranges";
import {
	DEFAULT_POINTER_COLOR,
	MAX_POINTERS_PER_MARKER,
	pointerColorSchema,
	pointerGeometrySchema,
} from "@postpin-io/shared/logic/pointers";

const MAX_BULK = 500;

const authorSelect = { select: { id: true, name: true, image: true } } as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function assertCategoriesInProject(categoryIds: string[], projectId: string | null) {
	if (!projectId) error(404, "Not found");
	const unique = [...new Set(categoryIds)];
	const count = await prisma.category.count({ where: { id: { in: unique }, projectId } });
	if (count !== unique.length) error(404, "Not found");
}

/**
 * Markers must sit on the export's timeline from their first to their last frame.
 * Exports without a snapshot (yet) have no known range and are not checked.
 */
async function assertRangesInTimeline(exportId: string, ranges: FrameRange[]) {
	const exp = await prisma.export.findUnique({
		where: { id: exportId },
		select: { timelineSnapshot: true },
	});
	const timeline = v.safeParse(timelineRange, exp?.timelineSnapshot);
	if (!timeline.success) return;
	if (ranges.some((r) => !isInTimeline(r, timeline.output))) {
		const { first, last } = timelineBounds(timeline.output);
		error(400, `Marker outside the timeline (${first}–${last})`);
	}
}
const timelineRange = v.object({ startFrameIndex: v.number(), durationFrameCount: v.number() });
/** Length in frames, 0 = point marker */
const duration = v.pipe(v.number(), v.integer(), v.minValue(0));
/** Set by the share page: the call is a share-link guest's (see readExport) */
const shareToken = v.optional(v.string());

/**
 * A guest's own marker on the linked export, else 404: someone else's marker
 * (another guest's or the team's) looks like it doesn't exist.
 */
async function guestMarker(id: string, token: string) {
	const marker = await prisma.marker.findUnique({
		where: { id },
		select: { exportId: true, guestId: true, duration: true },
	});
	if (!marker) error(404, "Not found");
	const reader = await readExport(marker.exportId, token);
	if (reader.kind !== "guest" || marker.guestId !== reader.guest.id) error(404, "Not found");
	requireMarkers(reader);
	return { reader, exportId: marker.exportId, duration: marker.duration };
}

/**
 * Same project → keep the category.
 * Other project → category with the same name there, else the fallback.
 */
async function mapCategories(
	markers: { categoryId: string; category: { name: string; projectId: string } }[],
	targetProjectId: string,
	fallbackCategoryId: string,
) {
	const foreignNames = [
		...new Set(
			markers.filter((m) => m.category.projectId !== targetProjectId).map((m) => m.category.name),
		),
	];
	const byName = new Map(
		(foreignNames.length
			? await prisma.category.findMany({
					where: { projectId: targetProjectId, name: { in: foreignNames } },
					select: { id: true, name: true },
				})
			: []
		).map((c) => [c.name, c.id]),
	);

	return (m: (typeof markers)[number]) =>
		m.category.projectId === targetProjectId
			? m.categoryId
			: (byName.get(m.category.name) ?? fallbackCategoryId);
}

const pointerSelect = {
	id: true,
	kind: true,
	x: true,
	y: true,
	width: true,
	height: true,
	color: true,
} as const;

// ─── Marker: Queries ────────────────────────────────────────────────────────
export const getMarkers = query(
	v.union([v.string(), v.object({ exportId: v.string(), shareToken: v.string() })]),
	async (key) => {
		const { exportId, shareToken } = scopeOf(key);
		const reader = await readExport(exportId, shareToken);
		const include = {
			author: authorSelect,
			guest: { select: { name: true } },
			category: true,
			pointers: { select: pointerSelect, orderBy: { createdAt: "asc" } },
		} as const;

		if (reader.kind === "guest") {
			requireMarkers(reader);
			const markers = await prisma.marker.findMany({
				where: { exportId, guestId: reader.guest.id },
				orderBy: { frame: "desc" },
				include,
			});
			// Guests never see responses, and may change all of their own markers
			return markers.map((m) => ({ ...m, responses: [], canUpdate: true, canDelete: true }));
		}

		const { member, target } = reader;
		const allowed = await accessChecker(member);
		const markers = await prisma.marker.findMany({
			where: { exportId },
			orderBy: { frame: "desc" },
			include: {
				...include,
				responses: {
					select: { content: true, authorId: true, createdAt: true },
					orderBy: { createdAt: "asc" },
				},
			},
		});

		return markers.map((m) => {
			const t = { projectId: target.projectId, timelineId: target.timelineId, ownerId: m.authorId };
			return {
				...m,
				canUpdate: allowed("marker", "update", t),
				canDelete: allowed("marker", "delete", t),
			};
		});
	},
);

export const getMarkersbyCategory = query(v.string(), async (categoryId: string) => {
	const { member } = await authorize("category", "read", { type: "category", id: categoryId });

	return await prisma.marker.findMany({
		where: { categoryId, export: accessibleExports(member) },
		orderBy: { frame: "desc" },
		include: {
			author: authorSelect,
			category: true,
		},
	});
});

// ─── Marker: Commands ───────────────────────────────────────────────────────

export const pasteMarkers = command(
	v.object({
		sourceExportId: v.string(),
		markerIds: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(MAX_BULK)),
		targetExportId: v.string(),
		/** Frame where the earliest pasted marker lands (playhead) */
		anchorFrame: v.pipe(v.number(), v.integer(), v.minValue(0)),
		/** Category for markers whose category doesn't exist in the target project */
		fallbackCategoryId: v.string(),
		mode: v.picklist(["copy", "cut"]),
	}),
	async (data) => {
		// 1. Rechte: Quelle lesen, Ziel beschreiben
		await authorize("export", "read", { type: "export", id: data.sourceExportId });
		const { user, target } = await authorize("marker", "create", {
			type: "export",
			id: data.targetExportId,
		});
		await assertCategoriesInProject([data.fallbackCategoryId], target.projectId);

		// 2. Quelle aus der DB laden – Inhalte kommen NIE vom Client
		const source = await prisma.marker.findMany({
			where: { id: { in: data.markerIds }, exportId: data.sourceExportId },
			include: {
				responses: { select: { content: true, authorId: true, createdAt: true } },
				category: { select: { name: true, projectId: true } },
				pointers: {
					select: { kind: true, x: true, y: true, width: true, height: true, color: true },
					orderBy: { createdAt: "asc" },
				},
			},
		});
		// Schon gelöschte Marker im Clipboard werden übersprungen, nicht als Fehler gewertet
		if (source.length === 0) error(404, "Nothing to paste");

		// 3. Bei "cut" muss der User die Quell-Marker löschen dürfen (Reviewer: nur eigene)
		if (data.mode === "cut") {
			await authorizeMarkers(
				"delete",
				data.sourceExportId,
				source.map((m) => m.id),
			);
		}

		// 4. Kategorien zuordnen (siehe Schritt 3)
		const categoryOf = await mapCategories(source, target.projectId!, data.fallbackCategoryId);

		// 5. Anlegen (+ bei "cut" Quelle löschen) in EINER Transaktion
		const minFrame = Math.min(...source.map((m) => m.frame));
		await assertRangesInTimeline(
			data.targetExportId,
			source.map((m) => ({ frame: data.anchorFrame + (m.frame - minFrame), duration: m.duration })),
		);
		await prisma.$transaction(async (tx) => {
			for (const m of source) {
				await tx.marker.create({
					data: {
						name: m.name,
						description: m.description,
						frame: data.anchorFrame + (m.frame - minFrame),
						duration: m.duration,
						exportId: data.targetExportId,
						categoryId: categoryOf(m),
						// cut = move → the author stays (a guest too); copy = new marker → whoever pastes
						authorId: data.mode === "cut" ? m.authorId : user.id,
						guestId: data.mode === "cut" ? m.guestId : null,

						// nleId is deliberately NOT copied: unique per export, it belongs to the NLE original
						responses: {
							create: m.responses.map((r) => ({
								content: r.content,
								authorId: r.authorId,
								createdAt: r.createdAt,
							})),
						},
						pointers: { create: m.pointers },
					},
				});
			}
			if (data.mode === "cut") {
				await deleteMarkersRecorded(tx, {
					id: { in: source.map((m) => m.id) },
					exportId: data.sourceExportId,
				});
			}
		});

		// 6. Refresh; a cut keeps the guests, so their tabs hear about both sides
		const movedGuests = data.mode === "cut" ? source.map((m) => m.guestId) : [];
		void notifyMarkers(data.targetExportId, movedGuests);
		if (data.mode === "cut" && data.sourceExportId !== data.targetExportId) {
			void notifyMarkers(data.sourceExportId, movedGuests);
		}
		await Promise.all([
			getMarkers(data.targetExportId).refresh(),
			...(data.mode === "cut" && data.sourceExportId !== data.targetExportId
				? [getMarkers(data.sourceExportId).refresh()]
				: []),
		]);

		return { count: source.length, skipped: new Set(data.markerIds).size - source.length };
	},
);
export const createMarker = command(
	v.object({
		name: v.string(),
		description: v.string(),
		frame: v.pipe(v.number(), v.integer(), v.minValue(0)),
		duration: v.optional(duration, 0),
		exportId: v.string(),
		/** Members only; guests get the link's category */
		categoryId: v.optional(v.string()),
		shareToken,
	}),
	async (data) => {
		// ─── Guest: the link's category, the guest as author ───
		if (data.shareToken) {
			const reader = await readExport(data.exportId, data.shareToken);
			if (reader.kind !== "guest") error(404, "Not found");
			requireMarkers(reader);
			await assertRangesInTimeline(data.exportId, [{ frame: data.frame, duration: data.duration }]);

			const marker = await prisma.$transaction(async (tx) =>
				tx.marker.create({
					data: {
						name: data.name,
						description: data.description,
						frame: data.frame,
						exportId: data.exportId,
						categoryId: await shareLinkCategory(
							tx,
							reader.link,
							reader.link.export.timeline.projectId,
						),
						guestId: reader.guest.id,
					},
				}),
			);
			void notifyMarkers(data.exportId, [reader.guest.id]);
			await getMarkers(markersKey(data.exportId, data.shareToken)).refresh();
			return marker;
		}

		// ─── Member: as before ───
		if (!data.categoryId) error(400, "Category required");
		// Bei `create` ist das Target der Parent (der Export)
		const { user, target } = await authorize("marker", "create", {
			type: "export",
			id: data.exportId,
		});
		await assertCategoriesInProject([data.categoryId], target.projectId);
		await assertRangesInTimeline(data.exportId, [{ frame: data.frame, duration: data.duration }]);

		const marker = await prisma.marker.create({
			data: {
				name: data.name,
				description: data.description,
				frame: data.frame,
				duration: data.duration,
				exportId: data.exportId,
				categoryId: data.categoryId,
				authorId: user.id,
			},
		});
		void notifyMarkers(data.exportId);
		await getMarkers(data.exportId).refresh();
		return marker;
	},
);

export const updateMarker = command(
	v.object({
		id: v.string(),
		name: v.string(),
		description: v.string(),
		frame: v.pipe(v.number(), v.integer(), v.minValue(0)),
		/** Left out: the marker keeps its duration, e.g. when it's only moved */
		duration: v.optional(duration),
		/** Ignored for guests: their markers stay in the guest category */
		categoryId: v.string(),
		shareToken,
	}),
	async (data) => {
		// ─── Guest: only own markers, category stays ───
		if (data.shareToken) {
			const { exportId, duration } = await guestMarker(data.id, data.shareToken);
			await assertRangesInTimeline(exportId, [
				{ frame: data.frame, duration: data.duration ?? duration },
			]);
			const marker = await prisma.marker.update({
				where: { id: data.id },
				data: {
					name: data.name,
					description: data.description,
					frame: data.frame,
					duration: data.duration,
				},
			});
			void notifyMarkers(exportId, [marker.guestId]);
			await getMarkers(markersKey(exportId, data.shareToken)).refresh();
			return marker;
		}

		// ─── Member: as before ───
		const { target } = await authorize("marker", "update", { type: "marker", id: data.id });
		await assertCategoriesInProject([data.categoryId], target.projectId);
		const { exportId, duration } = await prisma.marker.findUniqueOrThrow({
			where: { id: data.id },
			select: { exportId: true, duration: true },
		});
		await assertRangesInTimeline(exportId, [
			{ frame: data.frame, duration: data.duration ?? duration },
		]);

		const marker = await prisma.marker.update({
			where: { id: data.id },
			data: {
				name: data.name,
				description: data.description,
				frame: data.frame,
				duration: data.duration,
				categoryId: data.categoryId,
			},
		});
		void notifyMarkers(marker.exportId, [marker.guestId]);
		await getMarkers(marker.exportId).refresh();
		return marker;
	},
);

// Deleted markers are remembered, so the NLE plugins don't push them back (see marker-sets.ts)
async function deleteOne(id: string) {
	const [marker] = await prisma.$transaction((tx) => deleteMarkersRecorded(tx, { id }));
	if (!marker) error(404, "Marker not found");
	return marker;
}
async function deleteMany(where: Prisma.MarkerWhereInput) {
	const markers = await prisma.$transaction((tx) => deleteMarkersRecorded(tx, where));
	return { count: markers.length };
}

export const deleteMarker = command(
	v.union([v.string(), v.object({ id: v.string(), shareToken: v.string() })]),
	async (arg) => {
		// ─── Guest ───
		if (typeof arg !== "string") {
			const { exportId } = await guestMarker(arg.id, arg.shareToken);
			const marker = await deleteOne(arg.id);
			void notifyMarkers(exportId, [marker.guestId]);
			await getMarkers(markersKey(exportId, arg.shareToken)).refresh();
			return marker;
		}

		// ─── Member: as before ───
		const id = arg;
		await authorize("marker", "delete", { type: "marker", id });

		const marker = await deleteOne(id);
		void notifyMarkers(marker.exportId, [marker.guestId]);

		await Promise.all([
			getMarkers(marker.exportId).refresh(),
			getCategoryUsage(marker.categoryId).refresh(),
		]);

		return marker;
	},
);

export const deleteMarkers = command(
	v.object({
		exportId: v.string(),
		ids: v.pipe(v.array(v.string()), v.maxLength(MAX_BULK)),
		shareToken,
	}),
	async (data) => {
		// ─── Guest: only own markers; anyone else's ids in the list are skipped ───
		if (data.shareToken) {
			const reader = await readExport(data.exportId, data.shareToken);
			if (reader.kind !== "guest") error(404, "Not found");
			requireMarkers(reader);
			const result = await deleteMany({
				id: { in: data.ids },
				exportId: data.exportId,
				guestId: reader.guest.id,
			});
			void notifyMarkers(data.exportId, [reader.guest.id]);
			await getMarkers(markersKey(data.exportId, data.shareToken)).refresh();
			return result;
		}

		// ─── Member: as before ───
		const { markers } = await authorizeMarkers("delete", data.exportId, data.ids);

		const result = await deleteMany({
			id: { in: markers.map((m) => m.id) },
			exportId: data.exportId,
		});
		void notifyMarkers(
			data.exportId,
			markers.map((m) => m.guestId),
		);

		const categoryIds = new Set(markers.map((m) => m.categoryId));
		await Promise.all([
			getMarkers(data.exportId).refresh(),
			...[...categoryIds].map((categoryId) => getCategoryUsage(categoryId).refresh()),
		]);

		return result;
	},
);

export const moveMarker = command(
	v.object({
		exportId: v.string(),
		ids: v.pipe(v.array(v.string()), v.maxLength(MAX_BULK)),
		targetCategoryId: v.string(),
	}),
	async (data) => {
		const { user, target, markers } = await authorizeMarkers("update", data.exportId, data.ids);

		await assertCategoriesInProject([data.targetCategoryId], target.projectId);

		const markerIds = markers.map((m) => m.id);
		const sourceCategoryIds = [...new Set(markers.map((m) => m.categoryId))].filter(
			(id) => id !== data.targetCategoryId,
		);

		// The transaction now only performs the move. Automatic cleanup happens afterwards,
		// so that a race condition (new marker in the source category → P2003) does not roll back the allowed
		// move.
		const { count: moved } = await prisma.marker.updateMany({
			where: { id: { in: markerIds }, exportId: data.exportId },
			data: { categoryId: data.targetCategoryId },
		});

		const deletedCategoryIds: string[] = [];
		for (const categoryId of sourceCategoryIds) {
			// "Empty" = no markers in the entire project (categories are attached to the project)
			if ((await prisma.marker.count({ where: { categoryId } })) > 0) continue;

			try {
				// Only delete if the user created it themselves. Not the category of a screening
				// whose link still works: its guests' next markers belong there.
				const res = await prisma.category.deleteMany({
					where: {
						id: categoryId,
						createdById: user.id,
						shareLinks: { none: activeShareLink() },
					},
				});
				if (res.count > 0) deletedCategoryIds.push(categoryId);
			} catch (e) {
				// In the meantime, a marker has been added: the category simply remains
				if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003")) throw e;
			}
		}

		void notifyMarkers(
			data.exportId,
			markers.map((m) => m.guestId),
		);
		if (deletedCategoryIds.length > 0) void notifyCategories(target.projectId!);

		// Don't refresh deleted categories anymore: getCategoryUsage would return a 404 there
		const stillExisting = sourceCategoryIds.filter((id) => !deletedCategoryIds.includes(id));

		await Promise.all([
			getMarkers(data.exportId).refresh(),
			getCategoryUsage(data.targetCategoryId).refresh(),
			...stillExisting.map((id) => getCategoryUsage(id).refresh()),
			...(deletedCategoryIds.length > 0 ? [getCategories(target.projectId!).refresh()] : []),
		]);

		return { count: moved, deletedCategoryIds };
	},
);

export const changeDescription = command(
	v.object({
		id: v.string(),
		description: v.string(),
	}),
	async (data) => {
		await authorize("marker", "update", { type: "marker", id: data.id });

		const marker = await prisma.marker.update({
			where: { id: data.id },
			data: { description: data.description },
		});
		void notifyMarkers(marker.exportId, [marker.guestId]);
		return marker;
	},
);

// ─── Responses ──────────────────────────────────────────────────────────────

// ─── Pointers: arrows and boxes on the picture, part of their marker ─────────

/**
 * Pointers belong to their marker: whoever may update the marker may add, change and remove them.
 * Returns the getMarkers key to refresh.
 */
async function authorizePointers(markerId: string, shareToken: string | undefined) {
	if (shareToken) {
		const { exportId } = await guestMarker(markerId, shareToken);
		return markersKey(exportId, shareToken);
	}
	await authorize("marker", "update", { type: "marker", id: markerId });
	const { exportId } = await prisma.marker.findUniqueOrThrow({
		where: { id: markerId },
		select: { exportId: true },
	});
	return markersKey(exportId);
}

/** A pointer's marker, checked like the marker itself; an unknown pointer is a 404 */
async function authorizePointer(id: string, shareToken: string | undefined) {
	const pointer = await prisma.markerPointer.findUnique({
		where: { id },
		select: { markerId: true, kind: true },
	});
	if (!pointer) error(404, "Not found");
	return { pointer, key: await authorizePointers(pointer.markerId, shareToken) };
}

export const createPointer = command(
	v.object({
		markerId: v.string(),
		geometry: pointerGeometrySchema,
		color: v.optional(pointerColorSchema, DEFAULT_POINTER_COLOR),
		shareToken,
	}),
	async (data) => {
		const key = await authorizePointers(data.markerId, data.shareToken);
		const count = await prisma.markerPointer.count({ where: { markerId: data.markerId } });
		if (count >= MAX_POINTERS_PER_MARKER) {
			error(400, `A marker has at most ${MAX_POINTERS_PER_MARKER} pointers`);
		}
		const { kind, x, y } = data.geometry;
		const pointer = await prisma.markerPointer.create({
			data: {
				markerId: data.markerId,
				kind,
				x,
				y,
				...(data.geometry.kind === "RECT"
					? { width: data.geometry.width, height: data.geometry.height }
					: {}),
				color: data.color,
			},
			select: pointerSelect,
		});
		await getMarkers(key).refresh();
		return pointer;
	},
);

export const updatePointer = command(
	v.object({
		id: v.string(),
		/** Moved or resized; the kind stays (an arrow can't become a box) */
		geometry: v.optional(pointerGeometrySchema),
		color: v.optional(pointerColorSchema),
		shareToken,
	}),
	async (data) => {
		const { pointer, key } = await authorizePointer(data.id, data.shareToken);
		const geometry = data.geometry;
		if (geometry && geometry.kind !== pointer.kind) error(400, "A pointer keeps its kind");
		const updated = await prisma.markerPointer.update({
			where: { id: data.id },
			data: {
				...(geometry
					? {
							x: geometry.x,
							y: geometry.y,
							...(geometry.kind === "RECT"
								? { width: geometry.width, height: geometry.height }
								: {}),
						}
					: {}),
				...(data.color ? { color: data.color } : {}),
			},
			select: pointerSelect,
		});
		await getMarkers(key).refresh();
		return updated;
	},
);

export const deletePointer = command(v.object({ id: v.string(), shareToken }), async (data) => {
	const { key } = await authorizePointer(data.id, data.shareToken);
	await prisma.markerPointer.delete({ where: { id: data.id } });
	await getMarkers(key).refresh();
});

export const getResponses = query(v.string(), async (markerId: string) => {
	await authorize("marker", "read", { type: "marker", id: markerId });

	return await prisma.response.findMany({
		where: { markerId },
		orderBy: { createdAt: "asc" },
		include: { author: authorSelect },
	});
});

export const createResponse = command(
	v.object({
		markerId: v.string(),
		content: v.pipe(v.string(), v.trim(), v.minLength(1)),
	}),
	async (data) => {
		const { user } = await authorize("marker", "respond", { type: "marker", id: data.markerId });

		const response = await prisma.response.create({
			data: { markerId: data.markerId, content: data.content, authorId: user.id },
		});
		const marker = await prisma.marker.findUniqueOrThrow({
			where: { id: data.markerId },
			select: { exportId: true },
		});
		void notifyResponses(marker.exportId, data.markerId);
		await Promise.all([
			getResponses(data.markerId).refresh(),
			getMarkers(marker.exportId).refresh(),
		]);
		return response;
	},
);

// ─── Categories ─────────────────────────────────────────────────────────────

export const getCategories = query(v.string(), async (projectId: string) => {
	const { member } = await authorize("project", "read", { type: "project", id: projectId });
	const allowed = await accessChecker(member);
	const categories = await prisma.category.findMany({
		where: { projectId },
		orderBy: { name: "asc" },
		include: {
			_count: { select: { markers: true, shareLinks: { where: activeShareLink() } } },
		},
	});

	return categories.map(({ _count, ...c }) => {
		const t = { projectId, ownerId: c.createdById, loose: true };
		return {
			...c,
			canUpdate: allowed("category", "update", t),
			canDelete: allowed("category", "delete", t),
			/** No markers in the whole project, and no working share link puts its guests' markers here */
			unused: _count.markers === 0 && _count.shareLinks === 0,
		};
	});
});

/** Share links that still work: their guests' next markers go to the link's category */
const activeShareLink = () => ({
	revokedAt: null,
	OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

/** Deletes every category of the project without markers that the user may delete. */
export const deleteUnusedCategories = command(
	v.object({ projectId: v.string() }),
	async ({ projectId }) => {
		const { user, member } = await authorize("project", "read", { type: "project", id: projectId });
		const allowed = await accessChecker(member);
		const t = { projectId, loose: true };
		const mayDeleteForeign = allowed("category", "delete", t);
		if (!mayDeleteForeign && !allowed("category", "delete", { ...t, ownerId: user.id })) {
			error(403, "Not allowed to delete categories");
		}

		try {
			const { count } = await prisma.category.deleteMany({
				where: {
					projectId,
					markers: { none: {} },
					shareLinks: { none: activeShareLink() },
					...(!mayDeleteForeign && { createdById: user.id }),
				},
			});
			if (count > 0) void notifyCategories(projectId);
			await getCategories(projectId).refresh();
			return { count };
		} catch (e) {
			// A marker was added to one of them meanwhile
			if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
				error(409, "Categories changed in the meantime. Please try again.");
			}
			throw e;
		}
	},
);

export const createCategory = command(
	v.object({
		name: v.string(),
		color: v.string(),
		projectId: v.string(),
	}),

	async (data) => {
		const { user } = await authorize("category", "create", {
			type: "project",
			id: data.projectId,
		});

		const category = await prisma.category
			.create({
				data: {
					name: data.name,
					color: data.color,
					projectId: data.projectId,
					createdById: user.id,
				},
			})
			.catch(conflictOnDuplicate(data.name));
		void notifyCategories(data.projectId);
		await getCategories(data.projectId).refresh();
		return category;
	},
);

/**
 * Replaces `isCategoryUsed`. Intentionally counts across the entire project (including exports without access);
 * only numbers are returned, not content.
 *
 * - `total`: all markers in the category
 * - `foreign`: markers from other users (including markers from deleted users, `authorId = NULL`)
 * - `canMoveForeign`: is the current user allowed to move other users’ markers (Member+)?
 */
export const getCategoryUsage = query(v.string(), async (categoryId: string) => {
	const { user, member } = await authorize("category", "read", {
		type: "category",
		id: categoryId,
	});

	const [total, foreign] = await Promise.all([
		prisma.marker.count({ where: { categoryId } }),

		prisma.marker.count({
			where: { categoryId, OR: [{ authorId: { not: user.id } }, { authorId: null }] },
		}),
	]);

	const canMoveForeign = can(member.role, "category", "delete", {
		hasGrant: true,
		isOwn: false,
	});

	return { total, foreign, canMoveForeign };
});

export const changeCategoryColor = command(
	v.object({
		id: v.string(),
		color: v.string(),
	}),
	async (data) => {
		await authorize("category", "update", { type: "category", id: data.id });

		const category = await prisma.category.update({
			where: { id: data.id },
			data: { color: data.color },
		});
		void notifyCategories(category.projectId);
		await getCategories(category.projectId).refresh();
		return category;
	},
);

export const deleteCategory = command(
	v.object({
		id: v.string(),

		mergeIntoId: v.optional(v.string()),

		exportId: v.optional(v.string()),
	}),
	async ({ id, mergeIntoId, exportId }) => {
		// 404 (instead of { reason: “NOT_FOUND” }), so that no one can scan for category IDs from other organizations
		const { user, member, target } = await authorize("category", "delete", {
			type: "category",
			id,
		});

		if (mergeIntoId === id) error(400, "Same category");
		if (mergeIntoId) await assertCategoriesInProject([mergeIntoId], target.projectId);

		const mayMoveForeignMarkers = can(member.role, "category", "delete", {
			hasGrant: true,
			isOwn: false,
		});

		let result;
		try {
			result = await prisma.$transaction(async (tx) => {
				const total = await tx.marker.count({ where: { categoryId: id } });

				if (total > 0) {
					if (!mayMoveForeignMarkers) {
						const foreign = await tx.marker.count({
							where: {
								categoryId: id,
								OR: [{ authorId: { not: user.id } }, { authorId: null }],
							},
						});
						if (foreign > 0) return { success: false, reason: "HAS_FOREIGN_MARKERS" } as const;
					}

					if (!mergeIntoId) return { success: false, reason: "CATEGORY_IN_USE" } as const;

					await tx.marker.updateMany({
						where: { categoryId: id },
						data: { categoryId: mergeIntoId },
					});
				}

				await tx.category.delete({ where: { id } });
				return { success: true } as const;
			});
		} catch (e) {
			// Race: zwischen count und delete ist ein neuer Marker dazugekommen
			if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
				return { success: false, reason: "CATEGORY_IN_USE" } as const;
			}
			throw e;
		}
		if (!result.success) return result;
		// A merge moves markers of every export in the project; clients reload them on this event too
		void notifyCategories(target.projectId!);

		// getCategoryUsage(id) der gelöschten Kategorie nicht refreshen: würde jetzt 404 werfen
		await Promise.all([
			getCategories(target.projectId!).refresh(),
			...(mergeIntoId ? [getCategoryUsage(mergeIntoId).refresh()] : []),
			...(exportId ? [getMarkers(exportId).refresh()] : []),
		]);

		return { success: true } as const;
	},
);

/**
 * `page.params.export` gibt es auf dem Server nicht zuverlässig. Wenn die Marker-Liste
 * den neuen Namen sofort zeigen soll, übergibt der Client die aktuelle `exportId` mit.
 */
export const renameCategory = command(
	v.object({
		id: v.string(),
		name: v.string(),
		exportId: v.optional(v.string()),
	}),
	async (data) => {
		await authorize("category", "update", { type: "category", id: data.id });
		const category = await prisma.category
			.update({
				where: { id: data.id },
				data: { name: data.name },
			})
			.catch(conflictOnDuplicate(data.name));
		void notifyCategories(category.projectId);
		await Promise.all([
			getCategories(category.projectId).refresh(),
			...(data.exportId ? [getMarkers(data.exportId).refresh()] : []),
		]);
		return category;
	},
);

function conflictOnDuplicate(name: string) {
	return (e: unknown): never => {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
			error(409, `Category "${name}" already exists`);
		}
		throw e;
	};
}
