import { error } from "@sveltejs/kit";
import { query } from "$app/server";
import * as v from "valibot";
import { prisma } from "#lib/server/database.ts";
import { authorize } from "#lib/server/org-access.ts";

export type BreadcrumbNames = {
	project: { id: string; name: string };
	timeline?: { id: string; name: string };
	export?: { id: string; name: string };
};

export const getBreadcrumbNames = query(
	v.object({
		projectId: v.string(),
		timelineId: v.optional(v.string()),
		exportId: v.optional(v.string()),
	}),
	async ({ projectId, timelineId, exportId }): Promise<BreadcrumbNames> => {
		if (exportId && timelineId) {
			await authorize("export", "read", { type: "export", id: exportId });
			const exp = await prisma.export.findFirst({
				where: { id: exportId, timelineId, timeline: { projectId } },
				select: {
					id: true,
					name: true,
					timeline: {
						select: { id: true, name: true, project: { select: { id: true, name: true } } },
					},
				},
			});
			if (!exp) error(404, "Not found");
			return {
				project: exp.timeline.project,
				timeline: { id: exp.timeline.id, name: exp.timeline.name },
				export: { id: exp.id, name: exp.name },
			};
		}

		if (timelineId) {
			await authorize("timeline", "read", { type: "timeline", id: timelineId });
			const timeline = await prisma.timeline.findFirst({
				where: { id: timelineId, projectId },
				select: { id: true, name: true, project: { select: { id: true, name: true } } },
			});
			if (!timeline) error(404, "Not found");
			return { project: timeline.project, timeline: { id: timeline.id, name: timeline.name } };
		}

		await authorize("project", "read", { type: "project", id: projectId });
		const project = await prisma.project.findUnique({
			where: { id: projectId },
			select: { id: true, name: true },
		});
		if (!project) error(404, "Not found");
		return { project };
	},
);
