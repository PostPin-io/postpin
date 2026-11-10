import { error } from "@sveltejs/kit";
import { prisma } from "#lib/server/database.ts";
import { roleAllows } from "#lib/roles.ts";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ params, locals }) => {
	if (!locals.user) error(401, "Not signed in");

	const member = await prisma.member.findFirst({
		where: { userId: locals.user.id, organization: { slug: params.organization } },
		select: { role: true },
	});
	if (!member) error(404, "Organization not found");

	return { canEditSettings: roleAllows(member.role, "organization", "updateSettings") };
};
