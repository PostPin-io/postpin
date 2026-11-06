import { prisma } from "#lib/server/database.ts";
import { error } from "@sveltejs/kit";
import { authorize } from "#lib/server/org-access.ts";
import { command } from "$app/server";
import * as v from "valibot";
import { deleteMediaFolders, purgeExports } from "#lib/server/media.ts";

export const createTimeline = command(
	v.object({
		name: v.string(),
		projectId: v.string(),
	}),
	async (data) => {
		await authorize("timeline", "create", { type: "project", id: data.projectId });
		await prisma.timeline.create({
			data: {
				name: data.name,
				project: { connect: { id: data.projectId } },
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
		const { target } = await authorize("timeline", "delete", { type: "timeline", id: data.id });

		if (target.projectId !== data.projectId) error(404, "Not found");
		const mediaIds = await prisma.$transaction(async (tx) => {
			const ids = await purgeExports(tx, { timelineId: data.id });
			await tx.timeline.delete({ where: { id: data.id, projectId: data.projectId } });
			return ids;
		});
		await deleteMediaFolders(mediaIds, `deleteTimeline ${data.id}`);
	},
);
export const renameTimeline = command(
	v.object({
		id: v.string(),
		projectId: v.string(),
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
	}),
	async (data) => {
		const { target } = await authorize("timeline", "rename", { type: "timeline", id: data.id });
		if (target.projectId !== data.projectId) error(404, "Not found");

		await prisma.timeline.update({
			where: { id: data.id, projectId: data.projectId },
			data: { name: data.name },
		});
	},
);
