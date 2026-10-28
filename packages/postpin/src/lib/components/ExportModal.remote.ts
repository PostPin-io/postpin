import { prisma } from "#lib/server/database.ts";
import { deleteMediaFiles } from "#lib/server/media.ts";
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

export const deleteExport = command(v.object({ id: v.string() }), async (data) => {
	const event = getRequestEvent();
	const currentOrganizationId = event.locals.session?.activeOrganizationId;
	if (!currentOrganizationId) throw new Error("No active organization");

	const exp = await prisma.export.findFirstOrThrow({
		where: {
			id: data.id,
			timeline: { project: { organizationId: currentOrganizationId } },
		},
		select: { mediaId: true },
	});

	if (exp.mediaId) {
		// Deleting the media cascades to the export and the proxy media
		await prisma.media.delete({ where: { id: exp.mediaId } });
		await deleteMediaFiles(exp.mediaId);
	} else {
		await prisma.export.delete({ where: { id: data.id } });
	}
});
