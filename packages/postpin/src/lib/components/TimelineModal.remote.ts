import { prisma } from "#lib/server/database.ts";
import { deleteMediaFiles } from "#lib/server/media.ts";
import { error } from "@sveltejs/kit";
import { authorize } from "#lib/server/org-access.ts";
import { command } from "$app/server";
import * as v from "valibot";

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

		const media = await prisma.media.findMany({
			where: {
				export: {
					timelineId: data.id,
				},
			},
		});
		await Promise.all(media.map((m) => deleteMediaFiles(m.id)));

		await prisma.timeline.delete({ where: { id: data.id, projectId: data.projectId } });
	},
);
export const renameTimeline = command(
	v.object({
		id: v.string(),
		projectId: v.string(),
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
	}),
	async (data) => {
		await authorize("timeline", "rename", { type: "timeline", id: data.id });

		await prisma.timeline.update({
			where: { id: data.id, projectId: data.projectId },
			data: { name: data.name },
		});
	},
);
