import { prisma } from "#lib/server/database.ts";
import { deleteMediaFolders, purgeExports } from "#lib/server/media.ts";
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

	const mediaIds = await prisma.$transaction(async (tx) => {
		const ids = await purgeExports(tx, { id: data.id });
		// exports without media are not removed by purgeExports
		await tx.export.deleteMany({ where: { id: data.id } });
		return ids;
	});

	await deleteMediaFolders(mediaIds, `deleteExport ${data.id}`);
});
