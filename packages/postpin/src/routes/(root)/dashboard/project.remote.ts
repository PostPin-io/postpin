import { prisma } from "#lib/server/database.ts";
import { getRequestEvent, query } from "$app/server";

export const getProjects = query(async () => {
	const { user, session } = getRequestEvent().locals;
	const organizationId = session?.activeOrganizationId;
	if (!user || !organizationId) return [];

	const projects = await prisma.project.findMany({
		where: {
			organizationId,
			organization: { members: { some: { userId: user.id } } },
		},
	});

	return projects;
});
