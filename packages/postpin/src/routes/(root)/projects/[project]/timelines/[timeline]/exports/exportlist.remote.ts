import { prisma } from "#lib/server/database.ts";
import { accessibleExports, authorize } from "#lib/server/org-access.ts";
import { query } from "$app/server";

import * as valibot from "valibot";

export const getExportList = query(valibot.string(), async (timelineId) => {
	const { member } = await authorize("timeline", "read", { type: "timeline", id: timelineId });
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

	return exports;
});
