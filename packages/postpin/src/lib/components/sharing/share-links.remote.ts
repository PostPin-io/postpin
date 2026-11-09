import { error } from "@sveltejs/kit";
import { command, query } from "$app/server";
import * as v from "valibot";
import {
	expiresAtFor,
	shareLinkNote,
	shareLinkPreset,
	shareLinkStatus,
} from "@postpin-io/shared/logic/share-links";
import { prisma } from "#lib/server/database.ts";
import { accessChecker, authorize } from "#lib/server/org-access.ts";
import { ensureGuestCategory, newShareToken } from "#lib/server/share-links.ts";

export const getShareLinks = query(v.string(), async (exportId: string) => {
	const { member, target } = await authorize("shareLink", "read", { type: "export", id: exportId });
	const allowed = await accessChecker(member);

	const links = await prisma.shareLink.findMany({
		where: { exportId },
		orderBy: { createdAt: "desc" },
		include: { creator: { select: { id: true, name: true } } },
	});

	return links.map((link) => {
		const t = {
			projectId: target.projectId,
			timelineId: target.timelineId,
			ownerId: link.creatorId,
		};
		const status = shareLinkStatus(link);
		return {
			...link,
			status,
			canUpdate: status !== "revoked" && allowed("shareLink", "update", t),
			canRevoke: status !== "revoked" && allowed("shareLink", "delete", t),
		};
	});
});

export const createShareLink = command(
	v.object({
		exportId: v.string(),
		preset: shareLinkPreset,
		timelinePanelVisible: v.optional(v.boolean(), false),
		markerPanelVisible: v.optional(v.boolean(), true),
		note: v.optional(shareLinkNote),
	}),
	async (data) => {
		const { user, target } = await authorize("shareLink", "create", {
			type: "export",
			id: data.exportId,
		});

		const link = await prisma.$transaction(async (tx) => {
			await ensureGuestCategory(tx, target.projectId!);
			return tx.shareLink.create({
				data: {
					exportId: data.exportId,
					creatorId: user.id,
					token: newShareToken(),
					expiresAt: expiresAtFor(data.preset),
					timelinePanelVisible: data.timelinePanelVisible,
					markerPanelVisible: data.markerPanelVisible,
					note: data.note ?? null,
				},
			});
		});

		await getShareLinks(data.exportId).refresh();
		return { id: link.id, token: link.token };
	},
);

/** Only the fields given change. A new preset counts from now, so an expired link can be renewed. */
export const updateShareLink = command(
	v.object({
		id: v.string(),
		preset: v.optional(shareLinkPreset),
		timelinePanelVisible: v.optional(v.boolean()),
		markerPanelVisible: v.optional(v.boolean()),
		note: v.optional(v.nullable(shareLinkNote)),
	}),
	async ({ id, preset, note, ...panels }) => {
		await authorize("shareLink", "update", { type: "shareLink", id });

		const { exportId } = await prisma.shareLink.findUniqueOrThrow({
			where: { id },
			select: { exportId: true },
		});
		// revokedAt: null in the WHERE, so a revoke in between can't be undone
		const { count } = await prisma.shareLink.updateMany({
			where: { id, revokedAt: null },
			data: {
				...panels,
				...(note !== undefined && { note }),
				...(preset && { expiresAt: expiresAtFor(preset) }),
			},
		});
		if (count === 0) error(409, "Link was revoked");

		await getShareLinks(exportId).refresh();
	},
);

/** Final: a revoked link can't be renewed. Revoking twice keeps the first time. */
export const revokeShareLink = command(v.object({ id: v.string() }), async ({ id }) => {
	await authorize("shareLink", "delete", { type: "shareLink", id });

	const { exportId } = await prisma.shareLink.findUniqueOrThrow({
		where: { id },
		select: { exportId: true },
	});
	await prisma.shareLink.updateMany({
		where: { id, revokedAt: null },
		data: { revokedAt: new Date() },
	});

	await getShareLinks(exportId).refresh();
});
