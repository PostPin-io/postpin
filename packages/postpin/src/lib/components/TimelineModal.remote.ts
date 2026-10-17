import { prisma } from "#lib/server/database.ts";
import { getRequestEvent, command } from "$app/server";
import * as Valibot from "valibot";

export const createTimeline = command(
	Valibot.object({
		name: Valibot.string(),
		projectId: Valibot.string(),
	}),
	async (data) => {
		const event = getRequestEvent();

		await prisma.timeline.create({
			data: {
				name: data.name,
				projectId: data.projectId,
			},
		});
	},
);

export const deleteTimeline = command(
	Valibot.object({
		id: Valibot.string(),
		projectId: Valibot.string(),
	}),
	async (data) => {
		const event = getRequestEvent();
		const currentProjectId = data.projectId;

		await prisma.timeline.delete({
			where: {
				id: data.id,
				projectId: data.projectId,
			},
		});
	},
);
export const renameTimeline = command(
	Valibot.object({
		id: Valibot.string(),
		projectId: Valibot.string(),
		name: Valibot.pipe(
			Valibot.string(),
			Valibot.trim(),
			Valibot.minLength(1),
			Valibot.maxLength(100),
		),
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
