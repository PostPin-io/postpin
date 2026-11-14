import { prisma } from "#lib/server/database.ts";
import { authorize } from "#lib/server/org-access.ts";
import { getRequestEvent, command } from "$app/server";
import * as v from "valibot";
import { isOrgWide } from "#lib/roles.ts";
import { deleteMediaFolders, purgeExports } from "#lib/server/media.ts";
import { error } from "@sveltejs/kit";

export const createProject = command(
	v.object({
		name: v.string(),
	}),
	async (data) => {
		const { session } = getRequestEvent().locals;
		if (!session) error(401, "Not signed in");
		if (!session.activeOrganizationId) error(400, "No active organization");

		const { user, member } = await authorize("project", "create", {
			type: "organization",
			id: session.activeOrganizationId,
		});

		await prisma.project.create({
			data: {
				name: data.name,
				creatorId: user.id,
				organizationId: member.organizationId,
				...(!isOrgWide(member.role) && {
					memberGrants: { create: { memberId: member.id, createdById: user.id } },
				}),
			},
		});
	},
);
export const deleteProject = command(
	v.object({
		id: v.string(),
	}),
	async (data) => {
		const { target } = await authorize("project", "delete", { type: "project", id: data.id });

		const mediaIds = await prisma.$transaction(async (tx) => {
			const ids = await purgeExports(tx, { timeline: { projectId: data.id } });

			await tx.project.delete({ where: { id: data.id, organizationId: target.organizationId } });
			return ids;
		});

		await deleteMediaFolders(mediaIds, `deleteProject ${data.id}`);
	},
);

export const renameProject = command(
	v.object({
		id: v.string(),
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
	}),
	async (data) => {
		await authorize("project", "rename", { type: "project", id: data.id });

		await prisma.project.update({
			where: { id: data.id },
			data: {
				name: data.name,
			},
		});
	},
);
