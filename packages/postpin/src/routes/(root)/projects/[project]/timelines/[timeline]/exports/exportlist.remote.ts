import { prisma } from "#lib/server/database.ts";
import { query } from "$app/server";

import * as valibot from "valibot";

export const getExportList = query(valibot.string(), async (timelineId) => {
	const exports = await prisma.export.findMany({
		where: {
			timelineId,
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
