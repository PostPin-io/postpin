import { prisma } from "#lib/server/database.ts";
import { command, query } from "$app/server";
import { Prisma } from "@postpin-io/shared/db";
import { error } from "@sveltejs/kit";
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
export const getMarkers = query(v.string(), async (exportId: string) => {
	const { member, target } = await authorize("export", "read", { type: "export", id: exportId });
	const allowed = await accessChecker(member);
	const markers = await prisma.marker.findMany({
		where: { exportId },
		orderBy: { frame: "desc" },
		include: {
			author: authorSelect,
			category: true,
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
});

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

		// 5. Anlegen (+ bei "cut" Quelle löschen) in EINER Transaktion
		const minFrame = Math.min(...source.map((m) => m.frame));
		await prisma.$transaction(async (tx) => {
			for (const m of source) {
				await tx.marker.create({
					data: {
						name: m.name,
						description: m.description,
						frame: data.anchorFrame + (m.frame - minFrame),
						exportId: data.targetExportId,
						categoryId: categoryOf(m),
						// cut = verschieben → Autor bleibt; copy = neuer Marker → wer einfügt
						authorId: data.mode === "cut" ? m.authorId : user.id,
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
		categoryId: v.string(),
	}),
	async (data) => {
		// Bei `create` ist das Target der Parent (der Export)
		const { user, target } = await authorize("marker", "create", {
			type: "export",
			id: data.exportId,
		});
		await assertCategoriesInProject([data.categoryId], target.projectId);

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
		categoryId: v.string(),
	}),
	async (data) => {
		const { target } = await authorize("marker", "update", { type: "marker", id: data.id });
		await assertCategoriesInProject([data.categoryId], target.projectId);

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

export const deleteMarker = command(v.string(), async (id) => {
	await authorize("marker", "delete", { type: "marker", id });

	const marker = await prisma.marker.delete({ where: { id } });

	await Promise.all([
		getMarkers(marker.exportId).refresh(),
		getCategoryUsage(marker.categoryId).refresh(),
	]);

	return marker;
});

export const deleteMarkers = command(
	v.object({
		exportId: v.string(),
		ids: v.pipe(v.array(v.string()), v.maxLength(MAX_BULK)),
	}),
	async (data) => {
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
	const categories = await prisma.category.findMany({
		where: { projectId },
		orderBy: { name: "asc" },
	});

	return categories.map((c) => {
		const t = { projectId, ownerId: c.createdById, loose: true };
		return {
			...c,
			canUpdate: allowed("category", "update", t),
			canDelete: allowed("category", "delete", t),
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

		try {
			const category = await prisma.category.create({
				data: {
					name: data.name,
					color: data.color,
					projectId: data.projectId,
					createdById: user.id,
				},
			});
			await getCategories(data.projectId).refresh();
			return category;
		} catch (e) {
			if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
				error(409, `Category "${data.name}" already exists`);
			}
			throw e;
		}
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

		const category = await prisma.category.update({
			where: { id: data.id },
			data: { name: data.name },
		});

		await Promise.all([
			getCategories(category.projectId).refresh(),
			...(data.exportId ? [getMarkers(data.exportId).refresh()] : []),
		]);
		return category;
	},
);
