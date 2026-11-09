import { prisma } from "#lib/server/database.ts";
import {
	accessChecker,
	accessibleProjects,
	accessibleTimelines,
	getActiveMember,
} from "#lib/server/org-access.ts";
import { query } from "$app/server";

export const getProjects = query(async () => {
	const member = await getActiveMember();
	if (!member) return { canCreate: false, projects: [] };

	const allowed = await accessChecker(member);

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

	return {
		canCreate: allowed("project", "create", { projectId: null }),
		projects: projects.map((p) => ({
			...p,
			canRename: allowed("project", "rename", { projectId: p.id }),
			canDelete: allowed("project", "delete", { projectId: p.id }),
			canShare: allowed("grant", "create", { projectId: p.id }),
		})),
	};
});
