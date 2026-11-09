import { prisma } from "#lib/server/database.ts";
import { accessChecker, accessibleExports, authorize } from "#lib/server/org-access.ts";
import { query } from "$app/server";

import * as valibot from "valibot";

export const getTimelineName = query(valibot.string(), async (timelineId) => {
	await authorize("timeline", "read", { type: "timeline", id: timelineId });
	const timeline = await prisma.timeline.findUniqueOrThrow({
		where: { id: timelineId },
		select: { name: true },
	});
	return timeline.name;
});

export const getExportList = query(valibot.string(), async (timelineId) => {
	const { member, target } = await authorize("timeline", "read", {
		type: "timeline",
		id: timelineId,
	});
	const allowed = await accessChecker(member);
	const exports = await prisma.export.findMany({
		where: {
			timelineId,
			...accessibleExports(member),
		},
		include: {
			media: true,
		},
		orderBy: {
			createdAt: "desc",
		},
	});

	return exports.map((e) => ({
		...e,
		canRename: allowed("export", "rename", { projectId: target.projectId, timelineId }),
		canDelete: allowed("export", "delete", { projectId: target.projectId, timelineId }),
	}));
});
