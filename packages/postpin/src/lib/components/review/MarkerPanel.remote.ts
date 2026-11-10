import { prisma } from "#lib/server/database.ts";
import { command, query } from "$app/server";
import { Prisma } from "@postpin-io/shared/db";
import { error } from "@sveltejs/kit";
import { ensureGuestCategory, isGuestCategory } from "#lib/server/share-links.ts";
import { readExport, requireMarkers } from "#lib/server/review-access.ts";
import { markersKey, scopeOf } from "./markerScope.ts";

import {
	accessChecker,
	accessibleExports,
	authorize,
	authorizeMarkers,
} from "#lib/server/org-access.ts";

import { can } from "#lib/roles.ts";

import * as v from "valibot";

const MAX_BULK = 500;

const authorSelect = { select: { id: true, name: true, image: true } } as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function assertCategoriesInProject(categoryIds: string[], projectId: string | null) {
	if (!projectId) error(404, "Not found");
	const unique = [...new Set(categoryIds)];
	const count = await prisma.category.count({ where: { id: { in: unique }, projectId } });
	if (count !== unique.length) error(404, "Not found");
	if (await prisma.project.count({ where: { guestCategoryId: { in: unique } } })) {
		error(400, "The guest category is reserved for share-link visitors");
	}
}

/**
 * Markers must sit on the export's timeline: startFrameIndex … startFrameIndex + durationFrameCount - 1.
 * Exports without a snapshot (yet) have no known range and are not checked.
 */
async function assertFramesInTimeline(exportId: string, frames: number[]) {
	const exp = await prisma.export.findUnique({
		where: { id: exportId },
		select: { timelineSnapshot: true },
	});
	const range = v.safeParse(timelineRange, exp?.timelineSnapshot);
	if (!range.success) return;
	const first = range.output.startFrameIndex;
	const last = first + Math.max(range.output.durationFrameCount, 1) - 1;
	if (frames.some((f) => f < first || f > last)) {
		error(400, `Frame outside the timeline (${first}–${last})`);
	}
}
const timelineRange = v.object({ startFrameIndex: v.number(), durationFrameCount: v.number() });
/** Set by the share page: the call is a share-link guest's (see readExport) */
const shareToken = v.optional(v.string());

/**
 * A guest's own marker on the linked export, else 404: someone else's marker
 * (another guest's or the team's) looks like it doesn't exist.
 */
