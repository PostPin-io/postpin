import { prisma } from "#lib/server/database.ts";
import { getRequestEvent, command, query } from "$app/server";
import { page } from "$app/state";
import { Prisma } from "@postpin-io/shared/db";

import * as v from "valibot";

export const getMarkers = query(v.string(), async (exportId: string) => {
	const event = getRequestEvent();

	// Example query using Prisma
	const markers = await prisma.marker.findMany({
		where: {
			exportId: exportId,
		},
		orderBy: { frame: "desc" },
		include: {
			author: true,
			category: true,
		},
	});

	return markers;
});
export const getMarkersbyCategory = query(v.string(), async (categoryId: string) => {
	const event = getRequestEvent();

	const markers = await prisma.marker.findMany({
		where: {
			categoryId: categoryId,
		},
		orderBy: { frame: "desc" },
		include: {
			author: true,
			category: true,
		},
	});

	return markers;
});

export const createMarker = command(
	v.object({
		name: v.string(),
		description: v.string(),
		frame: v.number(),
		exportId: v.string(),
		categoryId: v.string(),
	}),
	async (data) => {
		const event = getRequestEvent();
		const authorId = event.locals.user!.id;

		const marker = await prisma.marker.create({
			data: {
				name: data.name,
				description: data.description,
				frame: data.frame,
				exportId: data.exportId,
				categoryId: data.categoryId,
				authorId: authorId,
			},
		});
		await getMarkers(data.exportId).refresh();
		return marker;
	},
);

export const createMarkers = command(
	v.object({
		exportId: v.string(),
		markers: v.array(
			v.object({
				name: v.string(),
				description: v.string(),
				frame: v.pipe(v.number(), v.integer(), v.minValue(0)),
				categoryId: v.string(),
			}),
		),
	}),
	async (data) => {
		const event = getRequestEvent();
		const authorId = event.locals.user!.id;

		const result = await prisma.marker.createMany({
			data: data.markers.map((marker) => ({
				name: marker.name,
				description: marker.description,
				frame: marker.frame,
				categoryId: marker.categoryId,
				exportId: data.exportId,
				authorId,
			})),
		});
		await getMarkers(data.exportId).refresh();
		return result;
	},
);

export const updateMarker = command(
	v.object({
		id: v.string(),
		name: v.string(),
		description: v.string(),
		frame: v.number(),
		exportId: v.string(),
		categoryId: v.string(),
	}),
	async (data) => {
		const event = getRequestEvent();

		const marker = await prisma.marker.update({
			where: {
				id: data.id,
			},
			data: {
				name: data.name,
				description: data.description,
				frame: data.frame,
				exportId: data.exportId,
				categoryId: data.categoryId,
			},
		});
		await getMarkers(data.exportId).refresh();
		return marker;
	},
);

export const deleteMarker = command(v.string(), async (id) => {
	const event = getRequestEvent();

	const marker = await prisma.marker.delete({
		where: { id },
	});

	await Promise.all([
		getMarkers(marker.exportId).refresh(),
		isCategoryUsed(marker.categoryId).refresh(),
	]);

	return marker;
});

export const deleteMarkers = command(
	v.object({ exportId: v.string(), ids: v.array(v.string()) }),
	async (data) => {
		const markers = await prisma.marker.findMany({
			where: { id: { in: data.ids }, exportId: data.exportId },
			select: { id: true, categoryId: true },
		});

		const result = await prisma.marker.deleteMany({
			where: { id: { in: markers.map((marker) => marker.id) } },
		});

		const categoryIds = new Set(markers.map((marker) => marker.categoryId));
		await Promise.all([
			getMarkers(data.exportId).refresh(),
			...[...categoryIds].map((categoryId) => isCategoryUsed(categoryId).refresh()),
		]);

		return result;
	},
);

export const changeDescription = command(
	v.object({
		id: v.string(),
		description: v.string(),
	}),
	async (data) => {
		const event = getRequestEvent();

		const marker = await prisma.marker.update({
			where: {
				id: data.id,
			},
			data: {
				description: data.description,
			},
		});

		return marker;
	},
);

export const getCategories = query(v.string(), async (projectId: string) => {
	const event = getRequestEvent();

	const categories = await prisma.category.findMany({
		where: {
			projectId: projectId,
		},
		orderBy: { name: "asc" },
	});

	return categories;
});

export const createCategory = command(
	v.object({
		name: v.string(),
		color: v.string(),
		projectId: v.string(),
	}),
	async (data) => {
		const event = getRequestEvent();

		const category = await prisma.category.create({
			data: {
				name: data.name,
				color: data.color,
				projectId: data.projectId,
			},
		});
		await getCategories(data.projectId).refresh();
		return category;
	},
);

export const isCategoryUsed = query(v.string(), async (categoryId: string) => {
	const event = getRequestEvent();

	const count = await prisma.marker.count({
		where: {
			categoryId: categoryId,
		},
	});

	return count > 0;
});
export const mergeCategories = command(
	v.object({
		sourceCategoryId: v.string(),
		targetCategoryId: v.string(),
	}),
	async (data) => {
		const event = getRequestEvent();

		const markers = await prisma.marker.updateMany({
			where: {
				categoryId: data.sourceCategoryId,
			},
			data: {
				categoryId: data.targetCategoryId,
			},
		});

		// Refresh isCategoryUsed for both categories so the client cache invalidates
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
		const event = getRequestEvent();

		const category = await prisma.category.update({
			where: {
				id: data.id,
			},
			data: {
				color: data.color,
			},
		});
		await getCategories(category.projectId).refresh();
		return category;
	},
);

export const deleteCategory = command(v.string(), async (id) => {
	const category = await prisma.category.findUnique({
		where: { id },
	});

	if (!category) {
		return { success: false, reason: "NOT_FOUND" as const };
	}

	try {
		await prisma.category.delete({
			where: { id },
		});
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
			return {
				success: false,
				reason: "CATEGORY_IN_USE" as const,
			};
		}

		throw error;
	}

	await getCategories(category.projectId).refresh();

	return { success: true as const };
});

export const renameCategory = command(
	v.object({
		id: v.string(),
		name: v.string(),
	}),
	async (data) => {
		const event = getRequestEvent();

		const category = await prisma.category.update({
			where: {
				id: data.id,
			},
			data: {
				name: data.name,
			},
		});
		await getMarkers(page.params.export ?? "").refresh();
		await getCategories(category.projectId).refresh();
		return category;
	},
);
