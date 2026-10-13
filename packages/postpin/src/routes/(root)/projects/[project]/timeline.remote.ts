import { prisma } from "#lib/server/database.ts";
import { query } from "$app/server";

import * as valibot from "valibot";

export const getTimelines = query(valibot.string(), async (projectId) => {
	const timelines = await prisma.timeline.findMany({
		where: {
			projectId,
		},
	});

	return timelines;
});
