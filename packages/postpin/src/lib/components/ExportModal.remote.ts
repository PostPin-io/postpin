import { prisma } from "#lib/server/database.ts";
import { deleteMediaFiles } from "#lib/server/media.ts";
import { authorize } from "#lib/server/org-access.ts";
import { command } from "$app/server";
import * as v from "valibot";

export const renameExport = command(
	v.object({
		id: v.string(),
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
	}),
	async (data) => {
		await authorize("export", "rename", { type: "export", id: data.id });

		await prisma.export.update({
			where: { id: data.id },
			data: {
				name: data.name,
			},
		});
	},
);

export const deleteExport = command(v.object({ id: v.string() }), async (data) => {
	await authorize("export", "delete", { type: "export", id: data.id });

	const exp = await prisma.export.findUniqueOrThrow({
		where: { id: data.id },
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
