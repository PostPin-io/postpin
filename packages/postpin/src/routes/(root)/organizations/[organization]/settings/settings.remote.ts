import { prisma } from "#lib/server/database.ts";
import { error } from "@sveltejs/kit";
import { command, getRequestEvent, query } from "$app/server";
import * as v from "valibot";
import { roleAllows } from "#lib/roles.ts";
import { authorize } from "#lib/server/org-access.ts";
import { deleteMediaFolders, purgeExports } from "#lib/server/media.ts";
import { Prisma } from "@postpin-io/shared/db";
import { getProjectStorageUsage } from "@postpin-io/shared/db/sql";
import { orgQuota, storageUsageRows, sumBy, totalUsed } from "#lib/server/storage-usage.ts";

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
	return {
		...rest,
		canRename: roleAllows(role, "organization", "rename"),
		canDelete: roleAllows(role, "organization", "delete"),
	};
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

export const deleteOrganization = command(
	v.object({
		organizationId: v.string(),
		/** The user types the org name, so a stray click or script can't delete it */
		confirmName: v.string(),
	}),
	async ({ organizationId, confirmName }) => {
		await authorize("organization", "delete", { type: "organization", id: organizationId });

		const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
		if (confirmName.trim() !== org.name) error(400, "The name doesn't match");

		// DB first: if the bucket cleanup fails halfway, nothing in the app points at missing files.
		// Markers must go before the cascade, see purgeExports().
		const mediaIds = await prisma.$transaction(async (tx) => {
			const ids = await purgeExports(tx, { timeline: { project: { organizationId } } });
			await tx.organization.delete({ where: { id: organizationId } }); // cascades the rest
			return ids;
		});

		await deleteMediaFolders(mediaIds, `deleteOrganization ${organizationId}`);
	},
);

export const getOrganizationStorage = query(v.string(), async (organizationId) => {
	await authorize("organization", "updateSettings", { type: "organization", id: organizationId });
	const [org, rows, projects] = await Promise.all([
		prisma.organization.findUniqueOrThrow({
			where: { id: organizationId },
			select: { storageQuota: true },
		}),
		storageUsageRows({ orgId: organizationId }),
		prisma.$queryRawTyped(getProjectStorageUsage(organizationId)),
	]);
	const byUser = sumBy(rows, "userId");
	const users = await prisma.user.findMany({
		where: { id: { in: [...byUser.keys()] } },
		select: { id: true, name: true },
	});
	return {
		used: totalUsed(rows),
		quota: orgQuota(org.storageQuota),
		projects: projects.map((p) => ({ ...p, used: p.used ?? 0n })),
		uploaders: users
			.map((u) => ({ ...u, used: byUser.get(u.id) ?? 0n }))
			.sort((a, b) => (b.used > a.used ? 1 : b.used < a.used ? -1 : 0)),
		// exports from before uploads were attributed, or whose uploader was deleted
		unattributed: totalUsed(rows.filter((r) => !r.userId)),
	};
});
