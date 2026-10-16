import { prisma } from "#lib/server/database.ts";
import { error } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";

export type OrgRole = "owner" | "admin" | "member";

export async function requireOrgRole(organizationId: string, roles: OrgRole[]) {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");

	const member = await prisma.member.findFirst({ where: { organizationId, userId: user.id } });
	if (!member) error(404, "Organization not found");
	if (!roles.includes(member.role as OrgRole)) error(403, "Not allowed");
	return member;
}
