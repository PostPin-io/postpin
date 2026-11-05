import { prisma } from "#lib/server/database.ts";
import { accessibleTimelines, authorize } from "#lib/server/org-access.ts";
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

	return timelines;
});
