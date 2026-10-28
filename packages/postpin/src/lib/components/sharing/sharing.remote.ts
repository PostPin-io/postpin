import { error } from "@sveltejs/kit";
import { getRequestEvent, query } from "$app/server";
import { prisma } from "#lib/server/database.ts";
import * as v from "valibot";

// The most specific id given decides what is being shared: export, then timeline, then project
export const getSharingTarget = query(
	v.object({
		projectId: v.string(),
		timelineId: v.optional(v.string()),
		exportId: v.optional(v.string()),
	}),
	async ({ projectId, timelineId, exportId }) => {
		const { user } = getRequestEvent().locals;
		if (!user) error(401, "Not signed in");

		const projectWhere = {
			id: projectId,
			organization: { members: { some: { userId: user.id } } },
		};

		if (exportId && timelineId) {
			const exp = await prisma.export.findFirst({
				where: { id: exportId, timelineId, timeline: { projectId, project: projectWhere } },
				select: { id: true, name: true },
			});
			if (!exp) error(404, "Export not found");
			return { type: "export" as const, ...exp };
		}

		if (timelineId) {
			const timeline = await prisma.timeline.findFirst({
				where: { id: timelineId, projectId, project: projectWhere },
				select: { id: true, name: true },
			});
			if (!timeline) error(404, "Timeline not found");
			return { type: "timeline" as const, ...timeline };
		}

		const project = await prisma.project.findFirst({
			where: projectWhere,
			select: { id: true, name: true },
		});
		if (!project) error(404, "Project not found");
		return { type: "project" as const, ...project };
	},
);
