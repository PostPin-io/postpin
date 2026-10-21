import { prisma } from "#lib/server/database.ts";
import { getRequestEvent, command, query } from "$app/server";
import { page } from "$app/state";
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
		where: {
			id: id,
		},
	});
	await getMarkers(marker.exportId).refresh();
	return marker;
});

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

		return category;
	},
);
export const deleteCategory = command(v.string(), async (id) => {
	const event = getRequestEvent();

	const category = await prisma.category.delete({
		where: {
			id: id,
		},
	});
	await getCategories(category.projectId).refresh();
	return category;
});
