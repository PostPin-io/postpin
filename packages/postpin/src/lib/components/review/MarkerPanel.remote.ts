import { prisma } from "#lib/server/database.ts";
import { command, query } from "$app/server";
import { Prisma } from "@postpin-io/shared/db";
import { error } from "@sveltejs/kit";
import { accessibleExports, authorize, authorizeMarkers } from "#lib/server/org-access.ts";
import { can } from "#lib/roles.ts";

import * as v from "valibot";

const MAX_BULK = 500;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Alle Kategorien müssen existieren und im angegebenen Projekt liegen, sonst 404. */
async function assertCategoriesInProject(categoryIds: string[], projectId: string | null) {
	if (!projectId) error(404, "Not found");
	const unique = [...new Set(categoryIds)];
	const count = await prisma.category.count({ where: { id: { in: unique }, projectId } });
	if (count !== unique.length) error(404, "Not found");
}

// ─── Marker: Queries ────────────────────────────────────────────────────────

export const getMarkers = query(v.string(), async (exportId: string) => {
	await authorize("export", "read", { type: "export", id: exportId });

	return await prisma.marker.findMany({
		where: { exportId },
		orderBy: { frame: "desc" },
		include: {
			author: true,
			category: true,
			responses: {
				select: { content: true, authorId: true, createdAt: true },
				orderBy: { createdAt: "asc" },
			},
		},
	});
});

export const getMarkersbyCategory = query(v.string(), async (categoryId: string) => {
	const { member } = await authorize("category", "read", { type: "category", id: categoryId });

	// Kategorien hängen am Projekt: nur Marker aus Exports zeigen, auf die der User Zugriff hat
	return await prisma.marker.findMany({
		where: { categoryId, export: accessibleExports(member) },
		orderBy: { frame: "desc" },
		include: {
			author: true,
			category: true,
		},
	});
});

// ─── Marker: Commands ───────────────────────────────────────────────────────