async function guestMarker(id: string, token: string) {
	const marker = await prisma.marker.findUnique({
		where: { id },
		select: { exportId: true, guestId: true },
	});
	if (!marker) error(404, "Not found");
	const reader = await readExport(marker.exportId, token);
	if (reader.kind !== "guest" || marker.guestId !== reader.guest.id) error(404, "Not found");
	requireMarkers(reader);
	return { reader, exportId: marker.exportId };
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

		const { guestCategoryId } = await prisma.project.findUniqueOrThrow({
			where: { id: target.projectId! },
			select: { guestCategoryId: true },
		});

		// 5. Anlegen (+ bei "cut" Quelle löschen) in EINER Transaktion
		const minFrame = Math.min(...source.map((m) => m.frame));
		await assertFramesInTimeline(
			data.targetExportId,
			source.map((m) => data.anchorFrame + (m.frame - minFrame)),
		);
		await prisma.$transaction(async (tx) => {
			for (const m of source) {
				await tx.marker.create({
					data: {
						name: m.name,
						description: m.description,
						frame: data.anchorFrame + (m.frame - minFrame),
						exportId: data.targetExportId,
						// a copy is a team marker: it may not sit in the guest category
						categoryId:
							data.mode === "copy" && m.categoryId === guestCategoryId
								? data.fallbackCategoryId
								: categoryOf(m),
						// cut = verschieben → Autor bleibt (auch ein Gast); copy = neuer Marker → wer einfügt
						authorId: data.mode === "cut" ? m.authorId : user.id,
						guestId: data.mode === "cut" ? m.guestId : null,

						// nleId bewusst NICHT kopieren: unique pro Export, gehört zum NLE-Original
						responses: {
							create: m.responses.map((r) => ({
								content: r.content,
								authorId: r.authorId,
								createdAt: r.createdAt,
							})),
						},
					},
				});
			}
			if (data.mode === "cut") {
				await tx.marker.deleteMany({
					where: { id: { in: source.map((m) => m.id) }, exportId: data.sourceExportId },
				});
			}
		});

		// 6. Refresh
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
		exportId: v.string(),
		/** Members only; guests always get the project's guest category */
		categoryId: v.optional(v.string()),
		shareToken,
	}),
	async (data) => {
		// ─── Guest: always the guest category, the guest as author ───
		if (data.shareToken) {
			const reader = await readExport(data.exportId, data.shareToken);
			if (reader.kind !== "guest") error(404, "Not found");
			requireMarkers(reader);
			await assertFramesInTimeline(data.exportId, [data.frame]);

			const marker = await prisma.$transaction(async (tx) =>
				tx.marker.create({
					data: {
						name: data.name,
						description: data.description,
						frame: data.frame,
						exportId: data.exportId,
						categoryId: await ensureGuestCategory(tx, reader.link.export.timeline.projectId),
						guestId: reader.guest.id,
					},
				}),
			);
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
		await assertFramesInTimeline(data.exportId, [data.frame]);

		const marker = await prisma.marker.create({
			data: {
				name: data.name,
				description: data.description,
				frame: data.frame,
				exportId: data.exportId,
				categoryId: data.categoryId,
				authorId: user.id,
			},
		});
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
		/** Ignored for guests: their markers stay in the guest category */
		categoryId: v.string(),
		shareToken,
	}),
	async (data) => {
		// ─── Guest: only own markers, category stays ───
		if (data.shareToken) {
			const { exportId } = await guestMarker(data.id, data.shareToken);
			await assertFramesInTimeline(exportId, [data.frame]);
			const marker = await prisma.marker.update({
				where: { id: data.id },
				data: { name: data.name, description: data.description, frame: data.frame },
			});
			await getMarkers(markersKey(exportId, data.shareToken)).refresh();
			return marker;
		}

		// ─── Member: as before ───
		const { target } = await authorize("marker", "update", { type: "marker", id: data.id });
		await assertCategoriesInProject([data.categoryId], target.projectId);
		const { exportId } = await prisma.marker.findUniqueOrThrow({
			where: { id: data.id },
			select: { exportId: true },
		});
		await assertFramesInTimeline(exportId, [data.frame]);

		const marker = await prisma.marker.update({
			where: { id: data.id },
			data: {
				name: data.name,
				description: data.description,
				frame: data.frame,
				categoryId: data.categoryId,
			},
		});
		await getMarkers(marker.exportId).refresh();
		return marker;
	},
);

export const deleteMarker = command(
	v.union([v.string(), v.object({ id: v.string(), shareToken: v.string() })]),
	async (arg) => {
		// ─── Guest ───
		if (typeof arg !== "string") {
			const { exportId } = await guestMarker(arg.id, arg.shareToken);
			const marker = await prisma.marker.delete({ where: { id: arg.id } });
			await getMarkers(markersKey(exportId, arg.shareToken)).refresh();
			return marker;
		}

		// ─── Member: as before ───
		const id = arg;
		await authorize("marker", "delete", { type: "marker", id });

		const marker = await prisma.marker.delete({ where: { id } });

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
			const result = await prisma.marker.deleteMany({
				where: { id: { in: data.ids }, exportId: data.exportId, guestId: reader.guest.id },
			});
			await getMarkers(markersKey(data.exportId, data.shareToken)).refresh();
			return result;
		}

		// ─── Member: as before ───
		const { markers } = await authorizeMarkers("delete", data.exportId, data.ids);

		const result = await prisma.marker.deleteMany({
			where: { id: { in: markers.map((m) => m.id) }, exportId: data.exportId },
		});

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
				// Only delete if the user created it themselves
				const res = await prisma.category.deleteMany({
					where: { id: categoryId, createdById: user.id },
				});
				if (res.count > 0) deletedCategoryIds.push(categoryId);
			} catch (e) {
				// In the meantime, a marker has been added: the category simply remains
				if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003")) throw e;
			}
		}

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

		return await prisma.marker.update({
			where: { id: data.id },
			data: { description: data.description },
		});
	},
);

// ─── Responses ──────────────────────────────────────────────────────────────

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
	const [categories, project] = await Promise.all([
		prisma.category.findMany({ where: { projectId }, orderBy: { name: "asc" } }),
		prisma.project.findUniqueOrThrow({
			where: { id: projectId },
			select: { guestCategoryId: true },
		}),
	]);

	return categories.map((c) => {
		const t = { projectId, ownerId: c.createdById, loose: true };
		const isGuest = c.id === project.guestCategoryId;
		return {
			...c,
			isGuest,
			canUpdate: allowed("category", "update", t),
			canDelete: !isGuest && allowed("category", "delete", t),
		};
	});
});

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
		if (await isGuestCategory(id)) return { success: false, reason: "GUEST_CATEGORY" } as const;

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
