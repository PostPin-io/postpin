import { prisma } from "#lib/server/database.ts";
import { error } from "@sveltejs/kit";
import { command, getRequestEvent, query } from "$app/server";
import * as v from "valibot";
import { roleAllows } from "#lib/roles.ts";
import { authorize } from "#lib/server/org-access.ts";
import { Prisma } from "@postpin-io/shared/db";

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
	if (!roleAllows(role, "organization", "updateSettings")) {
		error(403, "Only owners and admins can change organization settings");
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { members: _, ...rest } = organization;
	return { ...rest, canRename: roleAllows(role, "organization", "rename") };
});

export const renameOrganization = command(
	v.object({
		organizationId: v.string(),
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
		slug: v.pipe(v.string(), v.minLength(1), v.maxLength(100), v.regex(/^[a-z0-9-]+$/)),
	}),
	async ({ organizationId, name, slug }) => {
		await authorize("organization", "rename", { type: "organization", id: organizationId });
		try {
			await prisma.organization.update({ where: { id: organizationId }, data: { name, slug } });
		} catch (err) {
			// the client picks a free slug, but someone else may have taken it in the meantime
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
				error(409, "This URL is already taken, please try again");
			}
			throw err;
		}
	},
);
