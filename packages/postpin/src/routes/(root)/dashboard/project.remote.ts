import { prisma } from "#lib/server/database.ts";
import {
	accessibleProjects,
	accessibleTimelines,
	getActiveMember,
} from "#lib/server/org-access.ts";
import { query } from "$app/server";

export const getProjects = query(async () => {
	const member = await getActiveMember();
	if (!member) return [];
	const projects = await prisma.project.findMany({
		where: accessibleProjects(member),
		include: {
			timelines: {
				where: accessibleTimelines(member),
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