export const createMarker = command(
	v.object({
		name: v.string(),
		description: v.string(),
		frame: v.number(),
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

export const createMarkers = command(
	v.object({
		exportId: v.string(),
		markers: v.pipe(
			v.array(
				v.object({
					name: v.string(),
					description: v.string(),
					frame: v.pipe(v.number(), v.integer(), v.minValue(0)),
					categoryId: v.string(),
					responses: v.optional(
						v.array(
							v.object({
								content: v.string(),
								authorId: v.string(),
								createdAt: v.string(),
							}),
						),
					),
				}),
			),
			v.minLength(1),
			v.maxLength(MAX_BULK),
		),
	}),
	async (data) => {
		const { user, target } = await authorize("marker", "create", {
			type: "export",
			id: data.exportId,
		});

		await assertCategoriesInProject(
			data.markers.map((m) => m.categoryId),
			target.projectId,
		);

		// authorId der Responses kommt vom Client (Import). Verhindern, dass man
		// Antworten im Namen fremder Personen anlegt: nur Mitglieder dieser Org erlauben.
		const responseAuthorIds = [
			...new Set(data.markers.flatMap((m) => (m.responses ?? []).map((r) => r.authorId))),
		];
		if (responseAuthorIds.length > 0) {
			const known = await prisma.member.count({
				where: { organizationId: target.organizationId, userId: { in: responseAuthorIds } },
			});
			if (known !== responseAuthorIds.length) error(400, "Unknown response author");
		}

		// createMany cannot create nested responses, so create each marker individually
		const created = await prisma.$transaction(
			data.markers.map((marker) =>
				prisma.marker.create({
					data: {
						name: marker.name,
						description: marker.description,
						frame: marker.frame,
						categoryId: marker.categoryId,
						exportId: data.exportId,
						authorId: user.id,
						responses: {
							create: (marker.responses ?? []).map((response) => ({
								content: response.content,
								authorId: response.authorId,
								createdAt: new Date(response.createdAt),
							})),
						},
					},
					select: { id: true },
				}),
			),
		);
		await getMarkers(data.exportId).refresh();
		return { count: created.length };
	},
);

/**
 * `exportId` ist bewusst nicht mehr Teil der Eingabe: ein Marker darf nicht
 * über diesen Command in einen anderen Export verschoben werden.
 */
export const updateMarker = command(
	v.object({
		id: v.string(),
		name: v.string(),
		description: v.string(),
		frame: v.number(),
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
		isCategoryUsed(marker.categoryId).refresh(),
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
			...[...categoryIds].map((categoryId) => isCategoryUsed(categoryId).refresh()),
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

		const { moved, deletedCategoryIds } = await prisma.$transaction(async (tx) => {
			const { count } = await tx.marker.updateMany({
				where: { id: { in: markerIds }, exportId: data.exportId },
				data: { categoryId: data.targetCategoryId },
			});

			const deleted: string[] = [];
			for (const categoryId of sourceCategoryIds) {
				// "Leer" = keine Marker im ganzen Projekt (Kategorien hängen am Projekt)
				const remaining = await tx.marker.count({ where: { categoryId } });
				if (remaining > 0) continue;

				// Nur löschen, wenn der User sie selbst angelegt hat
				const res = await tx.category.deleteMany({
					where: { id: categoryId, createdById: user.id },
				});
				if (res.count > 0) deleted.push(categoryId);
			}
			return { moved: count, deletedCategoryIds: deleted };
		});

		// Gelöschte Kategorien nicht mehr refreshen: isCategoryUsed würde dort 404 werfen
		const stillExisting = sourceCategoryIds.filter((id) => !deletedCategoryIds.includes(id));

		await Promise.all([
			getMarkers(data.exportId).refresh(),
			isCategoryUsed(data.targetCategoryId).refresh(),
			...stillExisting.map((id) => isCategoryUsed(id).refresh()),
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
		include: { author: true },
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
	// Project-read ist auch mit reinem Timeline-Grant erlaubt (loose in authorize)
	await authorize("project", "read", { type: "project", id: projectId });

	return await prisma.category.findMany({
		where: { projectId },
		orderBy: { name: "asc" },
	});
});

export const createCategory = command(
	v.object({
		name: v.string(),
		color: v.string(),
		projectId: v.string(),
	}),
	async (data) => {
		// Bei `create` ist das Target der Parent (das Projekt)
		const { user } = await authorize("category", "create", {
			type: "project",
			id: data.projectId,
		});

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
	},
);

export const isCategoryUsed = query(v.string(), async (categoryId: string) => {
	await authorize("category", "read", { type: "category", id: categoryId });

	// Bewusst projektweit (auch Exports ohne Zugriff): es geht nur um "kann gelöscht werden?"
	const count = await prisma.marker.count({ where: { categoryId } });
	return count > 0;
});

export const mergeCategories = command(
	v.object({
		sourceCategoryId: v.string(),
		targetCategoryId: v.string(),
	}),
	async (data) => {
		if (data.sourceCategoryId === data.targetCategoryId) error(400, "Same category");

		const { member, target } = await authorize("category", "update", {
			type: "category",
			id: data.sourceCategoryId,
		});
		// Reviewer dürfen ihre eigenen Kategorien ändern (update: own), ein Merge verschiebt
		// aber auch fremde Marker. Deshalb nur, wenn die Rolle fremde Kategorien ändern darf.
		if (!can(member.role, "category", "update", { hasGrant: true, isOwn: false })) {
			error(403, "Not allowed");
		}
		await assertCategoriesInProject([data.targetCategoryId], target.projectId);

		const markers = await prisma.marker.updateMany({
			where: { categoryId: data.sourceCategoryId },
			data: { categoryId: data.targetCategoryId },
		});

		await Promise.all([
			isCategoryUsed(data.sourceCategoryId).refresh(),
			isCategoryUsed(data.targetCategoryId).refresh(),
		]);

		return markers;
	},
);

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

export const deleteCategory = command(v.string(), async (id) => {
	// 404 (statt { reason: "NOT_FOUND" }), damit niemand Kategorie-IDs fremder Orgs abtasten kann
	const { target } = await authorize("category", "delete", { type: "category", id });

	try {
		await prisma.category.delete({ where: { id } });
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
			return {
				success: false,
				reason: "CATEGORY_IN_USE" as const,
			};
		}

		throw e;
	}

	await getCategories(target.projectId!).refresh();

	return { success: true as const };
});

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
