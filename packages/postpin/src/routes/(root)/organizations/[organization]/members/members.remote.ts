import { prisma } from "#lib/server/database.ts";
import { query } from "$app/server";
import * as v from "valibot";

export const getOrg = query(v.string(), async (slug) => {
	return await prisma.organization.findUniqueOrThrow({
		where: { slug },
		include: {
			members: {
				include: {
					user: { select: { id: true, name: true, email: true } },
				},
			},
			invitations: true,
		},
	});
});
