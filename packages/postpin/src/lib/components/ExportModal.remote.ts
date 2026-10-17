import { prisma } from "#lib/server/database.ts";
import { getRequestEvent, command } from "$app/server";
import * as v from "valibot";

export const renameExport = command(
	v.object({
		id: v.string(),
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
	}),
	async (data) => {
		const event = getRequestEvent();
		const currentOrganizationId = event.locals.session!.activeOrganizationId!;

		await prisma.export.update({
			where: {
				id: data.id,
				timeline: {
					project: { organizationId: currentOrganizationId },
				},
			},
			data: {
				name: data.name,
			},
		});
	},
);
