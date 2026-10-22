import { prisma } from "#lib/server/database.ts";
import { s3Client } from "#lib/server/storage.ts";
import { getRequestEvent, command } from "$app/server";
import * as v from "valibot";
import { S3_BUCKET } from "$app/env/private";
import { deleteMediaFiles } from "#lib/server/media.ts";

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

		const media = await prisma.media.findMany({
			where: {
				export: {
					timeline: {
						projectId: data.id,
					},
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
