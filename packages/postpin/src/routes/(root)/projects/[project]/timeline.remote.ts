import { prisma } from "#lib/server/database.ts";
import { accessChecker, accessibleTimelines, authorize } from "#lib/server/org-access.ts";
import { query } from "$app/server";

import * as valibot from "valibot";

export const getTimelines = query(valibot.string(), async (projectId) => {
	const { member } = await authorize("project", "read", { type: "project", id: projectId });
	const project = await prisma.project.findUniqueOrThrow({
		where: { id: projectId },
		select: { name: true },
	});
	const timelines = await prisma.timeline.findMany({
		where: {
			projectId,
			...accessibleTimelines(member),
		},
		include: {
			exports: {
				include: {
					media: true,
				},
				orderBy: {
					createdAt: "desc",
				},
				take: 1,
			},
		},
	});
	const allowed = await accessChecker(member);
	return {
		projectName: project.name,
		canCreate: allowed("timeline", "create", { projectId }),
		timelines: timelines.map((t) => ({
			...t,
			canRename: allowed("timeline", "rename", { projectId, timelineId: t.id }),
			canDelete: allowed("timeline", "delete", { projectId, timelineId: t.id }),
			canShare: allowed("grant", "create", { projectId, timelineId: t.id }),
			canShareLink: allowed("shareLink", "create", { projectId, timelineId: t.id }),
		})),
	};
});
