import { error } from "@sveltejs/kit";
import { query } from "$app/server";
import * as v from "valibot";
import { prisma } from "#lib/server/database.ts";
import {
	accessChecker,
	accessibleExports,
	accessibleProjects,
	accessibleTimelines,
	authorize,
} from "#lib/server/org-access.ts";

type Crumb = { id: string; name: string; canShare: boolean };

export type BreadcrumbNames = {
	project: Crumb;
	timeline?: Crumb;
	export?: Crumb;
};

// Only the deepest level is authorized: reading it implies the parents may be shown
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
			const { project, ...timeline } = exp.timeline;
			const scope = { projectId: project.id, timelineId: timeline.id };
			return {
				project: { ...project, canShare: allowed("grant", "create", { projectId: project.id }) },
				timeline: { ...timeline, canShare: allowed("grant", "create", scope) },
				export: { id: exp.id, name: exp.name, canShare: allowed("shareLink", "create", scope) },
			};
		}

		if (timelineId) {
			const { member } = await authorize("timeline", "read", { type: "timeline", id: timelineId });
			const allowed = await accessChecker(member);
			const found = await prisma.timeline.findFirst({
				where: { id: timelineId, projectId },
				select: { id: true, name: true, project: { select: { id: true, name: true } } },
			});
			if (!found) error(404, "Not found");
			const { project, ...timeline } = found;
			return {
				project: { ...project, canShare: allowed("grant", "create", { projectId: project.id }) },
				timeline: {
					...timeline,
					canShare: allowed("grant", "create", {
						projectId: project.id,
						timelineId: timeline.id,
					}),
				},
			};
		}

		const { member } = await authorize("project", "read", { type: "project", id: projectId });
		const allowed = await accessChecker(member);
		const project = await prisma.project.findUnique({
			where: { id: projectId },
			select: { id: true, name: true },
		});
		if (!project) error(404, "Not found");
		return {
			project: { ...project, canShare: allowed("grant", "create", { projectId: project.id }) },
		};
	},
);
// ─── Siblings for the dropdown behind each breadcrumb chevron ────────────────

const nameOnly = { id: true, name: true } as const;

/** All projects of the organization the given project belongs to */
export const getProjectSiblings = query(v.string(), async (projectId) => {
	const { member } = await authorize("project", "read", { type: "project", id: projectId });
	return prisma.project.findMany({
		where: accessibleProjects(member),
		select: nameOnly,
		orderBy: { updatedAt: "desc" },
	});
});

/** All timelines of a project */
export const getTimelineSiblings = query(v.string(), async (projectId) => {
	const { member } = await authorize("project", "read", { type: "project", id: projectId });
	return prisma.timeline.findMany({
		where: { projectId, ...accessibleTimelines(member) },
		select: nameOnly,
		orderBy: { updatedAt: "desc" },
	});
});

/** All exports of a timeline */
export const getExportSiblings = query(v.string(), async (timelineId) => {
	const { member } = await authorize("timeline", "read", { type: "timeline", id: timelineId });
	return prisma.export.findMany({
		where: { timelineId, ...accessibleExports(member) },
		select: nameOnly,
		orderBy: { createdAt: "desc" },
	});
});
