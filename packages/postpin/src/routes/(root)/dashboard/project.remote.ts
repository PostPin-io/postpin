import { prisma } from "#lib/server/database.ts";
import { getRequestEvent, query } from "$app/server";
import * as valibot from "valibot";

export const getProjects = query(async () => {
	const projects = await prisma.project.findMany({
		include: {
			timelines: {
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
			},
		},
	});

	return projects;
});
