import { prisma } from "#lib/server/database.ts";
import { getRequestEvent, command } from "$app/server";
import * as Valibot from "valibot";

export const createProject = command(
	Valibot.object({
		name: Valibot.string(),
	}),
	async (data) => {
		const event = getRequestEvent();

		await prisma.project.create({
			data: {
				name: data.name,
				creatorId: event.locals.user!.id,
				organizationId: event.locals.session!.activeOrganizationId!,
			},
		});
	},
);
export const deleteProject = command(
	Valibot.object({
		id: Valibot.string(),
	}),
	async (data) => {
		const event = getRequestEvent();
		const currentOrganizationId = event.locals.session!.activeOrganizationId!;

		await prisma.project.delete({
			where: {
				id: data.id,
				organizationId: currentOrganizationId,
			},
		});
	},
);

export const renameProject = command(
	Valibot.object({
		id: Valibot.string(),
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

		await prisma.project.update({
			where: {
				id: data.id,
				organizationId: currentOrganizationId,
			},
			data: {
				name: data.name,
			},
		});
	},
);
