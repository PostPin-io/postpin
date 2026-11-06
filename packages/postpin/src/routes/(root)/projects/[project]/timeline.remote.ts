import { prisma } from "#lib/server/database.ts";
import { accessChecker, accessibleTimelines, authorize } from "#lib/server/org-access.ts";
import { query } from "$app/server";

import * as valibot from "valibot";

export const getTimelines = query(valibot.string(), async (projectId) => {
	const { member } = await authorize("project", "read", { type: "project", id: projectId });
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
		canCreate: allowed("timeline", "create", { projectId }),
		timelines: timelines.map((t) => ({
			...t,
			canRename: allowed("timeline", "rename", { projectId, timelineId: t.id }),
			canDelete: allowed("timeline", "delete", { projectId, timelineId: t.id }),
		})),
	};
});
