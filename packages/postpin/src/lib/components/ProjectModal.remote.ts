import { prisma } from "#lib/server/database.ts";
import { getRequestEvent, command } from "$app/server";
import * as v from "valibot";

export const createProject = command(
	v.object({
		name: v.string(),
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
	v.object({
		id: v.string(),
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
	v.object({
		id: v.string(),
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
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
