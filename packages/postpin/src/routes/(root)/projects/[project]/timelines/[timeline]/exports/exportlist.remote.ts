import { prisma } from "#lib/server/database.ts";
import { accessChecker, accessibleExports, authorize } from "#lib/server/org-access.ts";
import { query } from "$app/server";

import * as valibot from "valibot";

export const getTimelineName = query(valibot.string(), async (timelineId) => {
	await authorize("timeline", "read", { type: "timeline", id: timelineId });
	const timeline = await prisma.timeline.findUniqueOrThrow({
		where: { id: timelineId },
		select: { name: true },
	});
	return timeline.name;
});

export const getExportList = query(valibot.string(), async (timelineId) => {
	const { member, target } = await authorize("timeline", "read", {
		type: "timeline",
		id: timelineId,
	});
	const allowed = await accessChecker(member);
	const exports = await prisma.export.findMany({
		where: {
			timelineId,
			...accessibleExports(member),
		},
		include: {
			media: {
				include: {
					original: { select: { size: true } },
					proxies: { select: { height: true, size: true }, orderBy: { height: "desc" } },
				},
			},
		},
		orderBy: {
			createdAt: "desc",
		},
	});

	return exports.map(({ media, ...e }) => ({
		...e,
		media: media && { id: media.id, status: media.status },
		storage: media && storageOf(media),
		canRename: allowed("export", "rename", { projectId: target.projectId, timelineId }),
		canDelete: allowed("export", "delete", { projectId: target.projectId, timelineId }),
	}));
});

type StoredMedia = {
	original: { size: bigint | null };
	proxies: { height: number | null; size: bigint | null }[];
	thumbnailSize: bigint | null;
	seekSpritesSize: bigint | null;
	shotThumbnailsSize: bigint | null;
};

/** Bytes per file of an export's media, for the size info in the list. */
function storageOf(media: StoredMedia) {
	const images =
		(media.thumbnailSize ?? 0n) + (media.seekSpritesSize ?? 0n) + (media.shotThumbnailsSize ?? 0n);
	const files = [
		{ label: "Original", size: media.original.size ?? 0n },
		...media.proxies.map((p) => ({ label: `Proxy ${p.height ?? "?"}p`, size: p.size ?? 0n })),
		{ label: "Images", size: images },
	];
	return { files, total: files.reduce((sum, f) => sum + f.size, 0n) };
}
