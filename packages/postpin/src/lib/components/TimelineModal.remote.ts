import { prisma } from "#lib/server/database.ts";
import { deleteMediaFiles } from "#lib/server/media.ts";
import { getRequestEvent, command } from "$app/server";
import * as v from "valibot";

export const createTimeline = command(
	v.object({
		name: v.string(),
		projectId: v.string(),
	}),
	async (data) => {
		const event = getRequestEvent();
		const currentOrganizationId = event.locals.session?.activeOrganizationId;
		if (!currentOrganizationId) throw new Error("No active organization");
		await prisma.timeline.create({
			data: {
				name: data.name,
				project: {
					connect: {
						id: data.projectId,
						organizationId: currentOrganizationId,
					},
				},
			},
		});
	},
);

export const deleteTimeline = command(
	v.object({
		id: v.string(),
		projectId: v.string(),
	}),
	async (data) => {
		const event = getRequestEvent();
		const currentOrganizationId = event.locals.session?.activeOrganizationId;
		if (!currentOrganizationId) throw new Error("No active organization");

		const media = await prisma.media.findMany({
			where: {
				export: {
					timelineId: data.id,
				},
			},
		});
		await Promise.all(media.map((m) => deleteMediaFiles(m.id)));

		await prisma.project.delete({
			where: {
				id: data.id,
				organizationId: currentOrganizationId,
			},
		});

		await prisma.timeline.delete({
			where: {
				id: data.id,
				projectId: data.projectId,
				project: { organizationId: currentOrganizationId },
			},
		});
	},
);
export const renameTimeline = command(
	v.object({
		id: v.string(),
		projectId: v.string(),
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
	}),
	async (data) => {
		const event = getRequestEvent();
		const currentOrganizationId = event.locals.session!.activeOrganizationId!;

		await prisma.timeline.update({
			where: {
				id: data.id,
				projectId: data.projectId,
				project: { organizationId: currentOrganizationId },
			},
			data: { name: data.name },
		});
	},
);
