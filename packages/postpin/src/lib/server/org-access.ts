import { prisma } from "#lib/server/database.ts";
import { error } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import { can, hasRole, type OrgRole } from "#lib/roles.ts";
import { hasMediaAccess } from "@postpin-io/shared/auth/permissions";

async function requireMember(organizationId: string) {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");

	const member = await prisma.member.findFirst({ where: { organizationId, userId: user.id } });
	if (!member) error(404, "Organization not found");
	return member;
}

export async function requireMediaAccess(mediaId: string) {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");
	if (!(await hasMediaAccess(prisma, user, mediaId))) error(404, "Media not found");
}

/** For checks about who someone is, e.g. "only owners can invite owners". */
export async function requireOrgRole(organizationId: string, roles: OrgRole[]) {
	const member = await requireMember(organizationId);
	if (!hasRole(member.role, roles)) error(403, "Not allowed");
	return member;
}

/** For checks about what someone may do, e.g. `{ project: ["upload"] }`. */
export async function requireOrgPermission(
	organizationId: string,
	permissions: Parameters<typeof can>[1],
) {
	const member = await requireMember(organizationId);
	if (!can(member.role, permissions)) error(403, "Not allowed");
	return member;
}
