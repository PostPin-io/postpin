import { prisma } from "#lib/server/database.ts";
import { getRequestEvent, command } from "$app/server";
import * as Valibot from "valibot";

export const renameExport = command(
	Valibot.object({
		id: Valibot.string(),
		name: Valibot.pipe(
			Valibot.string(),
			Valibot.trim(),
			Valibot.minLength(1),
			Valibot.maxLength(100),
		),
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
