import { error } from "@sveltejs/kit";
import { query } from "$app/server";
import * as v from "valibot";
import { prisma } from "#lib/server/database.ts";
import { accessChecker, authorize } from "#lib/server/org-access.ts";

export type BreadcrumbNames = {
	project: { id: string; name: string; canShare: boolean };
	timeline?: { id: string; name: string; canShare: boolean };
	export?: { id: string; name: string; canShare: boolean };
};

export const getBreadcrumbNames = query(
	v.object({
		projectId: v.string(),
		timelineId: v.optional(v.string()),
		exportId: v.optional(v.string()),
	}),
	async ({ projectId, timelineId, exportId }): Promise<BreadcrumbNames> => {
		if (exportId && timelineId) {
			const { member } = await authorize("export", "read", { type: "export", id: exportId });
			const allowed = await accessChecker(member);
			const exp = await prisma.export.findFirst({/* unverändert */});
			if (!exp) error(404, "Not found");
			const project = exp.timeline.project;
			const timeline = exp.timeline;
			return {
				project: {
					...project,
					canShare: allowed("grant", "create", { projectId: project.id }),
				},
				timeline: {
					id: timeline.id,
					name: timeline.name,
					canShare: allowed("grant", "create", { projectId: project.id, timelineId: timeline.id }),
				},
				export: {
					id: exp.id,
					name: exp.name,
					canShare: allowed("shareLink", "create", {
						projectId: project.id,
						timelineId: timeline.id,
					}),
				},
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
