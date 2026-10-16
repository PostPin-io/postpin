import { prisma } from "#lib/server/database.ts";
import { error } from "@sveltejs/kit";
import { getRequestEvent, query } from "$app/server";
import * as v from "valibot";

const MANAGER_ROLES = ["owner", "admin"];

export const getOrganizationSettings = query(v.string(), async (slug) => {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");

	const organization = await prisma.organization.findUnique({
		where: { slug },
		select: {
			id: true,
			name: true,
			slug: true,
			createdAt: true,
			members: { where: { userId: user.id }, select: { role: true } },
		},
	});

	const role = organization?.members[0]?.role;
	if (!organization || !role) error(404, "Organization not found");
	// a member can hold several roles, stored comma-separated
	if (!role.split(",").some((r) => MANAGER_ROLES.includes(r.trim()))) {
		error(403, "Only owners and admins can change organization settings");
	}

	const { members: _, ...rest } = organization;
	return rest;
});
